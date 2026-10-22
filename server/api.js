/* Atlas — API.
   /api/public/*  web sitesi (oturum gerekmez)
   /api/auth/*    giriş, çıkış, ilk kurulum
   /api/*         yönetim paneli (oturum gerekir; bazıları yalnızca yönetici) */
'use strict';

const crypto = require('node:crypto');
const { q, ready, getSettings, setSettings, getContent, parseDoctor, audit, putFile, delFile, WEEK } = require('./db');
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

const getAppt = (id, t) => (t || q).get(APPT_SELECT + ' WHERE a.id = ?', id);
const count = async (sql, ...a) => (await q.get(sql, ...a)).n;

function endOf(date, time, dur) { return date + ' ' + S.toHM(S.toMin(time) + dur); }

/* ── Uç noktalar ───────────────────────────────────────────────────── */
const routes = [];
const route = (method, path, perm, fn) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, perm, fn });
};

/* public: site yapılandırması */
route('GET', '/api/public/config', 'public', async () => {
  const st = await getSettings();
  return {
    booking: { enabled: !!st.booking_enabled, days: st.booking_days, closed: st.closed_dates, today: S.today() },
    services: await q.all('SELECT id, key, name, duration_min FROM services WHERE active = 1 AND online = 1 ORDER BY sort, id'),
    doctors: await q.all("SELECT id, title || ' ' || name AS name FROM doctors WHERE active = 1 AND online = 1 ORDER BY sort, id")
  };
});

route('GET', '/api/public/slots', 'public', async ({ query }) => {
  return { slots: (await S.available({ date: query.date, serviceId: int(query.service), doctorId: int(query.doctor) })).map((s) => s.time) };
});

route('POST', '/api/public/book', 'public', async ({ body, ip }) => {
  if (str(body.website)) return { ok: true };                 // bal küpü: botlara sessizce "tamam"
  if (await A.limited('book:' + ip, 6, 3600e3)) fail(429, 'Çok fazla deneme. Lütfen bizi arayın.');
  const name = str(body.name, 120), phone = normPhone(body.phone), note = str(body.note, 1000);
  const serviceId = int(body.service), doctorId = int(body.doctor), date = str(body.date, 10), time = str(body.time, 5);
  need(name.length >= 2, 'Ad soyad gerekli.');
  need(/^05\d{9}$/.test(phone), 'Geçerli bir cep telefonu girin.');
  need(body.consent === true, 'Aydınlatma metnini onaylamanız gerekiyor.');
  need(S.isDate(date) && S.isTime(time), 'Tarih ve saat seçin.');

  return q.tx(async (t) => {
    const slot = (await S.available({ date, serviceId, doctorId }, t)).find((s) => s.time === time);
    if (!slot) fail(409, 'Bu saat az önce doldu. Lütfen başka bir saat seçin.');
    const docId = doctorId || slot.doctors[0];
    const svc = await t.get('SELECT * FROM services WHERE id = ?', serviceId);

    let p = await t.get('SELECT * FROM patients WHERE phone = ? ORDER BY id LIMIT 1', phone);
    if (!p) {
      const r = await t.run("INSERT INTO patients (name, phone, consent_at) VALUES (?, ?, datetime('now'))", name, phone);
      p = { id: r.lastInsertRowid };
    } else if (!p.consent_at) {
      await t.run("UPDATE patients SET consent_at = datetime('now') WHERE id = ?", p.id);
    }
    await t.run(`INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, source, note)
      VALUES (?, ?, ?, ?, ?, 'pending', 'online', ?)`,
      p.id, docId, serviceId, date + ' ' + time, endOf(date, time, svc.duration_min), (name !== p.name && p.name ? 'Formdaki ad: ' + name + '\n' : '') + note);
    const d = await t.get('SELECT title, name FROM doctors WHERE id = ?', docId);
    return { ok: true, date, time, doctor: d.title + ' ' + d.name, service: svc.name };
  });
});

/* auth */
route('GET', '/api/auth/state', 'public', async ({ user }) => ({
  setup: (await count('SELECT COUNT(*) n FROM users')) === 0,
  user: user || null
}));

