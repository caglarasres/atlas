/* Atlas — başlangıç verisi.
   npm run seed               → hekim yoksa iki hekim; boş biyografilere örnek metin ve örnek portre ekler
   npm run seed -- --users    → her rol için örnek kullanıcı; parolalar data/dev-credentials.txt dosyasına yazılır
   npm run seed -- --demo     → deneme hastaları ve bu haftaya randevular (gerçek kişi değildir)
   npm run seed -- --sample   → 12 aylık örnek veri: hasta, randevu, tedavi, ücret/maliyet, gider (mevcut hasta verisini SİLER)
   Hekim adları Google yorumlarından; biyografiler ve portreler ÖRNEKTİR — panelden gerçekleriyle değiştirin. */
'use strict';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, WEEK, DATA_DIR, UPLOADS } = require('./db');
const A = require('./auth');
const S = require('./slots');

if (db.prepare('SELECT COUNT(*) n FROM doctors').get().n === 0) {
  const ins = db.prepare('INSERT INTO doctors (name, title, specialty, color, slot_min, hours, sort) VALUES (?,?,?,?,?,?,?)');
  ins.run('Saim', 'Dt.', 'Protetik diş tedavisi', '#3f6454', 30, JSON.stringify(WEEK), 0);
  ins.run('Esra', 'Dt.', 'Estetik diş hekimliği', '#a7743f', 30, JSON.stringify(WEEK), 1);
  console.log('2 hekim eklendi (Dt. Saim, Dt. Esra) — soyadlarını ve saatlerini panelden güncelleyin.');
}

/* ── Örnek biyografi ve portre ─────────────────────────────────────── */
const SAMPLE_BIO = [
  {
    tr: 'Zirkonyum ve E-max kaplamalar, köprüler ve implant üstü protezler üzerine çalışıyor.\nHer tedaviye ayrıntılı bir muayene ve hastayla birlikte yapılan bir planla başlıyor.',
    en: 'Works on zirconia and E-max crowns, bridges and implant-supported restorations.\nEvery treatment starts with a thorough examination and a plan made together with the patient.',
    de: 'Schwerpunkte: Zirkon- und E-max-Kronen, Brücken und implantatgetragener Zahnersatz.\nJede Behandlung beginnt mit einer gründlichen Untersuchung und einem gemeinsam erstellten Plan.'
  },
  {
    tr: 'Lamine, bleaching ve gülüş tasarımı gibi estetik uygulamalarla ilgileniyor.\nDoğal görünen, yüze uyumlu sonuçları ön planda tutuyor.',
    en: 'Focuses on aesthetic treatments such as veneers, whitening and smile design.\nAims for natural-looking results that suit the face.',
    de: 'Beschäftigt sich mit ästhetischen Behandlungen wie Veneers, Bleaching und Smile Design.\nZiel sind natürlich wirkende Ergebnisse, die zum Gesicht passen.'
  }
];
const PALETTES = [['#dfe8e2', '#b9d0c2', '#3f6454'], ['#efe5cf', '#e6c59a', '#8a5a2b'], ['#e6e1d5', '#cfd6dc', '#4a5a68']];

