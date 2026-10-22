/* Atlas — örnek veri (yalnızca deneme ve sunum için; kişiler ve tutarlar gerçek değildir).
   Son 12 ay + önümüzdeki 3 hafta: hastalar, randevular, tedavi kayıtları (ücret/maliyet/ödeme) ve aylık giderler.
   Var olan hasta, randevu, tedavi ve gider kayıtlarını SİLER; kullanıcılar, hekimler, site metinleri kalır.
   Çalıştırma: npm run seed -- --sample */
'use strict';

const { q, ready, parseDoctor } = require('./db');
const S = require('./slots');

/* tekrarlanabilir rastgelelik */
function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261022);
const pick = (a) => a[Math.floor(R() * a.length)];
const between = (a, b) => a + R() * (b - a);
const round50 = (n) => Math.round(n / 50) * 50;
function weighted(items) { const t = items.reduce((s, x) => s + x.w, 0); let r = R() * t; for (const x of items) { r -= x.w; if (r <= 0) return x; } return items[items.length - 1]; }

/* örnek fiyat ve maliyetler (₺) — klinik kendi rakamlarıyla değiştirmeli */
const PRICES = {
  genel: [1000, 100, 30], zirkonyum: [9000, 2600, 14], lamine: [11000, 3200, 6], emax: [9500, 2900, 4], implant: [26000, 8500, 6],
  kanal: [5000, 650, 12], bleaching: [6000, 900, 5], ortodonti: [3000, 350, 10], cocuk: [1500, 200, 8], diseti: [3000, 300, 7], botoks: [7500, 2600, 3]
};
const UNITS = { zirkonyum: [1, 1, 1, 1, 2, 2, 2, 3, 4, 6, 10], lamine: [1, 2, 2, 4, 6, 8], emax: [1, 1, 1, 2, 3], implant: [1, 1, 1, 1, 2] };
// kaplama/implant birkaç seans sürer (ölçü, prova, yapıştırma); ücret yalnızca bir seansta yazılır
const MULTI = { zirkonyum: 0.4, lamine: 0.4, emax: 0.45, implant: 0.35, ortodonti: 1 };
const BIAS = [{ zirkonyum: 1.5, implant: 1.6, emax: 1.2, lamine: 0.7, bleaching: 0.7, botoks: 0.4 },
  { lamine: 1.7, bleaching: 1.6, botoks: 2, cocuk: 1.3, implant: 0.5, zirkonyum: 0.9 }];

const FIRST_F = ['Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Esra', 'Büşra', 'Emine', 'Hatice', 'Selin', 'Derya', 'Seda', 'Gamze', 'Ece', 'Nur', 'Sena', 'Yasemin', 'Hülya', 'Özlem', 'Tuğba'];
const FIRST_M = ['Mehmet', 'Ahmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Murat', 'Emre', 'Burak', 'Can', 'Kerem', 'Yusuf', 'Ömer', 'Serkan', 'Onur', 'Kemal', 'Tolga', 'Fatih', 'Oğuz'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
  'Polat', 'Erdem', 'Aksoy', 'Güneş', 'Tekin', 'Bulut', 'Akın', 'Karaca', 'Uçar', 'Bozkurt'];
const TEETH = ['11', '12', '13', '14', '15', '16', '21', '22', '23', '24', '25', '26', '31', '32', '36', '37', '41', '42', '46', '47'];

