/* Atlas — başlangıç verisi.
   npm run seed               → hekim yoksa iki hekim; boş biyografilere örnek metin ve örnek portre ekler
   npm run seed -- --users    → her rol için örnek kullanıcı (yalnızca yerel deneme); parolalar data/dev-credentials.txt dosyasına yazılır
   npm run seed -- --sample   → 12 aylık örnek veri: hasta, randevu, tedavi, ücret/maliyet, gider (mevcut hasta verisini SİLER)
   TURSO_DATABASE_URL tanımlıysa uzak (canlı) veritabanına yazar.
   Hekim adları Google yorumlarından; biyografiler ve portreler ÖRNEKTİR — panelden gerçekleriyle değiştirin. */
'use strict';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { q, ready, putFile, WEEK, DATA_DIR, REMOTE } = require('./db');
const A = require('./auth');

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

async function main() {
  await ready();
  if ((await q.get('SELECT COUNT(*) n FROM doctors')).n === 0) {
    const ins = 'INSERT INTO doctors (name, title, specialty, color, slot_min, hours, sort) VALUES (?,?,?,?,?,?,?)';
    await q.run(ins, 'Saim', 'Dt.', 'Protetik diş tedavisi', '#3f6454', 30, JSON.stringify(WEEK), 0);
    await q.run(ins, 'Esra', 'Dt.', 'Estetik diş hekimliği', '#a7743f', 30, JSON.stringify(WEEK), 1);
    console.log('2 hekim eklendi (Dt. Saim, Dt. Esra) — soyadlarını ve saatlerini panelden güncelleyin.');
  }

  const docs = await q.all('SELECT * FROM doctors ORDER BY sort, id');
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!d.bio) {
      const b = SAMPLE_BIO[i % SAMPLE_BIO.length];
      await q.run('UPDATE doctors SET bio = ?, bio_en = ?, bio_de = ? WHERE id = ?', b.tr, b.en, b.de, d.id);
    }
    if (!d.photo) {
      const name = d.id + '-sample-' + crypto.randomBytes(4).toString('hex') + '.svg';
      await putFile('doctors/' + name, 'image/svg+xml', Buffer.from(sampleAvatar(i)));
      await q.run('UPDATE doctors SET photo = ? WHERE id = ?', '/uploads/doctors/' + name, d.id);
    }
  }
  console.log('Hekim biyografi ve portreleri: boş olanlara örnek eklendi.');

  /* ── Örnek kullanıcılar (yalnızca yerel) ── */
  if (process.argv.includes('--users')) {
    if (REMOTE) throw new Error('Örnek kullanıcılar canlı veritabanına eklenmez.');
    const pw = () => crypto.randomBytes(12).toString('base64url');   // 16 karakter, rastgele
    const saim = await q.get("SELECT id FROM doctors WHERE name LIKE 'Saim%' ORDER BY id LIMIT 1");
    const sample = [
      ['Örnek Yönetici', 'yonetici@atlas.test', 'admin', null],
      ['Örnek Sekreter', 'sekreter@atlas.test', 'staff', null],
      ['Dt. Saim (örnek hesap)', 'saim@atlas.test', 'doctor', saim ? saim.id : null]
    ];
    const lines = [];
    for (const [name, email, role, doctorId] of sample) {
      if (await q.get('SELECT id FROM users WHERE email = ?', email)) { lines.push(email + '  (zaten vardı, parola değişmedi)'); continue; }
      const p = pw();
      await q.run('INSERT INTO users (name, email, pass_hash, role, doctor_id) VALUES (?,?,?,?,?)', name, email, A.hashPassword(p), role, doctorId);
      lines.push(email.padEnd(24) + p + '   ' + role);
    }
    const file = path.join(DATA_DIR, 'dev-credentials.txt');
    fs.appendFileSync(file, '# Örnek hesaplar — yalnızca yerel deneme için. Canlıya almadan önce silin.\n' + lines.join('\n') + '\n\n', { mode: 0o600 });
    console.log('Örnek kullanıcılar oluşturuldu → ' + file);
  }

  if (process.argv.includes('--sample')) {
    const n = await require('./sample').run();
    console.log('Örnek veri: ' + n.patients + ' hasta, ' + n.appointments + ' randevu, ' + n.records + ' tedavi kaydı, ' + n.expenses + ' gider.');
  }
}

main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
