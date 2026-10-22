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
- **Tedaviler ve fiyatlar**: tedavi ekle/sil, süre, hastaya fiyat, maliyet, kâr ve marj; fiyatlar tablodan doğrudan değişir (yalnız yönetici)
- **Siteyi düzenle**: site panelin içinde açılır; yazının üzerine tıklayıp yerinde değiştirilir, hekim kartına tıklayınca fotoğraf/tanıtım formu açılır, “Yayınla” ile yayına girer. Sayfada görünmeyen metinler için liste görünümü var (yalnız yönetici)
- **Ayarlar**: telefon/WhatsApp, online randevu kuralları, kapalı günler, kullanıcılar ve roller, iki adımlı doğrulama, güvenlik günlüğü

## Yayına alma
GitHub Pages yalnızca statik dosya sunar; orada form eskisi gibi WhatsApp'a gider.
Online randevu ve panel için kalıcı diski olan bir Node sunucusu gerekir (VPS, Render/Railway + disk, vb.).
Ortam değişkenleri: `PORT`, `ATLAS_DATA` (veri klasörü), `TRUST_PROXY=1` (ters vekil arkasında), `COOKIE_SECURE=1` (HTTPS).
Hasta verisi KVKK kapsamında özel nitelikli kişisel veridir: HTTPS zorunlu, sunucu Türkiye'de/uygun yerde, yedekler şifreli olmalı; aydınlatma metni klinik tarafından hazırlanmalıdır.
