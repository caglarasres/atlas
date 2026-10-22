# Atlas — site, online randevu ve yönetim paneli

Node.js 22.13+ gerekir; harici paket yoktur (veritabanı Node'un yerleşik SQLite'ıdır).

```bash
npm start            # http://localhost:3000  (site)  ·  /admin/  (panel)
npm run seed             # hekim yoksa iki hekim; boş biyografilere örnek metin ve örnek portre
npm run seed -- --users   # örnek yönetici, sekreter ve hekim hesabı → data/dev-credentials.txt
npm run seed -- --demo    # deneme hastaları ve randevular
npm run seed -- --sample  # 12 aylık örnek veri (hasta, randevu, işlem, ücret/maliyet, gider) — mevcut hasta verisini SİLER
```

İlk açılışta (hiç kullanıcı yoksa) `/admin/` ilk yönetici hesabını oluşturmanızı ister. Veriler `data/` klasöründedir (veritabanı ve yüklenen fotoğraflar; git'e girmez) — düzenli yedekleyin.
Güvenlik önlemleri ve yayın kontrol listesi: [SECURITY.md](SECURITY.md).

## Panel
- **Gösterge**: bugünün randevuları, web sitesinden gelen ve onay bekleyen talepler
- **Takvim**: hekim başına sütunlu gün görünümü; boş saate tıklayıp randevu ekleme
- **Randevular**: filtreli liste, durum (onay bekliyor / onaylı / geldi / tamamlandı / iptal / gelmedi)
- **Yapılan işlemler**: tüm işlem kayıtları; ücret/maliyet/ödenen tablo içinde değişir, işlem eklenir/silinir
- **Analiz**: ciro, gider, net kâr, tedavi ve hekim kırılımı, yeni hasta, randevu yoğunluğu grafikleri; Giderler sekmesinden kira/maaş vb. girilir
- **Hastalar**: hasta kartı, alerji uyarısı, randevu geçmişi, tedavi kayıtları, ücret ve bakiye
- **Hekimler**: fotoğraf, biyografi (TR/EN/DE), sitede görünürlük, çalışma saatleri, randevu aralığı (yalnız yönetici)
- **Hizmetler**: hizmet (bleaching, zirkonyum…) ekle/düzenle/sil, süre, hastaya fiyat, maliyet, kâr ve marj; fiyatlar tablodan doğrudan değişir (yalnız yönetici)
- **Siteyi düzenle**: site panelin içinde açılır; yazının üzerine tıklayıp yerinde değiştirilir, hekim kartına tıklayınca fotoğraf/tanıtım formu açılır, “Yayınla” ile yayına girer. Sayfada görünmeyen metinler için liste görünümü var (yalnız yönetici)
- **Ayarlar**: telefon/WhatsApp, online randevu kuralları, kapalı günler, kullanıcılar ve roller, iki adımlı doğrulama, güvenlik günlüğü

## Yayın (Vercel)
Canlı: **https://atlasdent.vercel.app** — panel: https://atlasdent.vercel.app/admin/

- **Otomatik yayın:** GitHub'da `main` dalına her push Vercel'de canlıya çıkar; diğer dallar önizleme adresi alır.
- `api/index.js` sunucusuz işlev; `/`, `/api/*`, `/uploads/*` buna yönlenir (`vercel.json`). `assets/` ve `admin/` CDN'den sunulur.
- Veritabanı: Turso (Vercel Marketplace, `atlasdent-db`, Dublin). `TURSO_DATABASE_URL` tanımlı değilse yerelde `data/atlas.db` kullanılır.
- İlk yönetici: hiç kullanıcı yoksa `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_HASH` (scrypt özeti) ortam değişkenlerinden oluşturulur; ilk kurulum ekranı canlıda hiç açılmaz. Diğer kullanıcılar panelden (Ayarlar → Kullanıcılar) eklenir.
- Fotoğraflar, oturumlar, 2FA biletleri ve deneme sınırları veritabanında tutulur (sunucusuz ortamda bellek ve disk kalıcı değildir).
- Canlı veritabanına örnek veri: `vercel env pull <dosya> --environment=production` ile ortamı alıp `npm run seed -- --sample`. Panelde Ayarlar → “Tüm örnek verileri sil”.

Hasta verisi KVKK kapsamında özel nitelikli kişisel veridir: yönetici hesaplarında iki adımlı doğrulamayı açın, aydınlatma metnini klinikle hazırlayın, Turso yedeklerini ve veri konumunu (AB) kayıt altına alın. Ayrıntı: [SECURITY.md](SECURITY.md).
