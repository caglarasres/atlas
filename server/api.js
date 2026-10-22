/* Atlas — API.
   /api/public/*  web sitesi (oturum gerekmez)
   /api/auth/*    giriş, çıkış, ilk kurulum
   /api/*         yönetim paneli (oturum gerekir; bazıları yalnızca yönetici) */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, tx, getSettings, setSettings, getContent, parseDoctor, audit, WEEK, UPLOADS } = require('./db');
const A = require('./auth');
const S = require('./slots');

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };

/* ── Doğrulama ─────────────────────────────────────────────────────── */
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
function need(cond, msg) { if (!cond) fail(400, msg); }

/* 0 + son 10 hane: '+90 546 177 43 77' → '05461774377' */
function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? '0' + d.slice(-10) : d;
}

const STATUSES = ['pending', 'confirmed', 'arrived', 'done', 'cancelled', 'noshow'];
const HEX = /^#[0-9a-f]{6}$/i;

function cleanHours(h) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const list = Array.isArray(h && h[d]) ? h[d] : [];
    out[d] = list.filter((r) => Array.isArray(r) && S.isTime(r[0]) && S.isTime(r[1]) && r[0] < r[1]).map((r) => [r[0], r[1]]);
  }
  return out;
}

/* ── Randevu sorguları ─────────────────────────────────────────────── */
const APPT_SELECT = `SELECT a.*, p.name AS patient_name, p.phone AS patient_phone,
  d.name AS doctor_name, d.title AS doctor_title, d.color AS doctor_color, s.name AS service_name
  FROM appointments a JOIN patients p ON p.id = a.patient_id
  LEFT JOIN doctors d ON d.id = a.doctor_id LEFT JOIN services s ON s.id = a.service_id`;

function getAppt(id) { return db.prepare(APPT_SELECT + ' WHERE a.id = ?').get(id); }

function endOf(date, time, dur) { return date + ' ' + S.toHM(S.toMin(time) + dur); }

/* ── Uç noktalar ───────────────────────────────────────────────────── */
const routes = [];
const route = (method, path, perm, fn) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, perm, fn });
};

/* public: site yapılandırması */
route('GET', '/api/public/config', 'public', () => {
  const st = getSettings();
  return {
    booking: { enabled: !!st.booking_enabled, days: st.booking_days, closed: st.closed_dates, today: S.today() },
    services: db.prepare('SELECT id, key, name, duration_min FROM services WHERE active = 1 AND online = 1 ORDER BY sort, id').all(),
    doctors: db.prepare("SELECT id, title || ' ' || name AS name FROM doctors WHERE active = 1 AND online = 1 ORDER BY sort, id").all()
  };
});

route('GET', '/api/public/slots', 'public', ({ query }) => {
  return { slots: S.available({ date: query.date, serviceId: int(query.service), doctorId: int(query.doctor) }).map((s) => s.time) };
});

route('POST', '/api/public/book', 'public', ({ body, ip }) => {
  if (str(body.website)) return { ok: true };                 // bal küpü: botlara sessizce "tamam"
  if (A.limited('book:' + ip, 6, 3600e3)) fail(429, 'Çok fazla deneme. Lütfen bizi arayın.');
  const name = str(body.name, 120), phone = normPhone(body.phone), note = str(body.note, 1000);
  const serviceId = int(body.service), doctorId = int(body.doctor), date = str(body.date, 10), time = str(body.time, 5);
  need(name.length >= 2, 'Ad soyad gerekli.');
  need(/^05\d{9}$/.test(phone), 'Geçerli bir cep telefonu girin.');
  need(body.consent === true, 'Aydınlatma metnini onaylamanız gerekiyor.');
  need(S.isDate(date) && S.isTime(time), 'Tarih ve saat seçin.');

  return tx(() => {
    const slot = S.available({ date, serviceId, doctorId }).find((s) => s.time === time);
    if (!slot) fail(409, 'Bu saat az önce doldu. Lütfen başka bir saat seçin.');
    const docId = doctorId || slot.doctors[0];
    const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);

    let p = db.prepare('SELECT * FROM patients WHERE phone = ? ORDER BY id LIMIT 1').get(phone);
    if (!p) {
      const r = db.prepare("INSERT INTO patients (name, phone, consent_at) VALUES (?, ?, datetime('now'))").run(name, phone);
      p = { id: Number(r.lastInsertRowid) };
    } else if (!p.consent_at) {
      db.prepare("UPDATE patients SET consent_at = datetime('now') WHERE id = ?").run(p.id);
    }
    db.prepare(`INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, source, note)
      VALUES (?, ?, ?, ?, ?, 'pending', 'online', ?)`)
      .run(p.id, docId, serviceId, date + ' ' + time, endOf(date, time, svc.duration_min), (name !== p.name && p.name ? 'Formdaki ad: ' + name + '\n' : '') + note);
    const d = db.prepare('SELECT title, name FROM doctors WHERE id = ?').get(docId);
    return { ok: true, date, time, doctor: d.title + ' ' + d.name, service: svc.name };
  });
});

