/* Atlas — veritabanı.
   Node'un yerleşik SQLite'ı (node:sqlite); harici paket yok.
   Tüm saatler klinik saatiyle (Europe/Istanbul) 'YYYY-MM-DD HH:MM' metni olarak tutulur. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.ATLAS_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'atlas.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','doctor')),
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
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
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price INTEGER,
  online INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
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
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
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
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  tooth TEXT NOT NULL DEFAULT '',
  procedure TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  fee INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS records_patient ON records(patient_id);
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
`);

/* ── Sonradan eklenen sütunlar (var olan veritabanlarını yükseltir) ── */
function addColumn(table, col, def) {
  if (!db.prepare('PRAGMA table_info(' + table + ')').all().some((c) => c.name === col)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + def);
}
db.exec(`CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS records_date ON records(date);`);
addColumn('services', 'cost', 'INTEGER NOT NULL DEFAULT 0');       // malzeme + laboratuvar maliyeti (₺)
addColumn('records', 'service_id', 'INTEGER REFERENCES services(id) ON DELETE SET NULL');
addColumn('records', 'cost', 'INTEGER NOT NULL DEFAULT 0');
addColumn('doctors', 'bio', "TEXT NOT NULL DEFAULT ''");
addColumn('doctors', 'bio_en', "TEXT NOT NULL DEFAULT ''");
addColumn('doctors', 'bio_de', "TEXT NOT NULL DEFAULT ''");
addColumn('doctors', 'photo', "TEXT NOT NULL DEFAULT ''");
addColumn('doctors', 'on_site', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'totp_secret', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'totp_last', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'last_login', 'TEXT');
addColumn('sessions', 'last_seen', 'INTEGER NOT NULL DEFAULT 0');
addColumn('sessions', 'ip', "TEXT NOT NULL DEFAULT ''");

const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(path.join(UPLOADS, 'doctors'), { recursive: true });

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

function initDefaults() {
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, JSON.stringify(v));

  if (db.prepare('SELECT COUNT(*) n FROM services').get().n === 0) {
    const s = db.prepare('INSERT INTO services (key, name, duration_min, sort) VALUES (?, ?, ?, ?)');
    DEFAULT_SERVICES.forEach((r, i) => s.run(r[0], r[1], r[2], i));
  }
}
initDefaults();

/* ── Yardımcılar ───────────────────────────────────────────────────── */
function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = JSON.parse(r.value);
  return out;
}
function setSettings(obj) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) up.run(k, JSON.stringify(v));
}

function getContent() {
  const out = { tr: {}, en: {}, de: {} };
  for (const r of db.prepare('SELECT lang, key, value FROM content').all()) if (out[r.lang]) out[r.lang][r.key] = r.value;
  return out;
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

function parseDoctor(d) {
  if (!d) return d;
  return Object.assign({}, d, { hours: JSON.parse(d.hours || '{}'), online: !!d.online, active: !!d.active, on_site: !!d.on_site });
}

function audit(user, ip, action, detail) {
  db.prepare('INSERT INTO audit (user_id, user_name, ip, action, detail) VALUES (?,?,?,?,?)')
    .run(user ? user.id : null, user ? user.name + ' <' + user.email + '>' : '', ip || '', action, String(detail || '').slice(0, 500));
}

module.exports = { db, tx, getSettings, setSettings, getContent, parseDoctor, audit, WEEK, DATA_DIR, UPLOADS };
