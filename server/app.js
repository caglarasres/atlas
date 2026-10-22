/* Atlas — istek işleyici.
   Siteyi (/), yönetim panelini (/admin/), yüklenen görselleri (/uploads/) ve API'yi (/api/) sunar.
   Yerelde server/index.js bunu bir HTTP sunucusuna bağlar; Vercel'de api/index.js aynı işleyiciyi çağırır. */
'use strict';

process.env.TZ = 'Europe/Istanbul';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { q, ready, getSettings, getContent, getFile } = require('./db');
const { isSecure } = require('./auth');
const api = require('./api');

const ROOT = path.join(__dirname, '..');
const ON_VERCEL = !!process.env.VERCEL;
const TRUST_PROXY = ON_VERCEL || process.env.TRUST_PROXY === '1';
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

let TEMPLATE = null;
async function renderIndex(nonce) {
  await ready();
  const [st, content, docs] = await Promise.all([
    getSettings(), getContent(),
    q.all('SELECT id, title, name, specialty, bio, bio_en, bio_de, photo FROM doctors WHERE active = 1 AND on_site = 1 ORDER BY sort, id')
  ]);
  const data = {
    api: '/api/public',
    content,
    clinic: { phone: st.phone_display, tel: st.phone_e164, wa: st.whatsapp },
    booking: !!st.booking_enabled
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  if (!TEMPLATE || !ON_VERCEL) TEMPLATE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let html = TEMPLATE;
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

function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bulunamadı'); }

function serveFile(res, file, extraHeaders) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }, extraHeaders));
    fs.createReadStream(file).pipe(res);
  });
}

async function handle(req, res) {
  baseHeaders(req, res);
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || '';
  let url, p;
  try { url = new URL(req.url, 'http://local'); p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.includes('\0')) { res.writeHead(400); return res.end(); }

  const adminArea = p === '/admin' || p.startsWith('/admin/') || (p.startsWith('/api/') && !p.startsWith('/api/public/'));
  if (adminArea && ADMIN_IPS.length && !ADMIN_IPS.includes(ip.replace(/^::ffff:/, ''))) return notFound(res);

  if (p.startsWith('/api/')) return api.handle(req, res, url, ip);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }

  try {
    if (p === '/' || p === '/index.html') {
      const nonce = crypto.randomBytes(16).toString('base64');
      const body = await renderIndex(nonce);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': SITE_CSP(nonce), 'X-Frame-Options': 'SAMEORIGIN' });
      return res.end(body);
    }
    const up = /^\/uploads\/doctors\/([\w-]+\.(jpg|png|webp|svg))$/.exec(p);
    if (up) {
      await ready();
      const f = await getFile('doctors/' + up[1]);
      if (!f) return notFound(res);
      res.writeHead(200, Object.assign({ 'Content-Type': f.mime, 'Content-Length': f.data.length }, UPLOAD_HEADERS));
      return res.end(f.data);
    }
  } catch (e) {
    console.error(new Date().toISOString(), req.method, p, e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Sunucu hatası');
  }

  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (p === '/admin/') return serveFile(res, path.join(ROOT, 'admin', 'index.html'), ADMIN_HEADERS);
  if (p === '/favicon.ico') return serveFile(res, path.join(ROOT, 'assets', 'img', 'favicon.svg'));

  // yalnızca izinli klasörler; ../ ile dışarı çıkılamaz
  const file = path.normalize(path.join(ROOT, p));
  const rel = '/' + path.relative(ROOT, file).split(path.sep).join('/');
  if (!PUBLIC_DIRS.some((d) => rel.startsWith(d))) return notFound(res);
  serveFile(res, file, rel.startsWith('/admin/') ? ADMIN_HEADERS : null);
}

module.exports = { handle, ADMIN_HEADERS };