/* auth */
route('GET', '/api/auth/state', 'public', ({ user }) => ({
  setup: db.prepare('SELECT COUNT(*) n FROM users').get().n === 0,
  user: user || null
}));

route('POST', '/api/auth/setup', 'public', ({ body, req, res, ip }) => {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) fail(403, 'Kurulum zaten yapılmış.');
  const name = str(body.name, 80), email = str(body.email, 120).toLowerCase(), pw = String(body.password || '');
  need(name && /^\S+@\S+\.\S+$/.test(email), 'Ad ve geçerli bir e-posta girin.');
  const bad = A.passwordProblem(pw, email); if (bad) fail(400, bad);
  const r = db.prepare("INSERT INTO users (name, email, pass_hash, role) VALUES (?, ?, ?, 'admin')").run(name, email, A.hashPassword(pw));
  const id = Number(r.lastInsertRowid);
  audit({ id, name, email }, ip, 'setup', 'İlk yönetici hesabı oluşturuldu');
  res.setHeader('Set-Cookie', A.cookieHeader(req, A.createSession(id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/login', 'public', ({ body, req, res, ip }) => {
  const email = str(body.email, 120).toLowerCase(), pw = String(body.password || '');
  if (A.limited('login:' + ip, 20, 900e3) || A.limited('login:' + email, 8, 900e3)) fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = A.checkPassword(pw, u ? u.pass_hash : A.DUMMY);
  if (!u || !ok || !u.active) {
    audit(u || null, ip, 'login.fail', email);
    fail(401, 'E-posta ya da parola hatalı.');
  }
  if (u.totp_enabled) return { mfa: true, ticket: A.mfaTicket(u.id) };
  audit(u, ip, 'login', '');
  res.setHeader('Set-Cookie', A.cookieHeader(req, A.createSession(u.id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/mfa', 'public', ({ body, req, res, ip }) => {
  if (A.limited('mfa:' + ip, 20, 900e3)) fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
  const t = A.useTicket(body.ticket);
  if (!t) fail(401, 'Süre doldu. Lütfen yeniden giriş yapın.', { restart: true });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(t.userId);
  const step = u && u.active ? A.verifyTotp(u.totp_secret, body.code, u.totp_last) : 0;
  if (!step) { audit(u, ip, 'mfa.fail', ''); fail(401, 'Kod hatalı.'); }
  t.done();
  db.prepare('UPDATE users SET totp_last = ? WHERE id = ?').run(step, u.id);
  audit(u, ip, 'login', 'iki adımlı');
  res.setHeader('Set-Cookie', A.cookieHeader(req, A.createSession(u.id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/logout', 'public', ({ req, res }) => {
  A.destroySession(A.sessionToken(req));
  res.setHeader('Set-Cookie', A.cookieHeader(req, '', 0));
  return { ok: true };
});

route('POST', '/api/auth/password', 'any', ({ body, user, req, ip }) => {
  if (A.limited('pw:' + user.id, 10, 900e3)) fail(429, 'Çok fazla deneme.');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!A.checkPassword(String(body.current || ''), u.pass_hash)) fail(400, 'Mevcut parola hatalı.');
  const bad = A.passwordProblem(body.next, u.email); if (bad) fail(400, bad);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(A.hashPassword(String(body.next)), user.id);
  A.destroyUserSessions(user.id, A.sessionToken(req));      // diğer cihazlardaki oturumlar kapanır
  audit(user, ip, 'password.change', '');
  return { ok: true };
});

/* iki adımlı doğrulama kurulumu */
route('POST', '/api/auth/2fa/start', 'any', ({ user }) => {
  const secret = A.newTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ? AND totp_enabled = 0').run(secret, user.id);
  const u = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(user.id);
  if (u.totp_enabled) fail(400, 'İki adımlı doğrulama zaten açık.');
  const label = encodeURIComponent('Atlas Panel:' + user.email);
  return { secret: u.totp_secret, uri: 'otpauth://totp/' + label + '?secret=' + u.totp_secret + '&issuer=Atlas%20Panel&digits=6&period=30' };
});
route('POST', '/api/auth/2fa/enable', 'any', ({ body, user, ip }) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const step = A.verifyTotp(u.totp_secret, body.code, 0);
  if (!step) fail(400, 'Kod hatalı. Uygulamadaki güncel 6 haneli kodu girin.');
  db.prepare('UPDATE users SET totp_enabled = 1, totp_last = ? WHERE id = ?').run(step, user.id);
  audit(user, ip, '2fa.enable', '');
  return { ok: true };
});
route('POST', '/api/auth/2fa/disable', 'any', ({ body, user, ip }) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!A.checkPassword(String(body.password || ''), u.pass_hash)) fail(400, 'Parola hatalı.');
  db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?").run(user.id);
  audit(user, ip, '2fa.disable', '');
  return { ok: true };
});

/* gösterge */
route('GET', '/api/dashboard', 'any', () => {
  const t = S.today();
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    today: t,
    todayList: db.prepare(APPT_SELECT + " WHERE substr(a.start,1,10) = ? AND a.status != 'cancelled' ORDER BY a.start").all(t),
    pending: db.prepare(APPT_SELECT + " WHERE a.status = 'pending' AND a.start >= ? ORDER BY a.start LIMIT 50").all(t),
    stats: {
      today: count("SELECT COUNT(*) n FROM appointments WHERE substr(start,1,10) = ? AND status NOT IN ('cancelled')", t),
      week: count("SELECT COUNT(*) n FROM appointments WHERE substr(start,1,10) BETWEEN ? AND ? AND status NOT IN ('cancelled')", t, S.addDays(t, 6)),
      pending: count("SELECT COUNT(*) n FROM appointments WHERE status = 'pending' AND start >= ?", t),
      patients: count('SELECT COUNT(*) n FROM patients'),
      newPatients30: count("SELECT COUNT(*) n FROM patients WHERE created_at >= datetime('now','-30 days')"),
      balance: db.prepare('SELECT COALESCE(SUM(fee - paid),0) n FROM records').get().n
    }
  };
});

/* randevular */
route('GET', '/api/appointments', 'any', ({ query }) => {
  const w = [], a = [];
  if (S.isDate(query.from)) { w.push('substr(a.start,1,10) >= ?'); a.push(query.from); }
  if (S.isDate(query.to)) { w.push('substr(a.start,1,10) <= ?'); a.push(query.to); }
  if (int(query.doctor)) { w.push('a.doctor_id = ?'); a.push(int(query.doctor)); }
  if (int(query.patient)) { w.push('a.patient_id = ?'); a.push(int(query.patient)); }
  if (STATUSES.includes(query.status)) { w.push('a.status = ?'); a.push(query.status); }
  if (query.q) { w.push('(p.name LIKE ? OR p.phone LIKE ?)'); a.push('%' + query.q + '%', '%' + normPhone(query.q) + '%'); }
  const sql = APPT_SELECT + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY a.start ' + (query.order === 'desc' ? 'DESC' : 'ASC') + ' LIMIT 1000';
  return { items: db.prepare(sql).all(...a) };
});

function saveAppt(body, id) {
  const date = str(body.date, 10), time = str(body.time, 5);
  need(S.isDate(date) && S.isTime(time), 'Tarih ve saat geçersiz.');
  const doctorId = int(body.doctor_id), serviceId = int(body.service_id);
  const doctor = parseDoctor(db.prepare('SELECT * FROM doctors WHERE id = ?').get(doctorId));
  need(doctor, 'Hekim seçin.');
  const svc = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) : null;
  const dur = int(body.duration) || (svc ? svc.duration_min : doctor.slot_min);
  need(dur >= 5 && dur <= 480, 'Süre geçersiz.');
  const status = STATUSES.includes(body.status) ? body.status : 'confirmed';

  return tx(() => {
    let patientId = int(body.patient_id);
    if (!patientId) {
      const name = str(body.patient_name, 120), phone = normPhone(body.patient_phone);
      need(name.length >= 2, 'Hasta seçin ya da yeni hasta adı girin.');
      const ex = phone ? db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone) : null;
      patientId = ex ? ex.id : Number(db.prepare('INSERT INTO patients (name, phone) VALUES (?, ?)').run(name, phone).lastInsertRowid);
    }
    if (!body.force && !['cancelled', 'noshow'].includes(status)) {
      const why = S.fits(doctor, date, time, dur, id);
      if (why) fail(409, why === 'busy' ? 'Hekimin bu saatte başka randevusu var.' : 'Bu saat hekimin çalışma saatleri dışında.', { canForce: true });
    }
    const vals = [patientId, doctorId, serviceId, date + ' ' + time, endOf(date, time, dur), status, str(body.note, 2000)];
    if (id) {
      db.prepare("UPDATE appointments SET patient_id=?, doctor_id=?, service_id=?, start=?, end=?, status=?, note=?, updated_at=datetime('now') WHERE id=?").run(...vals, id);
      return getAppt(id);
    }
    const source = ['phone', 'panel'].includes(body.source) ? body.source : 'panel';
    const r = db.prepare('INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, note, source) VALUES (?,?,?,?,?,?,?,?)').run(...vals, source);
    return getAppt(Number(r.lastInsertRowid));
  });
}

route('POST', '/api/appointments', 'any', ({ body }) => saveAppt(body));
route('PUT', '/api/appointments/:id', 'any', ({ body, params }) => {
  const cur = getAppt(params.id);
  if (!cur) fail(404, 'Randevu bulunamadı.');
  // yalnızca durum değişiyorsa çakışma denetimi gerekmez
  if (Object.keys(body).length === 1 && STATUSES.includes(body.status)) {
    db.prepare("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(body.status, params.id);
    return getAppt(params.id);
  }
  return saveAppt(body, params.id);
});
route('DELETE', '/api/appointments/:id', 'any', ({ params }) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(params.id);
  return { ok: true };
});

route('GET', '/api/slots', 'any', ({ query }) => {
  const doctor = parseDoctor(db.prepare('SELECT * FROM doctors WHERE id = ?').get(int(query.doctor)));
  if (!doctor || !S.isDate(query.date)) return { slots: [] };
  const dur = int(query.duration) || doctor.slot_min, out = [];
  for (const r of doctor.hours[S.weekday(query.date)] || [])
    for (let m = S.toMin(r[0]); m + dur <= S.toMin(r[1]); m += doctor.slot_min)
      if (!S.fits(doctor, query.date, S.toHM(m), dur, int(query.except))) out.push(S.toHM(m));
  return { slots: out };
});

/* hastalar */
route('GET', '/api/patients', 'any', ({ query }) => {
  const q = str(query.q, 80);
  const where = q ? 'WHERE p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?' : '';
  const args = q ? ['%' + q + '%', '%' + (normPhone(q) || q) + '%', '%' + q + '%'] : [];
  return {
    items: db.prepare(`SELECT p.*,
      (SELECT MAX(start) FROM appointments WHERE patient_id = p.id AND start < datetime('now','localtime')) AS last_visit,
      (SELECT MIN(start) FROM appointments WHERE patient_id = p.id AND start >= datetime('now','localtime') AND status NOT IN ('cancelled','noshow')) AS next_visit,
      (SELECT COALESCE(SUM(fee - paid),0) FROM records WHERE patient_id = p.id) AS balance
      FROM patients p ${where} ORDER BY p.name COLLATE NOCASE LIMIT ${q ? 50 : 500}`).all(...args)
  };
});

route('GET', '/api/patients/:id', 'any', ({ params }) => {
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(params.id);
  if (!p) fail(404, 'Hasta bulunamadı.');
  return Object.assign(p, {
    appointments: db.prepare(APPT_SELECT + ' WHERE a.patient_id = ? ORDER BY a.start DESC').all(params.id),
    records: db.prepare(`SELECT r.*, d.title || ' ' || d.name AS doctor_name FROM records r
      LEFT JOIN doctors d ON d.id = r.doctor_id WHERE r.patient_id = ? ORDER BY r.date DESC, r.id DESC`).all(params.id)
  });
});

function patientVals(b) {
  const name = str(b.name, 120);
  need(name.length >= 2, 'Ad soyad gerekli.');
  const birth = str(b.birth_date, 10);
  need(!birth || S.isDate(birth), 'Doğum tarihi geçersiz.');
  return [name, normPhone(b.phone), str(b.email, 120), birth, str(b.gender, 10), str(b.allergies, 1000), str(b.notes, 4000)];
}
route('POST', '/api/patients', 'any', ({ body }) => {
  const r = db.prepare('INSERT INTO patients (name, phone, email, birth_date, gender, allergies, notes, consent_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(...patientVals(body), body.consent ? S.nowLocal() : null);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/patients/:id', 'any', ({ body, params }) => {
  db.prepare('UPDATE patients SET name=?, phone=?, email=?, birth_date=?, gender=?, allergies=?, notes=? WHERE id=?').run(...patientVals(body), params.id);
  if (body.consent === true) db.prepare('UPDATE patients SET consent_at = COALESCE(consent_at, ?) WHERE id = ?').run(S.nowLocal(), params.id);
  return { ok: true };
});
route('DELETE', '/api/patients/:id', 'admin', ({ params, user, ip }) => {
  const p = db.prepare('SELECT name FROM patients WHERE id = ?').get(params.id);
  db.prepare('DELETE FROM patients WHERE id = ?').run(params.id);
  if (p) audit(user, ip, 'patient.delete', '#' + params.id + ' ' + p.name);
  return { ok: true };
});

/* tedavi kayıtları */
function recordVals(b, user) {
  const date = str(b.date, 10), procedure = str(b.procedure, 200);
  need(S.isDate(date) && procedure, 'Tarih ve işlem gerekli.');
  const fee = int(b.fee) || 0, paid = int(b.paid) || 0, cost = int(b.cost) || 0;
  need(fee >= 0 && paid >= 0 && cost >= 0, 'Tutar geçersiz.');
  const sid = int(b.service_id);
  return [int(b.doctor_id) || user.doctor_id || null, date, str(b.tooth, 40), procedure, str(b.note, 4000), fee, paid,
    sid && db.prepare('SELECT id FROM services WHERE id = ?').get(sid) ? sid : null, cost];
}
route('POST', '/api/patients/:id/records', 'any', ({ body, params, user }) => {
  db.prepare('INSERT INTO records (patient_id, doctor_id, date, tooth, procedure, note, fee, paid, service_id, cost) VALUES (?,?,?,?,?,?,?,?,?,?)').run(params.id, ...recordVals(body, user));
  return { ok: true };
});
route('PUT', '/api/records/:id', 'any', ({ body, params, user }) => {
  db.prepare('UPDATE records SET doctor_id=?, date=?, tooth=?, procedure=?, note=?, fee=?, paid=?, service_id=?, cost=? WHERE id=?').run(...recordVals(body, user), params.id);
  return { ok: true };
});
/* tüm işlem kayıtları (hasta fark etmeksizin) */
route('GET', '/api/records', 'any', ({ query }) => {
  const w = [], a = [];
  if (S.isDate(query.from)) { w.push('r.date >= ?'); a.push(query.from); }
  if (S.isDate(query.to)) { w.push('r.date <= ?'); a.push(query.to); }
  if (int(query.doctor)) { w.push('r.doctor_id = ?'); a.push(int(query.doctor)); }
  if (int(query.service)) { w.push('r.service_id = ?'); a.push(int(query.service)); }
  if (query.unpaid === '1') w.push('r.fee > r.paid');
  if (query.q) { w.push('(p.name LIKE ? OR r.procedure LIKE ?)'); a.push('%' + query.q + '%', '%' + query.q + '%'); }
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const base = ' FROM records r JOIN patients p ON p.id = r.patient_id' + where;
  return {
    items: db.prepare(`SELECT r.*, p.name AS patient_name, s.name AS service_name, d.title || ' ' || d.name AS doctor_name` + base.replace(' JOIN patients', ' LEFT JOIN services s ON s.id = r.service_id LEFT JOIN doctors d ON d.id = r.doctor_id JOIN patients') +
      ' ORDER BY r.date DESC, r.id DESC LIMIT 500').all(...a),
    sum: db.prepare('SELECT COUNT(*) n, COALESCE(SUM(r.fee),0) fee, COALESCE(SUM(r.cost),0) cost, COALESCE(SUM(r.paid),0) paid' + base).get(...a)
  };
});

route('DELETE', '/api/records/:id', 'any', ({ params }) => {
  db.prepare('DELETE FROM records WHERE id = ?').run(params.id);
  return { ok: true };
});

/* hekimler */
route('GET', '/api/doctors', 'any', () => ({ items: db.prepare('SELECT * FROM doctors ORDER BY active DESC, sort, id').all().map(parseDoctor) }));
function doctorVals(b) {
  const name = str(b.name, 80);
  need(name, 'Hekim adı gerekli.');
  const slot = int(b.slot_min) || 30;
  need([10, 15, 20, 30, 45, 60].includes(slot), 'Randevu aralığı geçersiz.');
  return [name, str(b.title, 20), str(b.specialty, 120), HEX.test(b.color) ? b.color : '#3f6454', slot,
    JSON.stringify(cleanHours(b.hours)), b.online === false ? 0 : 1, b.active === false ? 0 : 1, int(b.sort) || 0,
    str(b.bio, 2000), str(b.bio_en, 2000), str(b.bio_de, 2000), b.on_site === false ? 0 : 1];
}
const DOC_COLS = 'name, title, specialty, color, slot_min, hours, online, active, sort, bio, bio_en, bio_de, on_site';
route('POST', '/api/doctors', 'admin', ({ body, user, ip }) => {
  if (!body.hours) body.hours = WEEK;
  const r = db.prepare('INSERT INTO doctors (' + DOC_COLS + ') VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...doctorVals(body));
  audit(user, ip, 'doctor.create', body.name);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/doctors/:id', 'admin', ({ body, params }) => {
  db.prepare('UPDATE doctors SET ' + DOC_COLS.split(', ').map((c) => c + '=?').join(', ') + ' WHERE id=?').run(...doctorVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/doctors/:id', 'admin', ({ params, user, ip }) => {
  const n = db.prepare('SELECT COUNT(*) n FROM appointments WHERE doctor_id = ?').get(params.id).n;
  if (n) fail(409, 'Bu hekimin ' + n + ' randevusu var; silmek yerine pasif yapın.');
  const d = db.prepare('SELECT * FROM doctors WHERE id = ?').get(params.id);
  if (d) removePhoto(d.photo);
  db.prepare('DELETE FROM doctors WHERE id = ?').run(params.id);
  if (d) audit(user, ip, 'doctor.delete', d.name);
  return { ok: true };
});

route('POST', '/api/doctors/order', 'admin', ({ body }) => {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(int).filter((n) => n > 0);
  tx(() => ids.forEach((id, i) => db.prepare('UPDATE doctors SET sort = ? WHERE id = ?').run(i, id)));
  return { ok: true };
});

/* hekim fotoğrafı: yalnızca JPEG/PNG/WebP; tür, uzantıya değil dosyanın ilk baytlarına göre belirlenir */
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
function removePhoto(rel) {
  if (!rel || !/^\/uploads\/doctors\/[\w.-]+$/.test(rel)) return;
  fs.rm(path.join(UPLOADS, 'doctors', path.basename(rel)), { force: true }, () => {});
}
route('POST', '/api/doctors/:id/photo', 'admin', ({ body, params, user, ip }) => {
  const d = db.prepare('SELECT * FROM doctors WHERE id = ?').get(params.id);
  if (!d) fail(404, 'Hekim bulunamadı.');
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  need(m, 'Fotoğraf JPEG, PNG ya da WebP olmalı.');
  const buf = Buffer.from(m[2], 'base64');
  need(buf.length <= 2.5 * 1024 * 1024, 'Fotoğraf en fazla 2,5 MB olabilir.');
  const ext = imageType(buf);
  need(ext, 'Dosya geçerli bir görsel değil.');
  const name = d.id + '-' + crypto.randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS, 'doctors', name), buf, { mode: 0o640 });
  removePhoto(d.photo);
  db.prepare('UPDATE doctors SET photo = ? WHERE id = ?').run('/uploads/doctors/' + name, d.id);
  audit(user, ip, 'doctor.photo', d.name);
  return { photo: '/uploads/doctors/' + name };
});
route('DELETE', '/api/doctors/:id/photo', 'admin', ({ params }) => {
  const d = db.prepare('SELECT * FROM doctors WHERE id = ?').get(params.id);
  if (d) { removePhoto(d.photo); db.prepare("UPDATE doctors SET photo = '' WHERE id = ?").run(d.id); }
  return { ok: true };
});

/* hizmetler */
route('GET', '/api/services', 'any', () => ({ items: db.prepare('SELECT * FROM services ORDER BY sort, id').all() }));
function serviceVals(b) {
  const name = str(b.name, 80), dur = int(b.duration_min);
  need(name && dur >= 5 && dur <= 480, 'Ad ve süre (5–480 dk) gerekli.');
  const price = int(b.price), cost = int(b.cost) || 0;
  need(cost >= 0, 'Maliyet geçersiz.');
  return [name, dur, price && price > 0 ? price : null, b.online === false ? 0 : 1, b.active === false ? 0 : 1, int(b.sort) || 0, cost];
}
route('POST', '/api/services', 'admin', ({ body }) => {
  const key = (str(body.key, 40) || str(body.name, 40)).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const r = db.prepare('INSERT INTO services (name, duration_min, price, online, active, sort, cost, key) VALUES (?,?,?,?,?,?,?,?)').run(...serviceVals(body), key);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/services/:id', 'admin', ({ body, params }) => {
  db.prepare('UPDATE services SET name=?, duration_min=?, price=?, online=?, active=?, sort=?, cost=? WHERE id=?').run(...serviceVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/services/:id', 'admin', ({ params, query, user, ip }) => {
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(params.id);
  if (!svc) return { ok: true };
  const na = db.prepare('SELECT COUNT(*) n FROM appointments WHERE service_id = ?').get(params.id).n;
  const nr = db.prepare('SELECT COUNT(*) n FROM records WHERE service_id = ?').get(params.id).n;
  if ((na || nr) && query.force !== '1') {
    fail(409, svc.name + ' ' + na + ' randevuda ve ' + nr + ' işlem kaydında kullanılıyor.', { canForce: true, appointments: na, records: nr });
  }
  tx(() => {
    // geçmiş kayıtlar kaybolmasın: işlem kayıtlarında açıklama zaten var; randevulara tedavi adı not olarak düşülür
    db.prepare("UPDATE appointments SET note = CASE WHEN note = '' THEN ? ELSE note || char(10) || ? END WHERE service_id = ?")
      .run('Tedavi: ' + svc.name, 'Tedavi: ' + svc.name, params.id);
    db.prepare('UPDATE records SET service_id = NULL WHERE service_id = ?').run(params.id);
    db.prepare('DELETE FROM services WHERE id = ?').run(params.id);
  });
  audit(user, ip, 'service.delete', svc.name);
  return { ok: true };
});

/* ayarlar */
route('GET', '/api/settings', 'any', () => getSettings());
route('PUT', '/api/settings', 'admin', ({ body, user, ip }) => {
  const s = {};
  if ('clinic_name' in body) s.clinic_name = str(body.clinic_name, 120);
  if ('phone_display' in body) s.phone_display = str(body.phone_display, 40);
  if ('phone_e164' in body) { const d = String(body.phone_e164).replace(/[^\d+]/g, ''); need(/^\+\d{10,15}$/.test(d), 'Telefon +90… biçiminde olmalı.'); s.phone_e164 = d; }
  if ('whatsapp' in body) { const d = String(body.whatsapp).replace(/\D/g, ''); need(/^\d{10,15}$/.test(d), 'WhatsApp numarası geçersiz.'); s.whatsapp = d; }
  if ('booking_enabled' in body) s.booking_enabled = !!body.booking_enabled;
  if ('booking_days' in body) { const n = int(body.booking_days); need(n >= 1 && n <= 180, 'Gün sayısı 1–180 olmalı.'); s.booking_days = n; }
  if ('booking_notice_min' in body) { const n = int(body.booking_notice_min); need(n >= 0 && n <= 10080, 'Süre geçersiz.'); s.booking_notice_min = n; }
  if ('closed_dates' in body) s.closed_dates = (Array.isArray(body.closed_dates) ? body.closed_dates : []).filter(S.isDate).sort();
  setSettings(s);
  audit(user, ip, 'settings', Object.keys(s).join(', '));
  return getSettings();
});

/* site içeriği */
route('GET', '/api/content', 'admin', () => getContent());
/* Site metinlerinde yalnızca <br>, <em>, <strong>, <b>, <i> (özniteliksiz) kalır; geri kalan her şey metne dönüşür.
   Böylece ele geçirilmiş bir yönetici hesabı bile siteye betik yerleştiremez. */
function safeHtml(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(\/?)(em|strong|b|i)&gt;/gi, (_, sl, t) => '<' + sl + t.toLowerCase() + '>');
}
route('PUT', '/api/content', 'admin', ({ body, user, ip }) => {
  const changes = Array.isArray(body.changes) ? body.changes : [];
  audit(user, ip, 'content', changes.length + ' metin');
  tx(() => {
    for (const c of changes) {
      if (!['tr', 'en', 'de'].includes(c.lang) || !/^[\w.-]{1,60}$/.test(c.key || '')) continue;
      if (c.value === null) db.prepare('DELETE FROM content WHERE lang = ? AND key = ?').run(c.lang, c.key);
      else db.prepare('INSERT INTO content (lang, key, value) VALUES (?,?,?) ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value')
        .run(c.lang, c.key, safeHtml(String(c.value).slice(0, 5000)));
    }
  });
  return getContent();
});

/* kullanıcılar */
route('GET', '/api/users', 'admin', () => ({ items: db.prepare('SELECT id, name, email, role, doctor_id, active, created_at, last_login, totp_enabled FROM users ORDER BY id').all() }));
function userVals(b) {
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
  need(name && /^\S+@\S+\.\S+$/.test(email), 'Ad ve geçerli e-posta gerekli.');
  need(['admin', 'staff', 'doctor'].includes(b.role), 'Rol geçersiz.');
  return [name, email, b.role, b.role === 'doctor' ? int(b.doctor_id) : null, b.active === false ? 0 : 1];
}
route('POST', '/api/users', 'admin', ({ body, user, ip }) => {
  const v = userVals(body);
  const bad = A.passwordProblem(body.password, v[1]); if (bad) fail(400, bad);
  try {
    const r = db.prepare('INSERT INTO users (name, email, role, doctor_id, active, pass_hash) VALUES (?,?,?,?,?,?)').run(...v, A.hashPassword(String(body.password)));
    audit(user, ip, 'user.create', v[1] + ' (' + v[2] + ')');
    return { id: Number(r.lastInsertRowid) };
  } catch (e) { if (/UNIQUE/.test(e.message)) fail(409, 'Bu e-posta zaten kayıtlı.'); throw e; }
});
route('PUT', '/api/users/:id', 'admin', ({ body, params, user, ip }) => {
  const v = userVals(body);
  if (Number(params.id) === user.id && (v[2] !== 'admin' || !v[4])) fail(400, 'Kendi yönetici yetkinizi kaldıramazsınız.');
  const before = db.prepare('SELECT role, active FROM users WHERE id = ?').get(params.id);
  if (!before) fail(404, 'Kullanıcı bulunamadı.');
  if (body.password) { const bad = A.passwordProblem(body.password, v[1]); if (bad) fail(400, bad); }
  try { db.prepare('UPDATE users SET name=?, email=?, role=?, doctor_id=?, active=? WHERE id=?').run(...v, params.id); }
  catch (e) { if (/UNIQUE/.test(e.message)) fail(409, 'Bu e-posta zaten kayıtlı.'); throw e; }
  if (body.password) db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(A.hashPassword(String(body.password)), params.id);
  if (body.reset_2fa) db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?").run(params.id);
  // yetkisi değişen, parolası sıfırlanan ya da pasifleşen kullanıcının oturumları kapanır
  if (body.password || !v[4] || before.role !== v[2] || body.reset_2fa) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.id);
  audit(user, ip, 'user.update', v[1] + ' (' + v[2] + (v[4] ? '' : ', pasif') + (body.password ? ', parola sıfırlandı' : '') + (body.reset_2fa ? ', 2FA sıfırlandı' : '') + ')');
  return { ok: true };
});
route('DELETE', '/api/users/:id', 'admin', ({ params, user, ip }) => {
  if (Number(params.id) === user.id) fail(400, 'Kendinizi silemezsiniz.');
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  if (u) audit(user, ip, 'user.delete', u.email);
  return { ok: true };
});

/* giderler */
const EXPENSE_CATS = ['Kira', 'Personel', 'Malzeme', 'Laboratuvar', 'Faturalar', 'Pazarlama', 'Cihaz ve bakım', 'Vergi ve muhasebe', 'Diğer'];
function expenseVals(b) {
  const date = str(b.date, 10), amount = int(b.amount);
  need(S.isDate(date), 'Tarih seçin.');
  need(amount > 0 && amount < 1e9, 'Tutar girin.');
  need(EXPENSE_CATS.includes(b.category), 'Gider türü seçin.');
  return [date, b.category, amount, str(b.note, 300)];
}
route('GET', '/api/expenses', 'admin', ({ query }) => {
  const from = S.isDate(query.from) ? query.from : '0000-00-00', to = S.isDate(query.to) ? query.to : '9999-12-31';
  return { categories: EXPENSE_CATS, items: db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 2000').all(from, to) };
});
route('POST', '/api/expenses', 'admin', ({ body }) => {
  const r = db.prepare('INSERT INTO expenses (date, category, amount, note) VALUES (?,?,?,?)').run(...expenseVals(body));
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/expenses/:id', 'admin', ({ body, params }) => {
  db.prepare('UPDATE expenses SET date=?, category=?, amount=?, note=? WHERE id=?').run(...expenseVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/expenses/:id', 'admin', ({ params }) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(params.id);
  return { ok: true };
});

/* analiz */
route('GET', '/api/analytics', 'admin', ({ query }) => require('./analytics').report(query));

/* güvenlik günlüğü */
route('GET', '/api/audit', 'admin', () => ({ items: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all() }));

/* ── Dağıtıcı ──────────────────────────────────────────────────────── */
async function handle(req, res, url, ip) {
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  try {
    let match = null, allowed = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      allowed = true;
      if (r.method !== req.method) continue;
      match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])])) };
      break;
    }
    if (!match) return send(allowed ? 405 : 404, { error: allowed ? 'Yöntem desteklenmiyor.' : 'Bulunamadı.' });

    let body = {};
    if (req.method !== 'GET') {
      // CSRF: yalnızca JSON kabul edilir ve tarayıcıdan gelen istek aynı siteden olmalıdır
      if (!/^application\/json/.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON bekleniyor.' });
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch {}
        if (host !== req.headers.host) return send(403, { error: 'İzin verilmeyen kaynak.' });
      }
      const raw = await readBody(req, /\/photo$/.test(url.pathname) ? 4e6 : 5e5);
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'Geçersiz JSON.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
    }

    const user = A.userFromRequest(req, !req.headers['x-background']);
    const { perm } = match.r;
    if (perm !== 'public' && !user) return send(401, { error: 'Oturum açın.' });
    if (perm === 'admin' && user.role !== 'admin') return send(403, { error: 'Bu işlem için yönetici yetkisi gerekli.' });

    const query = Object.fromEntries(url.searchParams);
    const out = await match.r.fn({ req, res, url, params: match.params, query, body, user, ip });
    send(200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, Object.assign({ error: e.message }, e.extra));
    console.error(new Date().toISOString(), req.method, url.pathname, e);
    send(500, { error: 'Sunucu hatası.' });
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'İstek çok büyük.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { handle };
