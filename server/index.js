/* Atlas — sunucu.
   Siteyi (/), yönetim panelini (/admin/) ve API'yi (/api/) tek süreçte sunar.
   Çalıştırma: npm start  →  http://localhost:3000 */
'use strict';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, getSettings, getContent, UPLOADS } = require('./db');
const { isSecure } = require('./auth');
const api = require('./api');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// isteğe bağlı: panel ve yönetim API'si yalnızca bu IP'lerden açılır (örn. klinik ağı) — "1.2.3.4,5.6.7.8"
const ADMIN_IPS = (process.env.ADMIN_ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const PUBLIC_DIRS = ['/assets/', '/admin/'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Ana sayfa ──────────────────────────────────────────────────────
   Panelde yapılan metin, iletişim ve hekim değişiklikleri sayfaya sunucuda gömülür,
   böylece ziyaretçi eski metni bir an bile görmez. */
function teamHtml(docs) {
  return docs.map((d, i) => {
    const full = d.title + ' ' + d.name;
    const initials = d.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
    const ph = d.photo
      ? '<img src="' + esc(d.photo) + '" alt="' + esc(full) + '" loading="lazy" decoding="async" width="600" height="750">'
      : '<span class="doc__ini" aria-hidden="true">' + esc(initials) + '</span>';
    return '<article class="doc" data-doctor="' + d.id + '" data-reveal style="--d:' + (i % 3) * 0.08 + 's">' +
      '<figure class="doc__ph">' + ph + '</figure>' +
      '<div class="doc__b"><p class="doc__sp">' + esc(d.specialty) + '</p><h3>' + esc(full) + '</h3>' +
      (d.bio ? '<p class="doc__bio" data-bio-tr="' + esc(d.bio) + '" data-bio-en="' + esc(d.bio_en) + '" data-bio-de="' + esc(d.bio_de) + '">' + esc(d.bio) + '</p>' : '') +
      '</div></article>';
  }).join('');
}

function renderIndex(nonce) {
  const st = getSettings();
  const docs = db.prepare('SELECT id, title, name, specialty, bio, bio_en, bio_de, photo FROM doctors WHERE active = 1 AND on_site = 1 ORDER BY sort, id').all();
  const data = {
    api: '/api/public',
    content: getContent(),
    clinic: { phone: st.phone_display, tel: st.phone_e164, wa: st.whatsapp },
    booking: !!st.booking_enabled
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (docs.length) {
    html = html.replace(/ data-team hidden/g, ' data-team').replace('<div class="team__grid" data-team-grid></div>', '<div class="team__grid" data-team-grid>' + teamHtml(docs) + '</div>');
  }
  return html.replace('<script defer src="assets/js/scene.js">', '<script nonce="' + nonce + '">window.ATLAS=' + json + '</script>\n<script defer src="assets/js/scene.js">');
}

/* ── Güvenlik başlıkları ───────────────────────────────────────────── */
function baseHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
const SITE_CSP = (nonce) => "default-src 'self'; script-src 'self' 'nonce-" + nonce + "'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src https://www.google.com; connect-src 'self'; " +
  "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";
const ADMIN_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store'
};
const UPLOAD_HEADERS = { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'public, max-age=86400' };

function serveFile(res, file, extraHeaders) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }, extraHeaders));
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  baseHeaders(req, res);
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
  let url, p;
  try { url = new URL(req.url, 'http://local'); p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.includes('\0')) { res.writeHead(400); return res.end(); }

  const adminArea = p === '/admin' || p.startsWith('/admin/') || (p.startsWith('/api/') && !p.startsWith('/api/public/'));
  if (adminArea && ADMIN_IPS.length && !ADMIN_IPS.includes(ip.replace(/^::ffff:/, ''))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı');
  }

  if (p.startsWith('/api/')) return api.handle(req, res, url, ip);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }

  if (p === '/' || p === '/index.html') {
    const nonce = crypto.randomBytes(16).toString('base64');
    const body = renderIndex(nonce);
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': SITE_CSP(nonce), 'X-Frame-Options': 'SAMEORIGIN' });
    return res.end(body);
  }
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (p === '/admin/') return serveFile(res, path.join(ROOT, 'admin', 'index.html'), ADMIN_HEADERS);
  if (p === '/favicon.ico') return serveFile(res, path.join(ROOT, 'assets', 'img', 'favicon.svg'));
  if (/^\/uploads\/doctors\/[\w-]+\.(jpg|png|webp|svg)$/.test(p)) return serveFile(res, path.join(UPLOADS, 'doctors', path.basename(p)), UPLOAD_HEADERS);

  // yalnızca izinli klasörler; ../ ile dışarı çıkılamaz
  const file = path.normalize(path.join(ROOT, p));
  const rel = '/' + path.relative(ROOT, file).split(path.sep).join('/');
  if (!PUBLIC_DIRS.some((d) => rel.startsWith(d))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı');
  }
  serveFile(res, file, rel.startsWith('/admin/') ? ADMIN_HEADERS : null);
});

// yavaş/yarım istekler bağlantıyı uzun süre tutamasın
server.requestTimeout = 30e3;
server.headersTimeout = 20e3;
server.keepAliveTimeout = 5e3;
server.maxHeadersCount = 60;

server.listen(PORT, () => {
  console.log('Atlas çalışıyor →  site: http://localhost:' + PORT + '/   panel: http://localhost:' + PORT + '/admin/');
});
