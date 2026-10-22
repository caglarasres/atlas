/* Atlas — veritabanı.
   Yerelde Node'un yerleşik SQLite'ı (data/atlas.db); Vercel'de Turso (uzak, SQLite uyumlu).
   TURSO_DATABASE_URL tanımlıysa Turso kullanılır. Arayüz her iki durumda da aynıdır ve asenkrondur:
     await q.get(sql, ...args)  → ilk satır | undefined
     await q.all(sql, ...args)  → satırlar
     await q.run(sql, ...args)  → { lastInsertRowid, changes }
     await q.tx(async (t) => …) → t aynı arayüz, tek işlem (transaction) içinde
     await q.batch([[sql, args], …]) → toplu yazma (örnek veri)
   Tüm saatler klinik saatiyle (Europe/Istanbul) 'YYYY-MM-DD HH:MM' metni olarak tutulur.
   Uzak bağlantıda yabancı anahtar zincirlemesine güvenilmez; silmeler kodda açıkça yapılır. */
'use strict';

const path = require('node:path');

const REMOTE = !!process.env.TURSO_DATABASE_URL;
const DATA_DIR = process.env.ATLAS_DATA || path.join(__dirname, '..', 'data');

/* ── Bağlantı ──────────────────────────────────────────────────────── */
function plain(res) {
  const cols = res.columns;
  return res.rows.map((r) => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
}
function wrapRemote(ex) {
  const exec = (sql, args) => ex.execute({ sql, args: args.map((a) => (a === undefined ? null : a)) });
  return {
    get: async (sql, ...a) => plain(await exec(sql, a))[0],
    all: async (sql, ...a) => plain(await exec(sql, a)),
    run: async (sql, ...a) => { const r = await exec(sql, a); return { lastInsertRowid: Number(r.lastInsertRowid || 0), changes: r.rowsAffected }; }
  };
}
function wrapLocal(d) {
  const norm = (a) => a.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x));
  return {
    get: async (sql, ...a) => d.prepare(sql).get(...norm(a)),
    all: async (sql, ...a) => d.prepare(sql).all(...norm(a)),
    run: async (sql, ...a) => { const r = d.prepare(sql).run(...norm(a)); return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes }; }
  };
}

let q;
if (REMOTE) {
  const { createClient } = require('@libsql/client/web');
  const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  q = wrapRemote(client);
  q.exec = (sql) => client.executeMultiple(sql);
  q.tx = async (fn) => {
    const t = await client.transaction('write');
    try { const r = await fn(wrapRemote(t)); await t.commit(); return r; }
    catch (e) { try { await t.rollback(); } catch {} throw e; }
    finally { t.close(); }
  };
  q.batch = async (stmts) => {
    for (let i = 0; i < stmts.length; i += 400) {
      await client.batch(stmts.slice(i, i + 400).map(([sql, args]) => ({ sql, args: args.map((a) => (a === undefined ? null : a)) })), 'write');
    }
  };
} else {
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, 'atlas.db'));
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  q = wrapLocal(d);
  q.exec = async (sql) => d.exec(sql);
  // tek bağlantı: işlem içindeki adımlar araya başka istek girmeden sırayla çalışır
  let chain = Promise.resolve();
  q.tx = (fn) => {
    const run = chain.then(async () => {
      d.exec('BEGIN IMMEDIATE');
      try { const r = await fn(q); d.exec('COMMIT'); return r; }
      catch (e) { d.exec('ROLLBACK'); throw e; }
    });
    chain = run.catch(() => {});
    return run;
  };
  q.batch = async (stmts) => q.tx(async () => { for (const [sql, args] of stmts) d.prepare(sql).run(...wrapArgs(args)); });
  const wrapArgs = (a) => a.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x));
}

