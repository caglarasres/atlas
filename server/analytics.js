/* Atlas — analiz.
   Seçilen dönem için ciro, maliyet, gider ve kâr; tedavi ve hekim kırılımları; randevu yoğunluğu.
   Ciro = tedavi kayıtlarındaki ücret; tahsilat = ödenen; brüt kâr = ciro − tedavi maliyeti; net kâr = brüt kâr − giderler. */
'use strict';

const { db } = require('./db');
const S = require('./slots');

const monthStart = (d) => d.slice(0, 7) + '-01';
function addMonths(ym01, n) {
  const d = new Date(ym01 + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
function weekStart(date) { const wd = (S.weekday(date) + 6) % 7; return S.addDays(date, -wd); }   // pazartesi

function totals(from, to, doctorId) {
  const dw = doctorId ? ' AND doctor_id = ' + Number(doctorId) : '';
  const r = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(fee),0) revenue, COALESCE(SUM(paid),0) collected, COALESCE(SUM(cost),0) cost FROM records WHERE date BETWEEN ? AND ?' + dw).get(from, to);
  const a = db.prepare(`SELECT COUNT(*) n, SUM(status IN ('done','arrived')) done, SUM(status = 'noshow') noshow, SUM(status = 'cancelled') cancelled,
    SUM(source = 'online') online FROM appointments WHERE substr(start,1,10) BETWEEN ? AND ?` + dw).get(from, to);
  const ex = doctorId ? null : db.prepare('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date BETWEEN ? AND ?').get(from, to).n;
  const np = db.prepare(`SELECT COUNT(*) n FROM (SELECT patient_id, MIN(substr(start,1,10)) f FROM appointments WHERE status != 'cancelled'` + dw +
    ' GROUP BY patient_id) WHERE f BETWEEN ? AND ?').get(from, to).n;
  const past = (a.done || 0) + (a.noshow || 0);
  return {
    revenue: r.revenue, collected: r.collected, treatmentCost: r.cost, grossProfit: r.revenue - r.cost,
    expenses: ex, netProfit: ex === null ? null : r.revenue - r.cost - ex,
    treatments: r.n, avgTicket: r.n ? Math.round(r.revenue / r.n) : 0,
    appts: a.n, done: a.done || 0, noshow: a.noshow || 0, cancelled: a.cancelled || 0,
    noshowRate: past ? (a.noshow || 0) / past : 0, onlineShare: a.n ? (a.online || 0) / a.n : 0, newPatients: np
  };
}

function report(q) {
  const today = S.today();
  let to = S.isDate(q.to) ? q.to : today;
  let from = S.isDate(q.from) ? q.from : addMonths(monthStart(today), -11);
  if (from > to) [from, to] = [to, from];
  const doctorId = Number(q.doctor) || 0;
  const dw = doctorId ? ' AND r.doctor_id = ' + doctorId : '';
  const aw = doctorId ? ' AND doctor_id = ' + doctorId : '';

  const span = daysBetween(from, to) + 1;
  const prevTo = S.addDays(from, -1), prevFrom = S.addDays(prevTo, -(span - 1));

  /* dönem kovaları: 10 haftadan uzunsa ay, değilse hafta */
  const bucket = span > 70 ? 'month' : 'week';
  const keyOf = bucket === 'month' ? (d) => d.slice(0, 7) : weekStart;
  const keys = [];
  if (bucket === 'month') for (let k = monthStart(from); k <= to; k = addMonths(k, 1)) keys.push(k.slice(0, 7));
  else for (let k = weekStart(from); k <= to; k = S.addDays(k, 7)) keys.push(k);
  const series = new Map(keys.map((k) => [k, { key: k, revenue: 0, cost: 0, expenses: 0, net: 0, appts: 0, newPatients: 0, online: 0 }]));

  const recs = db.prepare(`SELECT r.date, r.fee, r.paid, r.cost, r.service_id, r.doctor_id, s.name service, d.title || ' ' || d.name doctor, d.color
    FROM records r LEFT JOIN services s ON s.id = r.service_id LEFT JOIN doctors d ON d.id = r.doctor_id WHERE r.date BETWEEN ? AND ?` + dw).all(from, to);
  const byService = new Map(), byDoctor = new Map();
  for (const r of recs) {
    const b = series.get(keyOf(r.date)); if (b) { b.revenue += r.fee; b.cost += r.cost; }
    const sk = r.service || 'Diğer';
    const sv = byService.get(sk) || { name: sk, count: 0, revenue: 0, cost: 0 };
    sv.count++; sv.revenue += r.fee; sv.cost += r.cost; byService.set(sk, sv);
    const dk = r.doctor || 'Atanmamış';
    const dv = byDoctor.get(dk) || { name: dk, revenue: 0, cost: 0, appts: 0, noshow: 0, done: 0 };
    dv.revenue += r.fee; dv.cost += r.cost; byDoctor.set(dk, dv);
  }

  const appts = db.prepare(`SELECT a.start, a.status, a.source, d.title || ' ' || d.name doctor FROM appointments a LEFT JOIN doctors d ON d.id = a.doctor_id
    WHERE substr(a.start,1,10) BETWEEN ? AND ?` + (doctorId ? ' AND a.doctor_id = ' + doctorId : '')).all(from, to);
  const heat = {};       // 'gün|saat' → adet
  for (const a of appts) {
    const date = a.start.slice(0, 10);
    const b = series.get(keyOf(date));
    if (a.status !== 'cancelled') {
      if (b) { b.appts++; if (a.source === 'online') b.online++; }
      const k = S.weekday(date) + '|' + Number(a.start.slice(11, 13));
      heat[k] = (heat[k] || 0) + 1;
    }
    const dv = byDoctor.get(a.doctor || 'Atanmamış') || { name: a.doctor || 'Atanmamış', revenue: 0, cost: 0, appts: 0, noshow: 0, done: 0 };
    if (a.status !== 'cancelled') dv.appts++;
    if (a.status === 'noshow') dv.noshow++;
    if (a.status === 'done' || a.status === 'arrived') dv.done++;
    byDoctor.set(dv.name, dv);
  }

  const exps = doctorId ? [] : db.prepare('SELECT date, category, amount FROM expenses WHERE date BETWEEN ? AND ?').all(from, to);
  const byCat = new Map();
  for (const e of exps) {
    const b = series.get(keyOf(e.date)); if (b) b.expenses += e.amount;
    byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
  }

  const firsts = db.prepare(`SELECT MIN(substr(start,1,10)) f FROM appointments WHERE status != 'cancelled'` + aw + ' GROUP BY patient_id').all();
  for (const p of firsts) if (p.f >= from && p.f <= to) { const b = series.get(keyOf(p.f)); if (b) b.newPatients++; }
  for (const b of series.values()) b.net = b.revenue - b.cost - b.expenses;

  // yoğunluk tablosu: pazartesi–cumartesi, randevusu olan saatler
  const hours = Object.keys(heat).map((k) => Number(k.split('|')[1]));
  const h0 = hours.length ? Math.min(...hours) : 9, h1 = hours.length ? Math.max(...hours) : 18;
  const days = [1, 2, 3, 4, 5, 6].concat(Object.keys(heat).some((k) => k.startsWith('0|')) ? [0] : []);
  const weeks = Math.max(1, span / 7);

  return {
    range: { from, to, bucket, prevFrom, prevTo, doctor: doctorId || null },
    totals: totals(from, to, doctorId),
    // önceki dönem karşılaştırması yalnızca o dönemin tamamında kayıt varsa anlamlıdır
    prev: (db.prepare('SELECT MIN(substr(start,1,10)) d FROM appointments').get().d || '9999') <= prevFrom ? totals(prevFrom, prevTo, doctorId) : null,
    outstanding: db.prepare('SELECT COALESCE(SUM(fee - paid),0) n FROM records r WHERE 1=1' + dw).get().n,
    series: [...series.values()],
    byService: [...byService.values()].map((v) => Object.assign(v, { profit: v.revenue - v.cost, margin: v.revenue ? (v.revenue - v.cost) / v.revenue : 0 }))
      .sort((a, b) => b.profit - a.profit),
    byDoctor: [...byDoctor.values()].map((v) => Object.assign(v, { profit: v.revenue - v.cost, noshowRate: v.done + v.noshow ? v.noshow / (v.done + v.noshow) : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    expensesByCat: [...byCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    heatmap: {
      days, hours: Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i),
      cells: days.map((d) => Array.from({ length: h1 - h0 + 1 }, (_, i) => Math.round(((heat[d + '|' + (h0 + i)] || 0) / weeks) * 10) / 10))
    }
  };
}

module.exports = { report };
