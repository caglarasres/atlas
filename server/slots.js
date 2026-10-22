/* Atlas — boş saat hesabı.
   Hekimin haftalık çalışma aralıkları − mevcut randevular − kapalı günler = boş saatler. */
'use strict';

const { q, getSettings, parseDoctor } = require('./db');

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const toHM = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

/* Klinik saatiyle şimdi: 'YYYY-MM-DD HH:MM' (process.env.TZ = Europe/Istanbul) */
function nowLocal(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
const today = () => nowLocal().slice(0, 10);

function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (date) => new Date(date + 'T00:00:00Z').getUTCDay();
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/* Bir hekimin bir gündeki dolu aralıkları (dakika) */
async function busy(doctorId, date, exceptId, t) {
  return (await (t || q).all(`SELECT id, start, end FROM appointments
    WHERE doctor_id = ? AND substr(start, 1, 10) = ? AND status NOT IN ('cancelled','noshow') AND id != ?`,
    doctorId, date, exceptId || 0))
    .map((a) => [toMin(a.start.slice(11)), toMin(a.end.slice(11))]);
}

/* Hekim o gün bu saatte çalışıyor ve boş mu? */
async function fits(doctor, date, startHM, dur, exceptId, t) {
  const s = toMin(startHM), e = s + dur;
  const ranges = (doctor.hours[weekday(date)] || []).map((r) => [toMin(r[0]), toMin(r[1])]);
  if (!ranges.some((r) => s >= r[0] && e <= r[1])) return 'hours';
  if ((await busy(doctor.id, date, exceptId, t)).some((b) => s < b[1] && e > b[0])) return 'busy';
  return null;
}

/* Web sitesi için: bir gün, bir hizmet; hekim seçilmediyse tüm uygun hekimler */
async function available({ date, serviceId, doctorId }, t) {
  const st = await getSettings(t);
  if (!st.booking_enabled || !isDate(date)) return [];
  if ((st.closed_dates || []).includes(date)) return [];
  if (date < today() || date > addDays(today(), st.booking_days)) return [];

  const db = t || q;
  const svc = await db.get('SELECT * FROM services WHERE id = ? AND active = 1 AND online = 1', serviceId);
  if (!svc) return [];
  const docs = (doctorId
    ? await db.all('SELECT * FROM doctors WHERE id = ? AND active = 1 AND online = 1', doctorId)
    : await db.all('SELECT * FROM doctors WHERE active = 1 AND online = 1 ORDER BY sort, id')).map(parseDoctor);

  const earliest = nowLocal(st.booking_notice_min);
  const slots = new Map();    // 'HH:MM' → [doctorId, ...]
  for (const d of docs) {
    const step = d.slot_min || 30;
    const taken = await busy(d.id, date, 0, t);
    for (const r of d.hours[weekday(date)] || []) {
      const a = toMin(r[0]), b = toMin(r[1]);
      for (let s = a; s + svc.duration_min <= b; s += step) {
        const e = s + svc.duration_min;
        if (date + ' ' + toHM(s) < earliest) continue;
        if (taken.some((t) => s < t[1] && e > t[0])) continue;
        const k = toHM(s);
        if (!slots.has(k)) slots.set(k, []);
        slots.get(k).push(d.id);
      }
    }
  }
  return [...slots.keys()].sort().map((t) => ({ time: t, doctors: slots.get(t) }));
}

module.exports = { available, fits, nowLocal, today, addDays, weekday, isDate, isTime, toMin, toHM };