/* ── Şema ──────────────────────────────────────────────────────────── */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','doctor')),
  doctor_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  totp_secret TEXT NOT NULL DEFAULT '',
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last INTEGER NOT NULL DEFAULT 0,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Dt.',
  specialty TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3f6454',
  slot_min INTEGER NOT NULL DEFAULT 30,
  hours TEXT NOT NULL DEFAULT '{}',
  online INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  bio_de TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  on_site INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price INTEGER,
  online INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS patients_phone ON patients(phone);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER,
  service_id INTEGER,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','arrived','done','cancelled','noshow')),
  source TEXT NOT NULL DEFAULT 'panel' CHECK (source IN ('online','panel','phone')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS appts_start ON appointments(start);
CREATE INDEX IF NOT EXISTS appts_doctor ON appointments(doctor_id, start);
CREATE INDEX IF NOT EXISTS appts_patient ON appointments(patient_id);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER,
  date TEXT NOT NULL,
  tooth TEXT NOT NULL DEFAULT '',
  procedure TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  fee INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  service_id INTEGER,
  cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS records_patient ON records(patient_id);
CREATE INDEX IF NOT EXISTS records_date ON records(date);
CREATE TABLE IF NOT EXISTS content (
  lang TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (lang, key)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS expenses_date ON expenses(date);
CREATE TABLE IF NOT EXISTS files (
  name TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mfa_tickets (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;

/* Önceki sürümlerden kalan yerel veritabanlarını yükseltir */
const COLUMNS = [
  ['doctors', 'bio', "TEXT NOT NULL DEFAULT ''"], ['doctors', 'bio_en', "TEXT NOT NULL DEFAULT ''"], ['doctors', 'bio_de', "TEXT NOT NULL DEFAULT ''"],
  ['doctors', 'photo', "TEXT NOT NULL DEFAULT ''"], ['doctors', 'on_site', 'INTEGER NOT NULL DEFAULT 1'],
  ['users', 'totp_secret', "TEXT NOT NULL DEFAULT ''"], ['users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'totp_last', 'INTEGER NOT NULL DEFAULT 0'], ['users', 'last_login', 'TEXT'],
  ['sessions', 'last_seen', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'ip', "TEXT NOT NULL DEFAULT ''"],
  ['services', 'cost', 'INTEGER NOT NULL DEFAULT 0'], ['records', 'service_id', 'INTEGER'], ['records', 'cost', 'INTEGER NOT NULL DEFAULT 0']
];

/* ── Varsayılanlar ─────────────────────────────────────────────────── */
const DEFAULT_SETTINGS = {
  clinic_name: 'Atlas Ağız ve Diş Sağlığı Polikliniği',
  phone_display: '0546 177 43 77',
  phone_e164: '+905461774377',
  whatsapp: '905461774377',
  booking_enabled: true,
  booking_days: 30,           // kaç gün ileriye randevu alınabilir
  booking_notice_min: 120,    // en erken kaç dakika sonrası
  closed_dates: []            // ['2026-10-29', ...] resmî tatil vb.
};

const WEEK = { 1: [['09:00', '13:00'], ['14:00', '19:00']], 2: [['09:00', '13:00'], ['14:00', '19:00']],
  3: [['09:00', '13:00'], ['14:00', '19:00']], 4: [['09:00', '13:00'], ['14:00', '19:00']],
  5: [['09:00', '13:00'], ['14:00', '19:00']], 6: [['10:00', '15:00']], 0: [] };

const DEFAULT_SERVICES = [
  ['genel', 'Genel muayene', 30], ['zirkonyum', 'Zirkonyum kaplama', 60], ['lamine', 'Lamine', 60],
  ['emax', 'E-max', 60], ['implant', 'İmplant', 60], ['kanal', 'Kanal tedavisi', 60],
  ['bleaching', 'Bleaching', 60], ['ortodonti', 'Ortodonti', 30], ['cocuk', 'Çocuk diş hekimliği', 30],
  ['diseti', 'Dişeti tedavisi', 45], ['botoks', 'Botoks', 30]
];

/* Şemayı kur, eski veritabanını yükselt, varsayılanları ekle; süreç başına bir kez */
let readyP = null;
function ready() {
  if (!readyP) readyP = (async () => {
    await q.exec(SCHEMA);
    const have = {};
    for (const [t, c, def] of COLUMNS) {
      if (!have[t]) have[t] = (await q.all('PRAGMA table_info(' + t + ')')).map((x) => x.name);
      if (!have[t].includes(c)) { await q.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + c + ' ' + def); have[t].push(c); }
    }
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await q.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
    if ((await q.get('SELECT COUNT(*) n FROM services')).n === 0) {
      for (let i = 0; i < DEFAULT_SERVICES.length; i++) {
        const r = DEFAULT_SERVICES[i];
        await q.run('INSERT INTO services (key, name, duration_min, sort) VALUES (?, ?, ?, ?)', r[0], r[1], r[2], i);
      }
    }
    await bootstrapAdmin();
  })().catch((e) => { readyP = null; throw e; });
  return readyP;
}

/* İlk yönetici: hiç kullanıcı yoksa ortam değişkenlerindeki e-posta ve parola özeti ile oluşturulur.
   Böylece canlıda "ilk kurulum" ekranı hiç açılmaz; parolanın kendisi sunucuda bulunmaz. */
async function bootstrapAdmin() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase(), hash = process.env.BOOTSTRAP_ADMIN_HASH || '';
  if (!email || !/^scrypt\$/.test(hash)) return;
  if ((await q.get('SELECT COUNT(*) n FROM users')).n > 0) return;
  await q.run("INSERT OR IGNORE INTO users (name, email, pass_hash, role) VALUES (?, ?, ?, 'admin')", process.env.BOOTSTRAP_ADMIN_NAME || 'Yönetici', email, hash);
  await audit(null, '', 'setup', 'İlk yönetici ortam değişkenlerinden oluşturuldu: ' + email);
}

/* ── Yardımcılar ───────────────────────────────────────────────────── */
async function getSettings(t) {
  const out = {};
  for (const r of await (t || q).all('SELECT key, value FROM settings')) out[r.key] = JSON.parse(r.value);
  return out;
}
async function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) {
    await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
  }
}
async function getContent() {
  const out = { tr: {}, en: {}, de: {} };
  for (const r of await q.all('SELECT lang, key, value FROM content')) if (out[r.lang]) out[r.lang][r.key] = r.value;
  return out;
}

function parseDoctor(d) {
  if (!d) return d;
  return Object.assign({}, d, { hours: JSON.parse(d.hours || '{}'), online: !!d.online, active: !!d.active, on_site: !!d.on_site });
}

async function audit(user, ip, action, detail) {
  await q.run('INSERT INTO audit (user_id, user_name, ip, action, detail) VALUES (?,?,?,?,?)',
    user ? user.id : null, user ? user.name + ' <' + user.email + '>' : '', ip || '', action, String(detail || '').slice(0, 500));
}

/* Fotoğraflar veritabanında tutulur (sunucusuz ortamda kalıcı disk yok) */
async function putFile(name, mime, buf) {
  await q.run('INSERT INTO files (name, mime, data) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET mime = excluded.mime, data = excluded.data', name, mime, buf);
}
async function getFile(name) {
  const r = await q.get('SELECT mime, data FROM files WHERE name = ?', name);
  return r ? { mime: r.mime, data: Buffer.from(r.data) } : null;
}
async function delFile(name) { await q.run('DELETE FROM files WHERE name = ?', name); }

module.exports = { q, ready, REMOTE, getSettings, setSettings, getContent, parseDoctor, audit, putFile, getFile, delFile, WEEK, DATA_DIR, DEFAULT_SETTINGS };
