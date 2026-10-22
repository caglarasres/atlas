/* Atlas — oturum, parola ve iki adımlı doğrulama.
   Parolalar scrypt ile tuzlanıp saklanır; oturum çerezi yalnızca rastgele bir anahtardır,
   veritabanında bunun SHA-256 özeti durur. Oturum 30 dk hareketsizlikte, en geç 12 saatte biter.
   İki adımlı doğrulama: RFC 6238 TOTP (Google Authenticator, Microsoft Authenticator vb.). */
'use strict';

const crypto = require('node:crypto');
const { q } = require('./db');

const TTL = 12 * 3600 * 1000;          // mutlak süre
const IDLE = 30 * 60 * 1000;           // hareketsizlik süresi

/* HTTPS'te çerez __Host- önekiyle: yalnızca bu alan adı, yalnızca güvenli bağlantı, Path=/ */
const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted || process.env.COOKIE_SECURE === '1';
const cookieName = (req) => (isSecure(req) ? '__Host-atlas_sid' : 'atlas_sid');

/* ── Parola ────────────────────────────────────────────────────────── */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, SCRYPT);
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, SCRYPT);
  return crypto.timingSafeEqual(want, got);
}
// kullanıcı yoksa da aynı süre harcansın: e-postanın varlığı zamanlamadan anlaşılmasın
const DUMMY = hashPassword(crypto.randomBytes(12).toString('hex'));

/* NIST SP 800-63B: uzunluk + yaygın parola listesi; karmaşıklık kuralı dayatılmaz */
const COMMON = new Set(['123456789012', 'password1234', 'parola123456', 'qwertyuiopas', 'atlasdent123', 'atlas1234567',
  'sifre1234567', 'şifre1234567', 'admin1234567', 'administrator', 'kahramanmaras', 'passwordpassword', '111111111111', '000000000000',
  'abcdefghijkl', 'qwerty123456', 'iloveyou1234', 'welcome12345', 'letmein12345', 'zirkonyum123', 'disklinigi12']);
function passwordProblem(pw, email) {
  pw = String(pw || '');
  if (pw.length < 12) return 'Parola en az 12 karakter olmalı.';
  if (pw.length > 200) return 'Parola çok uzun.';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw) || /^(0123456789|1234567890|abcdefghij)/.test(low)) return 'Bu parola çok yaygın; daha tahmin edilemez bir parola seçin.';
  const local = String(email || '').toLowerCase().split('@')[0];
  if (local.length >= 4 && low.includes(local)) return 'Parola e-posta adresinizi içermemeli.';
  return null;
}

/* ── Oturum ────────────────────────────────────────────────────────── */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function createSession(userId, ip) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await q.run('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?', now, now - IDLE);
  await q.run('INSERT INTO sessions (token_hash, user_id, expires_at, last_seen, ip) VALUES (?, ?, ?, ?, ?)', sha(token), userId, now + TTL, now, ip || '');
  await q.run("UPDATE users SET last_login = datetime('now') WHERE id = ?", userId);
  return token;
}
async function destroySession(token) { if (token) await q.run('DELETE FROM sessions WHERE token_hash = ?', sha(token)); }
async function destroyUserSessions(userId, exceptToken) {
  await q.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, exceptToken ? sha(exceptToken) : '');
}

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  if (!m) return '';
  try { return decodeURIComponent(m.slice(name.length + 1)); } catch { return ''; }
}
const sessionToken = (req) => readCookie(req, cookieName(req));

/* touch=false: panelin arka plan yenilemeleri hareketsizlik süresini uzatmaz */
async function userFromRequest(req, touch) {
  const token = sessionToken(req);
  if (!token) return null;
  const now = Date.now();
  const row = await q.get(`SELECT u.id, u.name, u.email, u.role, u.doctor_id, u.active, u.totp_enabled, s.last_seen FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND s.last_seen > ?`, sha(token), now, now - IDLE);
  if (!row || !row.active) return null;
  if (touch && now - row.last_seen > 30e3) await q.run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', now, sha(token));
  return { id: row.id, name: row.name, email: row.email, role: row.role, doctor_id: row.doctor_id, totp_enabled: !!row.totp_enabled };
}

function cookieHeader(req, token, maxAgeMs) {
  return cookieName(req) + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + Math.floor(maxAgeMs / 1000) + (isSecure(req) ? '; Secure' : '');
}

/* ── TOTP (RFC 6238) ───────────────────────────────────────────────── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const newTotpSecret = () => b32encode(crypto.randomBytes(20));
/* ±1 adım (30 sn) kaymaya izin verir; aynı kod ikinci kez kullanılamaz. Eşleşen adımı döndürür. */
function verifyTotp(secret, code, lastStep) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return 0;
  const step = Math.floor(Date.now() / 30000);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= (lastStep || 0)) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(code))) return s;
  }
  return 0;
}

/* Parola doğrulandı, kod bekleniyor: 5 dakikalık tek kullanımlık bilet.
   Veritabanında tutulur: sunucusuz ortamda iki istek farklı sunuculara düşebilir. */
async function mfaTicket(userId) {
  const t = crypto.randomBytes(24).toString('base64url');
  await q.run('DELETE FROM mfa_tickets WHERE expires_at < ?', Date.now());
  await q.run('INSERT INTO mfa_tickets (hash, user_id, expires_at) VALUES (?, ?, ?)', sha(t), userId, Date.now() + 5 * 60e3);
  return t;
}
async function useTicket(t) {
  const k = sha(String(t || ''));
  await q.run('UPDATE mfa_tickets SET tries = tries + 1 WHERE hash = ?', k);
  const v = await q.get('SELECT * FROM mfa_tickets WHERE hash = ?', k);
  if (!v || v.expires_at < Date.now() || v.tries > 5) { await q.run('DELETE FROM mfa_tickets WHERE hash = ?', k); return null; }
  return { userId: v.user_id, done: () => q.run('DELETE FROM mfa_tickets WHERE hash = ?', k) };
}

/* ── Deneme sınırı (veritabanında; tüm sunucu örnekleri aynı sayacı görür) ── */
async function limited(key, max, windowMs) {
  const now = Date.now();
  if (Math.random() < 0.02) await q.run('DELETE FROM rate_limits WHERE reset_at < ?', now);
  await q.run(`INSERT INTO rate_limits (key, n, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET n = CASE WHEN reset_at < ? THEN 1 ELSE n + 1 END,
    reset_at = CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END`, key, now + windowMs, now, now);
  const r = await q.get('SELECT n FROM rate_limits WHERE key = ?', key);
  return r.n > max;
}

module.exports = {
  TTL, IDLE, isSecure, hashPassword, checkPassword, DUMMY, passwordProblem,
  createSession, destroySession, destroyUserSessions, sessionToken, userFromRequest, cookieHeader,
  newTotpSecret, verifyTotp, mfaTicket, useTicket, limited
};