/* Örnek portre: yüzsüz, soyut bir siluet (gerçek bir kişiyi temsil etmez) */
function sampleAvatar(i) {
  const [bg, mid, ink] = PALETTES[i % PALETTES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity=".78"/><stop offset="1" stop-color="${ink}" stop-opacity=".95"/></linearGradient></defs>
<rect width="600" height="750" fill="url(#g)"/>
<circle cx="300" cy="300" r="250" fill="#fff" fill-opacity=".18"/>
<ellipse cx="300" cy="300" rx="104" ry="124" fill="url(#s)"/>
<path d="M120 750c8-150 80-250 180-270 100 20 172 120 180 270z" fill="url(#s)"/>
<path d="M262 470h76l-38 70z" fill="#fff" fill-opacity=".9"/>
<text x="300" y="712" text-anchor="middle" font-family="Georgia, serif" font-size="22" letter-spacing="6" fill="#fff" fill-opacity=".85">ÖRNEK FOTOĞRAF</text>
</svg>`;
}

const docs = db.prepare('SELECT * FROM doctors ORDER BY sort, id').all();
docs.forEach((d, i) => {
  if (!d.bio) {
    const b = SAMPLE_BIO[i % SAMPLE_BIO.length];
    db.prepare('UPDATE doctors SET bio = ?, bio_en = ?, bio_de = ? WHERE id = ?').run(b.tr, b.en, b.de, d.id);
  }
  if (!d.photo) {
    const name = d.id + '-sample-' + crypto.randomBytes(4).toString('hex') + '.svg';
    fs.writeFileSync(path.join(UPLOADS, 'doctors', name), sampleAvatar(i));
    db.prepare('UPDATE doctors SET photo = ? WHERE id = ?').run('/uploads/doctors/' + name, d.id);
  }
});
console.log('Hekim biyografi ve portreleri: boş olanlara örnek eklendi.');

/* ── Örnek kullanıcılar ────────────────────────────────────────────── */
if (process.argv.includes('--users')) {
  const pw = () => crypto.randomBytes(12).toString('base64url');   // 16 karakter, rastgele
  const saim = db.prepare("SELECT id FROM doctors WHERE name LIKE 'Saim%' ORDER BY id LIMIT 1").get();
  const sample = [
    ['Örnek Yönetici', 'yonetici@atlas.test', 'admin', null],
    ['Örnek Sekreter', 'sekreter@atlas.test', 'staff', null],
    ['Dt. Saim (örnek hesap)', 'saim@atlas.test', 'doctor', saim ? saim.id : null]
  ];
  const lines = [];
  for (const [name, email, role, doctorId] of sample) {
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) { lines.push(email + '  (zaten vardı, parola değişmedi)'); continue; }
    const p = pw();
    db.prepare('INSERT INTO users (name, email, pass_hash, role, doctor_id) VALUES (?,?,?,?,?)').run(name, email, A.hashPassword(p), role, doctorId);
    lines.push(email.padEnd(24) + p + '   ' + role);
  }
  const file = path.join(DATA_DIR, 'dev-credentials.txt');
  fs.appendFileSync(file, '# Örnek hesaplar — yalnızca yerel deneme için. Canlıya almadan önce silin.\n' + lines.join('\n') + '\n\n', { mode: 0o600 });
  console.log('Örnek kullanıcılar oluşturuldu → ' + file);
}

if (process.argv.includes('--sample')) {
  const n = require('./sample').run();
  console.log('Örnek veri: ' + n.patients + ' hasta, ' + n.appointments + ' randevu, ' + n.records + ' tedavi kaydı, ' + n.expenses + ' gider.');
}

if (process.argv.includes('--demo')) {
  const names = ['Ayşe Demir', 'Mehmet Yıldız', 'Zeynep Kaya', 'Ali Çelik', 'Elif Şahin', 'Burak Aydın', 'Selin Arslan',
    'Emre Koç', 'Derya Öztürk', 'Can Polat', 'Merve Aksoy', 'Hakan Erdem'];
  const insP = db.prepare("INSERT INTO patients (name, phone, birth_date, consent_at, notes) VALUES (?, ?, ?, datetime('now'), 'Deneme kaydı')");
  const ids = names.map((n, i) => Number(insP.run(n, '0555000' + String(1000 + i).slice(-4), (1970 + i * 3) + '-0' + ((i % 9) + 1) + '-15').lastInsertRowid));
  const ds = db.prepare('SELECT id FROM doctors WHERE active = 1').all().map((d) => d.id);
  const svcs = db.prepare('SELECT id, duration_min FROM services').all();
  const insA = db.prepare('INSERT INTO appointments (patient_id, doctor_id, service_id, start, end, status, source) VALUES (?,?,?,?,?,?,?)');
  const times = ['09:30', '10:30', '11:30', '14:00', '15:30', '16:30', '17:30'];
  let k = 0;
  for (let day = -3; day <= 6; day++) {
    const date = S.addDays(S.today(), day);
    if (S.weekday(date) === 0) continue;
    for (let j = 0; j < 4; j++, k++) {
      const svc = svcs[k % svcs.length], t = times[(k * 3 + j) % times.length];
      const status = day < 0 ? (k % 7 === 0 ? 'noshow' : 'done') : day === 0 ? 'confirmed' : (k % 5 === 0 ? 'pending' : 'confirmed');
      insA.run(ids[k % ids.length], ds[j % ds.length], svc.id, date + ' ' + t, date + ' ' + S.toHM(S.toMin(t) + svc.duration_min), status, k % 5 === 0 ? 'online' : 'panel');
    }
  }
  const insR = db.prepare('INSERT INTO records (patient_id, doctor_id, date, tooth, procedure, fee, paid) VALUES (?,?,?,?,?,?,?)');
  insR.run(ids[0], ds[0], S.addDays(S.today(), -3), '11, 21', 'Zirkonyum kaplama — ölçü', 12000, 6000);
  insR.run(ids[1], ds[1 % ds.length], S.addDays(S.today(), -2), '36', 'Kanal tedavisi', 4500, 4500);
  console.log(names.length + ' deneme hastası ve ' + k + ' randevu eklendi.');
}