async function run() {
  await ready();
  const today = S.today(), now = S.nowLocal();
  const start = S.addDays(today, -365), end = S.addDays(today, 21);
  const doctors = (await q.all('SELECT * FROM doctors WHERE active = 1 ORDER BY sort, id')).map(parseDoctor);
  if (!doctors.length) throw new Error('Önce hekim ekleyin (npm run seed).');

  {
    // hizmetlere örnek fiyat/maliyet (boşsa)
    const svcs = await q.all('SELECT * FROM services WHERE active = 1');
    for (const s of svcs) {
      const p = PRICES[s.key];
      if (p && !s.price) { await q.run('UPDATE services SET price = ?, cost = ? WHERE id = ?', p[0], p[1], s.id); s.price = p[0]; s.cost = p[1]; }
      else if (p && !s.cost) { await q.run('UPDATE services SET cost = ? WHERE id = ?', p[1], s.id); s.cost = p[1]; }
    }
    const svcW = svcs.filter((s) => PRICES[s.key]).map((s) => ({ s, w: PRICES[s.key][2] }));
    // çok seanslı tedavilerin ara seansları: ayrı kalem, fiyatı klinik isterse panelden değiştirir
    async function ensure(key, name, dur, price) {
      let x = await q.get('SELECT * FROM services WHERE key = ?', key);
      if (!x) {
        await q.run('INSERT INTO services (key, name, duration_min, price, cost, online, sort) VALUES (?,?,?,?,0,0,50)', key, name, dur, price);
        x = await q.get('SELECT * FROM services WHERE key = ?', key);
      }
      return x;
    }
    const steps = { 'ölçü': await ensure('olcu', 'Ölçü seansı', 30, 0), prova: await ensure('prova', 'Prova seansı', 30, 0), kontrol: await ensure('kontrol', 'Kontrol muayenesi', 20, 0) };

    // tüm yazmalar tek seferde (uzak veritabanında satır satır göndermek çok yavaş olur); kimlikler burada verilir
    const stmts = ['records', 'appointments', 'patients', 'expenses'].map((t) => ['DELETE FROM ' + t, []]);
    const insP = (...a) => stmts.push(['INSERT INTO patients (id, name, phone, birth_date, gender, notes, consent_at, created_at) VALUES (?,?,?,?,?,?,?,?)', a]);
    const insA = { run: (...a) => stmts.push(['INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', a]) };
    const insR = { run: (...a) => stmts.push(['INSERT INTO records (patient_id, doctor_id, date, tooth, procedure, note, fee, paid, service_id, cost, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', a]) };
    const patients = [];          // { id, child }
    const phones = new Set();
    let nA = 0, nR = 0;

    function newPatient(date, child) {
      const female = R() < 0.56;
      const name = pick(female ? FIRST_F : FIRST_M) + ' ' + pick(LAST);
      let ph; do { ph = '05' + pick(['32', '33', '35', '36', '42', '43', '44', '45', '52', '53', '54', '55']) + String(Math.floor(R() * 1e7)).padStart(7, '0'); } while (phones.has(ph));
      phones.add(ph);
      const y = child ? 2012 + Math.floor(R() * 9) : 1952 + Math.floor(R() * 52);
      const birth = y + '-' + String(1 + Math.floor(R() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(R() * 28)).padStart(2, '0');
      const at = date + ' 09:00:00';
      const id = patients.length + 1;
      insP(id, name, ph, birth, female ? 'Kadın' : 'Erkek', 'Örnek kayıt', at, at);
      const p = { id, child };
      patients.push(p);
      return p;
    }

    for (let date = start; date <= end; date = S.addDays(date, 1)) {
      const prog = (S.toMin('00:00') + (Date.parse(date) - Date.parse(start)) / 864e5) / 365;   // 0 → 1 yıl boyunca
      const month = Number(date.slice(5, 7));
      const future = date > today;
      doctors.forEach((d, di) => {
        const ranges = d.hours[S.weekday(date)] || [];
        // doluluk: yıl içinde artan talep, ağustosta tatil düşüşü, gelecekte henüz dolmamış takvim
        let fill = 0.42 + 0.3 * prog + (month === 8 ? -0.2 : 0) + (month === 1 ? -0.08 : 0) + between(-0.08, 0.08);
        if (future) fill *= Math.max(0.15, 0.85 - (Date.parse(date) - Date.parse(today)) / 864e5 * 0.035);
        for (const [a, b] of ranges) {
          let t = S.toMin(a);
          const e = S.toMin(b);
          while (t + 30 <= e) {
            if (R() > fill) { t += 30; continue; }
            const bias = BIAS[di % BIAS.length];
            const { s } = weighted(svcW.map((x) => ({ s: x.s, w: x.w * (bias[x.s.key] || 1) })));
            const dur = s.duration_min;
            if (t + dur > e) break;
            const startTs = date + ' ' + S.toHM(t), endTs = date + ' ' + S.toHM(t + dur);
            const child = s.key === 'cocuk';
            const pool = patients.filter((p) => p.child === child);
            const p = !pool.length || R() < (child ? 0.5 : 0.3) ? newPatient(date, child) : pool[Math.floor(pool.length * Math.pow(R(), 0.6))];

            let status;
            if (startTs < now) { const r = R(); status = r < 0.07 ? 'cancelled' : r < 0.12 ? 'noshow' : 'done'; }
            else status = R() < 0.2 ? 'pending' : 'confirmed';
            const source = R() < 0.1 + 0.32 * prog ? 'online' : R() < 0.55 ? 'phone' : 'panel';
            const created = S.addDays(date, -Math.floor(between(1, 20))) + ' 10:00:00';
            insA.run(p.id, d.id, s.id, startTs, endTs, status, source, created, created);
            nA++;

            if (status === 'done' && MULTI[s.key] && R() > MULTI[s.key]) {
              const k = pick(['ölçü', 'prova', 'kontrol']), st = steps[k];
              insR.run(p.id, d.id, date, '', s.name + ' — ' + k, '', st.price || 0, st.price || 0, st.id, st.cost || 0, date + ' 18:00:00');
              nR++;
            } else if (status === 'done') {
              const units = UNITS[s.key] ? pick(UNITS[s.key]) : 1;
              const fee = round50(s.price * units * between(0.9, 1.04));
              const cost = round50(s.cost * units * between(0.9, 1.15));
              const recent = date > S.addDays(today, -45);
              const r = R();
              const paid = r < (recent ? 0.72 : 0.9) ? fee : r < 0.97 ? round50(fee * between(0.3, 0.7)) : 0;
              const tooth = units > 1 ? (units >= 10 ? 'Tüm çene' : Array.from({ length: Math.min(units, 4) }, () => pick(TEETH)).join(', ')) : (s.key === 'genel' || s.key === 'botoks' ? '' : pick(TEETH));
              insR.run(p.id, d.id, date, tooth, s.name + (units > 1 ? ' — ' + units + ' diş' : ''), '', fee, paid, s.id, cost, date + ' 18:00:00');
              nR++;
            }
            t += dur;
          }
        }
      });
    }

    // aylık giderler (tedavi başına malzeme/laboratuvar maliyeti kayıtlarda; burada klinik genel giderleri)
    const insE = { run: (...a) => stmts.push(['INSERT INTO expenses (date, category, amount, note) VALUES (?,?,?,?)', a]) };
    let nE = 0;
    for (let m = start.slice(0, 7) + '-01'; m <= today; ) {
      const ym = m.slice(0, 7), prog = (Date.parse(m) - Date.parse(start)) / (365 * 864e5);
      const day = (n) => { const d = ym + '-' + String(n).padStart(2, '0'); return d <= today && d >= start ? d : null; };
      const add = (n, cat, amt, note) => { const d = day(n); if (d) { insE.run(d, cat, round50(amt), note + ' (örnek)'); nE++; } };
      add(1, 'Kira', prog < 0.5 ? 45000 : 52000, 'Aylık kira');
      add(15, 'Personel', 285000 * (prog < 0.5 ? 1 : 1.12) * between(0.98, 1.03), 'Maaşlar ve SGK (hekim hakedişleri dahil)');
      add(10, 'Faturalar', between(7000, 12500), 'Elektrik, su, doğalgaz, internet');
      add(8, 'Malzeme', between(14000, 26000), 'Sarf malzeme (eldiven, anestezik, dolgu…)');
      add(20, 'Pazarlama', between(6000, 16000), 'Sosyal medya reklamları');
      add(25, 'Vergi ve muhasebe', 8500, 'Muhasebe hizmeti');
      if (Number(ym.slice(5)) % 3 === 0) add(18, 'Cihaz ve bakım', between(9000, 22000), 'Ünit ve kompresör bakımı');
      if (R() < 0.35) add(22, 'Diğer', between(2000, 9000), 'Çeşitli');
      const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 10);
    }
    await q.batch(stmts);
    return { patients: patients.length, appointments: nA, records: nR, expenses: nE };
  }
}

module.exports = { run };
