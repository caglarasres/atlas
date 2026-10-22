# Atlas Panel — güvenlik

Panel, OWASP Top 10 (2021) ve OWASP ASVS 4.0 Seviye 2'nin uygulama tarafındaki ana maddeleri esas alınarak yazıldı.
Bu bir sertifika değildir; canlıya almadan önce aşağıdaki "Yayın kontrol listesi" tamamlanmalı ve mümkünse bağımsız bir sızma testi yaptırılmalıdır.

## Uygulamada olanlar

| Alan | Önlem |
|---|---|
| Parola saklama | scrypt (N=16384, r=8, p=1), kullanıcı başına rastgele tuz; parolalar hiçbir yerde açık tutulmaz |
| Parola kuralı | En az 12 karakter, yaygın parola listesi, e-posta adını içeremez (NIST SP 800-63B) |
| İki adımlı doğrulama | TOTP (RFC 6238), ±30 sn tolerans, aynı kod ikinci kez kullanılamaz; yönetici gerekirse kullanıcının 2FA'sını sıfırlar |
| Kaba kuvvet | IP başına 20, e-posta başına 8 deneme / 15 dk; 2FA kodu için ayrıca sınır; var olmayan e-postada da aynı süre harcanır |
| Oturum | 256 bit rastgele anahtar, veritabanında yalnızca SHA-256 özeti; 30 dk hareketsizlik ve 12 saat mutlak süre; parola/rol değişince ve pasifleştirmede oturumlar kapanır |
| Çerez | `HttpOnly`, `SameSite=Strict`, HTTPS'te `Secure` ve `__Host-` öneki |
| CSRF | Yalnızca `application/json` kabul edilir, `Origin`/`Referer` sunucunun kendi adresi olmalıdır, çerez `SameSite=Strict` |
| Yetki | Her uç noktada sunucu tarafı rol denetimi (yönetici / sekreter / hekim); kişi kendi yönetici yetkisini kaldıramaz |
| XSS | Panel her veriyi kaçışlayarak basar; panel CSP'si satır içi betiğe izin vermez; site metinlerinde yalnızca `<br> <em> <strong> <b> <i>` kalır; site CSP'si nonce kullanır |
| Clickjacking | Panel `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Dosya yükleme | Yalnızca JPEG/PNG/WebP, tür dosyanın ilk baytlarından belirlenir, en fazla 2,5 MB, rastgele dosya adı; sunulurken `sandbox` CSP ve `nosniff`; fotoğraf tarayıcıda küçültülür, EXIF silinir |
| SQL enjeksiyonu | Tüm sorgular parametreli (hazır ifadeler) |
| Dizin gezinme | Yalnızca `assets/`, `admin/` ve `uploads/doctors/` sunulur; yol normalize edilip denetlenir |
| Başlıklar | CSP, HSTS (HTTPS'te), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, panelde `Cache-Control: no-store` ve `X-Robots-Tag: noindex` |
| DoS | İstek gövdesi sınırı, başlık/istek zaman aşımları, randevu formu için IP sınırı ve bal küpü alanı |
| Kayıt | Güvenlik günlüğü: girişler, başarısız denemeler, 2FA, kullanıcı/yetki, ayar, site metni, hasta silme (Ayarlar → Güvenlik günlüğü) |
| Ağ kısıtı (isteğe bağlı) | `ADMIN_ALLOW_IPS=1.2.3.4,…` → panel ve yönetim API'si yalnızca bu IP'lerden açılır |
| Bağımlılık | Harici npm paketi yok (tedarik zinciri riski yok) |

## Yayın kontrol listesi

- [ ] Yalnızca HTTPS (ters vekil: Caddy/Nginx), `TRUST_PROXY=1`, `COOKIE_SECURE=1`
- [ ] Tüm yönetici hesaplarında iki adımlı doğrulama açık
- [ ] Örnek hesaplar ve deneme verisi silindi (`data/` klasörü sıfırdan başlatılır, `data/dev-credentials.txt` silinir)
- [ ] `data/` klasörü yalnızca uygulama kullanıcısı tarafından okunabilir; şifreli ve düzenli yedek (ör. günlük, 30 gün saklama), geri yükleme denendi
- [ ] Sunucu güncel; yalnızca 80/443 açık; SSH anahtarla
- [ ] Mümkünse `ADMIN_ALLOW_IPS` ile panel klinik ağına kısıtlı
- [ ] KVKK: aydınlatma metni, VERBİS kaydı, veri işleme envanteri ve saklama süreleri klinikle birlikte netleştirildi
- [ ] Bağımsız sızma testi