route('POST', '/api/auth/setup', 'public', async ({ body, req, res, ip }) => {
  if (await A.limited('setup:' + ip, 10, 3600e3)) fail(429, 'Çok fazla deneme.');
  if ((await count('SELECT COUNT(*) n FROM users')) > 0) fail(403, 'Kurulum zaten yapılmış.');
  const name = str(body.name, 80), email = str(body.email, 120).toLowerCase(), pw = String(body.password || '');
  need(name && /^\S+@\S+\.\S+$/.test(email), 'Ad ve geçerli bir e-posta girin.');
  const bad = A.passwordProblem(pw, email); if (bad) fail(400, bad);
  const r = await q.run("INSERT INTO users (name, email, pass_hash, role) VALUES (?, ?, ?, 'admin')", name, email, A.hashPassword(pw));
  const id = r.lastInsertRowid;
  await audit({ id, name, email }, ip, 'setup', 'İlk yönetici hesabı oluşturuldu');
  res.setHeader('Set-Cookie', A.cookieHeader(req, await A.createSession(id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/login', 'public', async ({ body, req, res, ip }) => {
  const email = str(body.email, 120).toLowerCase(), pw = String(body.password || '');
  if ((await A.limited('login:' + ip, 20, 900e3)) || (await A.limited('login:' + email, 8, 900e3))) fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
  const u = await q.get('SELECT * FROM users WHERE email = ?', email);
  const ok = A.checkPassword(pw, u ? u.pass_hash : A.DUMMY);
  if (!u || !ok || !u.active) {
    await audit(u || null, ip, 'login.fail', email);
    fail(401, 'E-posta ya da parola hatalı.');
  }
  if (u.totp_enabled) return { mfa: true, ticket: await A.mfaTicket(u.id) };
  await audit(u, ip, 'login', '');
  res.setHeader('Set-Cookie', A.cookieHeader(req, await A.createSession(u.id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/mfa', 'public', async ({ body, req, res, ip }) => {
  if (await A.limited('mfa:' + ip, 20, 900e3)) fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
  const t = await A.useTicket(body.ticket);
  if (!t) fail(401, 'Süre doldu. Lütfen yeniden giriş yapın.', { restart: true });
  const u = await q.get('SELECT * FROM users WHERE id = ?', t.userId);
  const step = u && u.active ? A.verifyTotp(u.totp_secret, body.code, u.totp_last) : 0;
  if (!step) { await audit(u, ip, 'mfa.fail', ''); fail(401, 'Kod hatalı.'); }
  await t.done();
  await q.run('UPDATE users SET totp_last = ? WHERE id = ?', step, u.id);
  await audit(u, ip, 'login', 'iki adımlı');
  res.setHeader('Set-Cookie', A.cookieHeader(req, await A.createSession(u.id, ip), A.TTL));
  return { ok: true };
});

route('POST', '/api/auth/logout', 'public', async ({ req, res }) => {
  await A.destroySession(A.sessionToken(req));
  res.setHeader('Set-Cookie', A.cookieHeader(req, '', 0));
  return { ok: true };
});

route('POST', '/api/auth/password', 'any', async ({ body, user, req, ip }) => {
  if (await A.limited('pw:' + user.id, 10, 900e3)) fail(429, 'Çok fazla deneme.');
  const u = await q.get('SELECT * FROM users WHERE id = ?', user.id);
  if (!A.checkPassword(String(body.current || ''), u.pass_hash)) fail(400, 'Mevcut parola hatalı.');
  const bad = A.passwordProblem(body.next, u.email); if (bad) fail(400, bad);
  await q.run('UPDATE users SET pass_hash = ? WHERE id = ?', A.hashPassword(String(body.next)), user.id);
  await A.destroyUserSessions(user.id, A.sessionToken(req));      // diğer cihazlardaki oturumlar kapanır
  await audit(user, ip, 'password.change', '');
  return { ok: true };
});

/* iki adımlı doğrulama kurulumu */
route('POST', '/api/auth/2fa/start', 'any', async ({ user }) => {
  const secret = A.newTotpSecret();
  await q.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ? AND totp_enabled = 0', secret, user.id);
  const u = await q.get('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', user.id);
  if (u.totp_enabled) fail(400, 'İki adımlı doğrulama zaten açık.');
  const label = encodeURIComponent('Atlas Panel:' + user.email);
  return { secret: u.totp_secret, uri: 'otpauth://totp/' + label + '?secret=' + u.totp_secret + '&issuer=Atlas%20Panel&digits=6&period=30' };
});
route('POST', '/api/auth/2fa/enable', 'any', async ({ body, user, ip }) => {
  const u = await q.get('SELECT * FROM users WHERE id = ?', user.id);
  const step = A.verifyTotp(u.totp_secret, body.code, 0);
  if (!step) fail(400, 'Kod hatalı. Uygulamadaki güncel 6 haneli kodu girin.');
  await q.run('UPDATE users SET totp_enabled = 1, totp_last = ? WHERE id = ?', step, user.id);
  await audit(user, ip, '2fa.enable', '');
  return { ok: true };
});
route('POST', '/api/auth/2fa/disable', 'any', async ({ body, user, ip }) => {
  const u = await q.get('SELECT * FROM users WHERE id = ?', user.id);
  if (!A.checkPassword(String(body.password || ''), u.pass_hash)) fail(400, 'Parola hatalı.');
  await q.run("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?", user.id);
  await audit(user, ip, '2fa.disable', '');
  return { ok: true };
});

/* gösterge */
route('GET', '/api/dashboard', 'any', async () => {
  const t = S.today();
  return {
    today: t,
    todayList: await q.all(APPT_SELECT + " WHERE substr(a.start,1,10) = ? AND a.status != 'cancelled' ORDER BY a.start", t),
    pending: await q.all(APPT_SELECT + " WHERE a.status = 'pending' AND a.start >= ? ORDER BY a.start LIMIT 50", t),
    stats: {
      today: await count("SELECT COUNT(*) n FROM appointments WHERE substr(start,1,10) = ? AND status NOT IN ('cancelled')", t),
      week: await count("SELECT COUNT(*) n FROM appointments WHERE substr(start,1,10) BETWEEN ? AND ? AND status NOT IN ('cancelled')", t, S.addDays(t, 6)),
      pending: await count("SELECT COUNT(*) n FROM appointments WHERE status = 'pending' AND start >= ?", t),
      patients: await count('SELECT COUNT(*) n FROM patients'),
      newPatients30: await count("SELECT COUNT(*) n FROM patients WHERE created_at >= datetime('now','-30 days')"),
      balance: await count('SELECT COALESCE(SUM(fee - paid),0) n FROM records')
    }
  };
});

/* randevular */
route('GET', '/api/appointments', 'any', async ({ query }) => {
  const w = [], a = [];
  if (S.isDate(query.from)) { w.push('substr(a.start,1,10) >= ?'); a.push(query.from); }
  if (S.isDate(query.to)) { w.push('substr(a.start,1,10) <= ?'); a.push(query.to); }
  if (int(query.doctor)) { w.push('a.doctor_id = ?'); a.push(int(query.doctor)); }
  if (int(query.patient)) { w.push('a.patient_id = ?'); a.push(int(query.patient)); }
  if (STATUSES.includes(query.status)) { w.push('a.status = ?'); a.push(query.status); }
  if (query.q) { w.push('(p.name LIKE ? OR p.phone LIKE ?)'); a.push('%' + query.q + '%', '%' + normPhone(query.q) + '%'); }
  const sql = APPT_SELECT + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY a.start ' + (query.order === 'desc' ? 'DESC' : 'ASC') + ' LIMIT 1000';
  return { items: await q.all(sql, ...a) };
});

async function saveAppt(body, id) {
  const date = str(body.date, 10), time = str(body.time, 5);
  need(S.isDate(date) && S.isTime(time), 'Tarih ve saat geçersiz.');
  const doctorId = int(body.doctor_id), serviceId = int(body.service_id);
  const doctor = parseDoctor(await q.get('SELECT * FROM doctors WHERE id = ?', doctorId));
  need(doctor, 'Hekim seçin.');
  const svc = serviceId ? await q.get('SELECT * FROM services WHERE id = ?', serviceId) : null;
  const dur = int(body.duration) || (svc ? svc.duration_min : doctor.slot_min);
  need(dur >= 5 && dur <= 480, 'Süre geçersiz.');
  const status = STATUSES.includes(body.status) ? body.status : 'confirmed';

  return q.tx(async (t) => {
    let patientId = int(body.patient_id);
    if (!patientId) {
      const name = str(body.patient_name, 120), phone = normPhone(body.patient_phone);
      need(name.length >= 2, 'Hasta seçin ya da yeni hasta adı girin.');
      const ex = phone ? await t.get('SELECT id FROM patients WHERE phone = ?', phone) : null;
      patientId = ex ? ex.id : (await t.run('INSERT INTO patients (name, phone) VALUES (?, ?)', name, phone)).lastInsertRowid;
    }
    if (!body.force && !['cancelled', 'noshow'].includes(status)) {
      const why = await S.fits(doctor, date, time, dur, id, t);
      if (why) fail(409, why === 'busy' ? 'Hekimin bu saatte başka randevusu var.' : 'Bu saat hekimin çalışma saatleri dışında.', { canForce: true });
    }
    const vals = [patientId, doctorId, serviceId, date + ' ' + time, endOf(date, time, dur), status, str(body.note, 2000)];
    if (id) {
      await t.run("UPDATE appointments SET patient_id=?, doctor_id=?, service_id=?, start=?, end=?, status=?, note=?, updated_at=datetime('now') WHERE id=?", ...vals, id);
      return getAppt(id, t);
    }
    const source = ['phone', 'panel'].includes(body.source) ? body.source : 'panel';
    const r = await t.run('INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, note, source) VALUES (?,?,?,?,?,?,?,?)', ...vals, source);
    return getAppt(r.lastInsertRowid, t);
  });
}

route('POST', '/api/appointments', 'any', ({ body }) => saveAppt(body));
route('PUT', '/api/appointments/:id', 'any', async ({ body, params }) => {
  const cur = await getAppt(params.id);
  if (!cur) fail(404, 'Randevu bulunamadı.');
  // yalnızca durum değişiyorsa çakışma denetimi gerekmez
  if (Object.keys(body).length === 1 && STATUSES.includes(body.status)) {
    await q.run("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?", body.status, params.id);
    return getAppt(params.id);
  }
  return saveAppt(body, params.id);
});
route('DELETE', '/api/appointments/:id', 'any', async ({ params }) => {
  await q.run('DELETE FROM appointments WHERE id = ?', params.id);
  return { ok: true };
});

route('GET', '/api/slots', 'any', async ({ query }) => {
  const doctor = parseDoctor(await q.get('SELECT * FROM doctors WHERE id = ?', int(query.doctor)));
  if (!doctor || !S.isDate(query.date)) return { slots: [] };
  const dur = int(query.duration) || doctor.slot_min, out = [];
  for (const r of doctor.hours[S.weekday(query.date)] || [])
    for (let m = S.toMin(r[0]); m + dur <= S.toMin(r[1]); m += doctor.slot_min)
      if (!(await S.fits(doctor, query.date, S.toHM(m), dur, int(query.except)))) out.push(S.toHM(m));
  return { slots: out };
});

/* hastalar */
route('GET', '/api/patients', 'any', async ({ query }) => {
  const term = str(query.q, 80);
  const where = term ? 'WHERE p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?' : '';
  const args = term ? ['%' + term + '%', '%' + (normPhone(term) || term) + '%', '%' + term + '%'] : [];
  const now = S.nowLocal();
  return {
    items: await q.all(`SELECT p.*,
      (SELECT MAX(start) FROM appointments WHERE patient_id = p.id AND start < ?) AS last_visit,
      (SELECT MIN(start) FROM appointments WHERE patient_id = p.id AND start >= ? AND status NOT IN ('cancelled','noshow')) AS next_visit,
      (SELECT COALESCE(SUM(fee - paid),0) FROM records WHERE patient_id = p.id) AS balance
      FROM patients p ${where} ORDER BY p.name COLLATE NOCASE LIMIT ${term ? 50 : 500}`, now, now, ...args)
  };
});

route('GET', '/api/patients/:id', 'any', async ({ params }) => {
  const p = await q.get('SELECT * FROM patients WHERE id = ?', params.id);
  if (!p) fail(404, 'Hasta bulunamadı.');
  return Object.assign(p, {
    appointments: await q.all(APPT_SELECT + ' WHERE a.patient_id = ? ORDER BY a.start DESC', params.id),
    records: await q.all(`SELECT r.*, d.title || ' ' || d.name AS doctor_name FROM records r
      LEFT JOIN doctors d ON d.id = r.doctor_id WHERE r.patient_id = ? ORDER BY r.date DESC, r.id DESC`, params.id)
  });
});

function patientVals(b) {
  const name = str(b.name, 120);
  need(name.length >= 2, 'Ad soyad gerekli.');
  const birth = str(b.birth_date, 10);
  need(!birth || S.isDate(birth), 'Doğum tarihi geçersiz.');
  return [name, normPhone(b.phone), str(b.email, 120), birth, str(b.gender, 10), str(b.allergies, 1000), str(b.notes, 4000)];
}
route('POST', '/api/patients', 'any', async ({ body }) => {
  const r = await q.run('INSERT INTO patients (name, phone, email, birth_date, gender, allergies, notes, consent_at) VALUES (?,?,?,?,?,?,?,?)',
    ...patientVals(body), body.consent ? S.nowLocal() : null);
  return { id: r.lastInsertRowid };
});
route('PUT', '/api/patients/:id', 'any', async ({ body, params }) => {
  await q.run('UPDATE patients SET name=?, phone=?, email=?, birth_date=?, gender=?, allergies=?, notes=? WHERE id=?', ...patientVals(body), params.id);
  if (body.consent === true) await q.run('UPDATE patients SET consent_at = COALESCE(consent_at, ?) WHERE id = ?', S.nowLocal(), params.id);
  return { ok: true };
});
route('DELETE', '/api/patients/:id', 'admin', async ({ params, user, ip }) => {
  const p = await q.get('SELECT name FROM patients WHERE id = ?', params.id);
  await q.tx(async (t) => {
    await t.run('DELETE FROM records WHERE patient_id = ?', params.id);
    await t.run('DELETE FROM appointments WHERE patient_id = ?', params.id);
    await t.run('DELETE FROM patients WHERE id = ?', params.id);
  });
  if (p) await audit(user, ip, 'patient.delete', '#' + params.id + ' ' + p.name);
  return { ok: true };
});

/* tedavi kayıtları */
async function recordVals(b, user) {
  const date = str(b.date, 10), procedure = str(b.procedure, 200);
  need(S.isDate(date) && procedure, 'Tarih ve işlem gerekli.');
  const fee = int(b.fee) || 0, paid = int(b.paid) || 0, cost = int(b.cost) || 0;
  need(fee >= 0 && paid >= 0 && cost >= 0, 'Tutar geçersiz.');
  const sid = int(b.service_id);
  return [int(b.doctor_id) || user.doctor_id || null, date, str(b.tooth, 40), procedure, str(b.note, 4000), fee, paid,
    sid && (await q.get('SELECT id FROM services WHERE id = ?', sid)) ? sid : null, cost];
}
route('POST', '/api/patients/:id/records', 'any', async ({ body, params, user }) => {
  await q.run('INSERT INTO records (patient_id, doctor_id, date, tooth, procedure, note, fee, paid, service_id, cost) VALUES (?,?,?,?,?,?,?,?,?,?)', params.id, ...(await recordVals(body, user)));
  return { ok: true };
});
route('PUT', '/api/records/:id', 'any', async ({ body, params, user }) => {
  await q.run('UPDATE records SET doctor_id=?, date=?, tooth=?, procedure=?, note=?, fee=?, paid=?, service_id=?, cost=? WHERE id=?', ...(await recordVals(body, user)), params.id);
  return { ok: true };
});
/* tüm işlem kayıtları (hasta fark etmeksizin) */
route('GET', '/api/records', 'any', async ({ query }) => {
  const w = [], a = [];
  if (S.isDate(query.from)) { w.push('r.date >= ?'); a.push(query.from); }
  if (S.isDate(query.to)) { w.push('r.date <= ?'); a.push(query.to); }
  if (int(query.doctor)) { w.push('r.doctor_id = ?'); a.push(int(query.doctor)); }
  if (int(query.service)) { w.push('r.service_id = ?'); a.push(int(query.service)); }
  if (query.unpaid === '1') w.push('r.fee > r.paid');
  if (query.q) { w.push('(p.name LIKE ? OR r.procedure LIKE ?)'); a.push('%' + query.q + '%', '%' + query.q + '%'); }
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  return {
    items: await q.all(`SELECT r.*, p.name AS patient_name, s.name AS service_name, d.title || ' ' || d.name AS doctor_name
      FROM records r LEFT JOIN services s ON s.id = r.service_id LEFT JOIN doctors d ON d.id = r.doctor_id JOIN patients p ON p.id = r.patient_id` + where +
      ' ORDER BY r.date DESC, r.id DESC LIMIT 500', ...a),
    sum: await q.get('SELECT COUNT(*) n, COALESCE(SUM(r.fee),0) fee, COALESCE(SUM(r.cost),0) cost, COALESCE(SUM(r.paid),0) paid FROM records r JOIN patients p ON p.id = r.patient_id' + where, ...a)
  };
});

route('DELETE', '/api/records/:id', 'any', async ({ params }) => {
  await q.run('DELETE FROM records WHERE id = ?', params.id);
  return { ok: true };
});

/* hekimler */
route('GET', '/api/doctors', 'any', async () => ({ items: (await q.all('SELECT * FROM doctors ORDER BY active DESC, sort, id')).map(parseDoctor) }));
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
route('POST', '/api/doctors', 'admin', async ({ body, user, ip }) => {
  if (!body.hours) body.hours = WEEK;
  const r = await q.run('INSERT INTO doctors (' + DOC_COLS + ') VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ...doctorVals(body));
  await audit(user, ip, 'doctor.create', body.name);
  return { id: r.lastInsertRowid };
});
route('PUT', '/api/doctors/:id', 'admin', async ({ body, params }) => {
  await q.run('UPDATE doctors SET ' + DOC_COLS.split(', ').map((c) => c + '=?').join(', ') + ' WHERE id=?', ...doctorVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/doctors/:id', 'admin', async ({ params, user, ip }) => {
  const n = await count('SELECT COUNT(*) n FROM appointments WHERE doctor_id = ?', params.id);
  if (n) fail(409, 'Bu hekimin ' + n + ' randevusu var; silmek yerine pasif yapın.');
  const d = await q.get('SELECT * FROM doctors WHERE id = ?', params.id);
  if (d) await removePhoto(d.photo);
  await q.run('UPDATE records SET doctor_id = NULL WHERE doctor_id = ?', params.id);
  await q.run('UPDATE users SET doctor_id = NULL WHERE doctor_id = ?', params.id);
  await q.run('DELETE FROM doctors WHERE id = ?', params.id);
  if (d) await audit(user, ip, 'doctor.delete', d.name);
  return { ok: true };
});

route('POST', '/api/doctors/order', 'admin', async ({ body }) => {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(int).filter((n) => n > 0);
  await q.tx(async (t) => { for (let i = 0; i < ids.length; i++) await t.run('UPDATE doctors SET sort = ? WHERE id = ?', i, ids[i]); });
  return { ok: true };
});

/* hekim fotoğrafı: yalnızca JPEG/PNG/WebP; tür, uzantıya değil dosyanın ilk baytlarına göre belirlenir */
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
async function removePhoto(rel) {
  const m = /^\/uploads\/doctors\/([\w.-]+)$/.exec(rel || '');
  if (m) await delFile('doctors/' + m[1]);
}
route('POST', '/api/doctors/:id/photo', 'admin', async ({ body, params, user, ip }) => {
  const d = await q.get('SELECT * FROM doctors WHERE id = ?', params.id);
  if (!d) fail(404, 'Hekim bulunamadı.');
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  need(m, 'Fotoğraf JPEG, PNG ya da WebP olmalı.');
  const buf = Buffer.from(m[2], 'base64');
  need(buf.length <= 2.5 * 1024 * 1024, 'Fotoğraf en fazla 2,5 MB olabilir.');
  const ext = imageType(buf);
  need(ext, 'Dosya geçerli bir görsel değil.');
  const name = d.id + '-' + crypto.randomBytes(8).toString('hex') + '.' + ext;
  await putFile('doctors/' + name, MIME[ext], buf);
  await removePhoto(d.photo);
  await q.run('UPDATE doctors SET photo = ? WHERE id = ?', '/uploads/doctors/' + name, d.id);
  await audit(user, ip, 'doctor.photo', d.name);
  return { photo: '/uploads/doctors/' + name };
});
route('DELETE', '/api/doctors/:id/photo', 'admin', async ({ params }) => {
  const d = await q.get('SELECT * FROM doctors WHERE id = ?', params.id);
  if (d) { await removePhoto(d.photo); await q.run("UPDATE doctors SET photo = '' WHERE id = ?", d.id); }
  return { ok: true };
});

/* hizmetler */
route('GET', '/api/services', 'any', async () => ({ items: await q.all('SELECT * FROM services ORDER BY sort, id') }));
function serviceVals(b) {
  const name = str(b.name, 80), dur = int(b.duration_min);
  need(name && dur >= 5 && dur <= 480, 'Ad ve süre (5–480 dk) gerekli.');
  const price = int(b.price), cost = int(b.cost) || 0;
  need(cost >= 0, 'Maliyet geçersiz.');
  return [name, dur, price && price > 0 ? price : null, b.online === false ? 0 : 1, b.active === false ? 0 : 1, int(b.sort) || 0, cost];
}
route('POST', '/api/services', 'admin', async ({ body }) => {
  const key = (str(body.key, 40) || str(body.name, 40)).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const r = await q.run('INSERT INTO services (name, duration_min, price, online, active, sort, cost, key) VALUES (?,?,?,?,?,?,?,?)', ...serviceVals(body), key);
  return { id: r.lastInsertRowid };
});
route('PUT', '/api/services/:id', 'admin', async ({ body, params }) => {
  await q.run('UPDATE services SET name=?, duration_min=?, price=?, online=?, active=?, sort=?, cost=? WHERE id=?', ...serviceVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/services/:id', 'admin', async ({ params, query, user, ip }) => {
  const svc = await q.get('SELECT * FROM services WHERE id = ?', params.id);
  if (!svc) return { ok: true };
  const na = await count('SELECT COUNT(*) n FROM appointments WHERE service_id = ?', params.id);
  const nr = await count('SELECT COUNT(*) n FROM records WHERE service_id = ?', params.id);
  if ((na || nr) && query.force !== '1') {
    fail(409, svc.name + ' ' + na + ' randevuda ve ' + nr + ' işlem kaydında kullanılıyor.', { canForce: true, appointments: na, records: nr });
  }
  await q.tx(async (t) => {
    // geçmiş kayıtlar kaybolmasın: işlem kayıtlarında açıklama zaten var; randevulara tedavi adı not olarak düşülür
    await t.run("UPDATE appointments SET note = CASE WHEN note = '' THEN ? ELSE note || char(10) || ? END, service_id = NULL WHERE service_id = ?",
      'Tedavi: ' + svc.name, 'Tedavi: ' + svc.name, params.id);
    await t.run('UPDATE records SET service_id = NULL WHERE service_id = ?', params.id);
    await t.run('DELETE FROM services WHERE id = ?', params.id);
  });
  await audit(user, ip, 'service.delete', svc.name);
  return { ok: true };
});

/* ayarlar */
route('GET', '/api/settings', 'any', () => getSettings());
route('PUT', '/api/settings', 'admin', async ({ body, user, ip }) => {
  const s = {};
  if ('clinic_name' in body) s.clinic_name = str(body.clinic_name, 120);
  if ('phone_display' in body) s.phone_display = str(body.phone_display, 40);
  if ('phone_e164' in body) { const d = String(body.phone_e164).replace(/[^\d+]/g, ''); need(/^\+\d{10,15}$/.test(d), 'Telefon +90… biçiminde olmalı.'); s.phone_e164 = d; }
  if ('whatsapp' in body) { const d = String(body.whatsapp).replace(/\D/g, ''); need(/^\d{10,15}$/.test(d), 'WhatsApp numarası geçersiz.'); s.whatsapp = d; }
  if ('booking_enabled' in body) s.booking_enabled = !!body.booking_enabled;
  if ('booking_days' in body) { const n = int(body.booking_days); need(n >= 1 && n <= 180, 'Gün sayısı 1–180 olmalı.'); s.booking_days = n; }
  if ('booking_notice_min' in body) { const n = int(body.booking_notice_min); need(n >= 0 && n <= 10080, 'Süre geçersiz.'); s.booking_notice_min = n; }
  if ('closed_dates' in body) s.closed_dates = (Array.isArray(body.closed_dates) ? body.closed_dates : []).filter(S.isDate).sort();
  await setSettings(s);
  await audit(user, ip, 'settings', Object.keys(s).join(', '));
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
route('PUT', '/api/content', 'admin', async ({ body, user, ip }) => {
  const changes = Array.isArray(body.changes) ? body.changes : [];
  await audit(user, ip, 'content', changes.length + ' metin');
  await q.tx(async (t) => {
    for (const c of changes) {
      if (!['tr', 'en', 'de'].includes(c.lang) || !/^[\w.-]{1,60}$/.test(c.key || '')) continue;
      if (c.value === null) await t.run('DELETE FROM content WHERE lang = ? AND key = ?', c.lang, c.key);
      else await t.run('INSERT INTO content (lang, key, value) VALUES (?,?,?) ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value',
        c.lang, c.key, safeHtml(String(c.value).slice(0, 5000)));
    }
  });
  return getContent();
});

/* kullanıcılar */
route('GET', '/api/users', 'admin', async () => ({ items: await q.all('SELECT id, name, email, role, doctor_id, active, created_at, last_login, totp_enabled FROM users ORDER BY id') }));
function userVals(b) {
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
  need(name && /^\S+@\S+\.\S+$/.test(email), 'Ad ve geçerli e-posta gerekli.');
  need(['admin', 'staff', 'doctor'].includes(b.role), 'Rol geçersiz.');
  return [name, email, b.role, b.role === 'doctor' ? int(b.doctor_id) : null, b.active === false ? 0 : 1];
}
const unique = (e) => /UNIQUE/i.test(e && e.message);
route('POST', '/api/users', 'admin', async ({ body, user, ip }) => {
  const v = userVals(body);
  const bad = A.passwordProblem(body.password, v[1]); if (bad) fail(400, bad);
  try {
    const r = await q.run('INSERT INTO users (name, email, role, doctor_id, active, pass_hash) VALUES (?,?,?,?,?,?)', ...v, A.hashPassword(String(body.password)));
    await audit(user, ip, 'user.create', v[1] + ' (' + v[2] + ')');
    return { id: r.lastInsertRowid };
  } catch (e) { if (unique(e)) fail(409, 'Bu e-posta zaten kayıtlı.'); throw e; }
});
route('PUT', '/api/users/:id', 'admin', async ({ body, params, user, ip }) => {
  const v = userVals(body);
  if (Number(params.id) === user.id && (v[2] !== 'admin' || !v[4])) fail(400, 'Kendi yönetici yetkinizi kaldıramazsınız.');
  const before = await q.get('SELECT role, active FROM users WHERE id = ?', params.id);
  if (!before) fail(404, 'Kullanıcı bulunamadı.');
  if (body.password) { const bad = A.passwordProblem(body.password, v[1]); if (bad) fail(400, bad); }
  try { await q.run('UPDATE users SET name=?, email=?, role=?, doctor_id=?, active=? WHERE id=?', ...v, params.id); }
  catch (e) { if (unique(e)) fail(409, 'Bu e-posta zaten kayıtlı.'); throw e; }
  if (body.password) await q.run('UPDATE users SET pass_hash = ? WHERE id = ?', A.hashPassword(String(body.password)), params.id);
  if (body.reset_2fa) await q.run("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?", params.id);
  // yetkisi değişen, parolası sıfırlanan ya da pasifleşen kullanıcının oturumları kapanır
  if (body.password || !v[4] || before.role !== v[2] || body.reset_2fa) await q.run('DELETE FROM sessions WHERE user_id = ?', params.id);
  await audit(user, ip, 'user.update', v[1] + ' (' + v[2] + (v[4] ? '' : ', pasif') + (body.password ? ', parola sıfırlandı' : '') + (body.reset_2fa ? ', 2FA sıfırlandı' : '') + ')');
  return { ok: true };
});
route('DELETE', '/api/users/:id', 'admin', async ({ params, user, ip }) => {
  if (Number(params.id) === user.id) fail(400, 'Kendinizi silemezsiniz.');
  const u = await q.get('SELECT email FROM users WHERE id = ?', params.id);
  await q.run('DELETE FROM sessions WHERE user_id = ?', params.id);
  await q.run('DELETE FROM users WHERE id = ?', params.id);
  if (u) await audit(user, ip, 'user.delete', u.email);
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
route('GET', '/api/expenses', 'admin', async ({ query }) => {
  const from = S.isDate(query.from) ? query.from : '0000-00-00', to = S.isDate(query.to) ? query.to : '9999-12-31';
  return { categories: EXPENSE_CATS, items: await q.all('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 2000', from, to) };
});
route('POST', '/api/expenses', 'admin', async ({ body }) => {
  const r = await q.run('INSERT INTO expenses (date, category, amount, note) VALUES (?,?,?,?)', ...expenseVals(body));
  return { id: r.lastInsertRowid };
});
route('PUT', '/api/expenses/:id', 'admin', async ({ body, params }) => {
  await q.run('UPDATE expenses SET date=?, category=?, amount=?, note=? WHERE id=?', ...expenseVals(body), params.id);
  return { ok: true };
});
route('DELETE', '/api/expenses/:id', 'admin', async ({ params }) => {
  await q.run('DELETE FROM expenses WHERE id = ?', params.id);
  return { ok: true };
});

/* analiz */
route('GET', '/api/analytics', 'admin', ({ query }) => require('./analytics').report(query));

/* örnek veri: kaç tane var, tek tıkla sil */
const SAMPLE = "notes = 'Örnek kayıt'";
route('GET', '/api/sample', 'admin', async () => ({
  patients: await count('SELECT COUNT(*) n FROM patients WHERE ' + SAMPLE),
  expenses: await count("SELECT COUNT(*) n FROM expenses WHERE note LIKE '%(örnek)'")
}));
route('POST', '/api/sample/clear', 'admin', async ({ user, ip }) => {
  const ids = 'SELECT id FROM patients WHERE ' + SAMPLE;
  await q.tx(async (t) => {
    await t.run('DELETE FROM records WHERE patient_id IN (' + ids + ')');
    await t.run('DELETE FROM appointments WHERE patient_id IN (' + ids + ')');
    await t.run('DELETE FROM patients WHERE ' + SAMPLE);
    await t.run("DELETE FROM expenses WHERE note LIKE '%(örnek)'");
  });
  await audit(user, ip, 'sample.clear', 'Örnek hasta, randevu, işlem ve giderler silindi');
  return { ok: true };
});

/* güvenlik günlüğü */
route('GET', '/api/audit', 'admin', async () => ({ items: await q.all('SELECT * FROM audit ORDER BY id DESC LIMIT 300') }));

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

    await ready();
    const user = await A.userFromRequest(req, !req.headers['x-background']);
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

/* Gövde: Vercel bazen isteği önceden okur (req.body); yerel sunucuda akıştan okunur */
function readBody(req, limit) {
  if (req.body !== undefined && req.body !== null) {
    const b = req.body;
    const s = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : JSON.stringify(b);
    if (s.length > limit) return Promise.reject(new HttpError(413, 'İstek çok büyük.'));
    return Promise.resolve(s);
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'İstek çok büyük.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { handle, HttpError };
