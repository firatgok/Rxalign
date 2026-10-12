# Rxalign yeniden tasarım notları (kök sayfalar)

Yeni arayüz kök sayfalardadır; eski tasarım `eski/` altında aynı veriyle (Firestore `invisalign_forms`) çalışmaya devam eder.
Tasarım kaynağı: Claude Design tuvali — https://claude.ai/artifact/8Rw55EPCgmZ1ys1AKbwwiX
(tuval; gece modu, kendiliğinden açılan adımlar ve yeni Ayarlar sayfasından önceki hâli gösterir)

## Açmak

- Yerel: `npx -y http-server . -p 8080` → http://localhost:8080/
- Yayında (push sonrası): https://rxalign.fgoapps.com/

Telefon/tablet için aynı ağdaki cihazdan `http://<bilgisayar-ip>:8080/` de açılır.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Giriş: hekim PIN (cihazda 30 gün hatırlama), asistan özeti (bekleyen form sayısı) |
| `list.html` | Arşiv: tablo (masaüstü, tablet yatay) / kartlar (tablet dikey 2 sütun, telefon 1 sütun), durum ve tür filtreleri, arama, sıralama |
| `settings.html` | Ayarlar: tema (cihaza özel), tedavi detayları görünümü (klinik geneli), form varsayılanları |
| `form.html` | **Üretilmiş dosya** — `node build-form.js` eski/form.html içeriğini yeni kabuğa yerleştirir |
| `build-form.js` | Üretici; kök form her değiştiğinde yeniden çalıştırın |
| `css/app.css` | Tasarım sistemi (gündüz + gece belirteçleri) ve eski form işaretlemesi için üst yazımlar |
| `js/theme.js` | `<head>` içinde ilk boyamadan önce temayı uygular (titreşim yok) |
| `js/wizard.js` | Sihirbaz, akordeon, özet adımı, cihazda taslak, Klasik görünüm, görüntüleme modu koruması |
| `js/app.js` | Ortak: PIN penceresi, bildirim, tema, arayüz ayarları, etiketler |

`form.html` kökteki `script.js`, `defaults.js`, `firebase-config.js` ve `version.js` dosyalarını aynen kullanır;
alan adları, bölüm kimlikleri ve kayıt biçimi değişmez (IDS eklentisi etkilenmez).

## Form akışı

- **Adım 1–3 tek sayfada, yukarıdan aşağı:** ad ve soyad yazılınca form türü/hasta tipi açılır; hasta tipi seçilince ürün,
  ürün seçilince paketler açılır ve sayfa yeni bölüme kayar. **Paket seçilince tedavi detaylarına kendiliğinden geçilir**
  (Refinement'ta hasta tipi seçilince ek hizalayıcı formuna). Ad alanlarında Enter sonraki alana geçer.
- Adım 4 (tedavi detayları): her grup kapalıyken seçili değer ve **Varsayılan / Değiştirildi** rozeti
  (karşılaştırma: Ayarlar'daki kayıtlı varsayılan, yoksa fabrika değeri). "Değiştirilenler" filtresi.
- **Klasik görünüm**: tüm gruplar açık, tek uzun sayfa (yalnızca ≥768 px; telefonda yok).
  Varsayılan Ayarlar'dan seçilir (**fabrika: Klasik**); formdaki anahtar yalnızca o oturum için geçerlidir.
- Adım 5 (özet): varsayılandan farklı tercihler üstte; "Düzenle" ilgili gruba götürür.
- Taslak her değişiklikte cihazda saklanır; sayfa yeniden açılınca "Geri yükle / Sil" şeridi çıkar.
- Görüntüleme / düzenleme / varsayılan modları (`?view=`, `&edit=true`, `?defaults=`): bölümler alt alta.
  - **Asistan** kayıtlı formda bir şeyi değiştirmeye kalkınca (veya alttaki "Düzenle"ye basınca) hekim PIN'i sorulur;
    doğruysa form hekim arşivinden açılmış gibi düzenleme modunda açılır (kaydedince hekim arşivine döner).
    Bu PIN hekim oturumu açmaz.
  - Hekim görüntülemede değiştirmeye kalkınca uyarı penceresi yerine "Düzenle" eylemli bildirim çıkar.
  - Düzenleme ve varsayılan modunda kaydedilmemiş değişiklikle çıkarken tarayıcı sorar.
- PDF her zaman gündüz renkleriyle ve tüm gruplar açık üretilir; yazdırma da gündüz renkleriyle.

## Arşiv

- Hekim: satırda **Görüntüle** (mavi) · **Sil** (kırmızı ton) · ⋯ (Düzenle mercan, Girişi iptal et kehribar).
- Asistan: Görüntüle · ⋯ (Düzenle — hekim PIN'iyle). Varsayılan görünüm "Bekliyor, en eski üstte".
- **Yeni form** düğmesi markanın mercan dolgusuyla tek belirgin düğme (giriş sayfası, arşiv başlığı, üst çubuk, telefonda kayan düğme).

## Gece modu

Üst çubuktaki ay/güneş düğmesi veya Ayarlar > Tema (Sistem / Gündüz / Gece). Tercih cihaza özeldir (`localStorage rx_v3_theme`).
Kontrast denetimi: dört sayfada iki temada da WCAG AA altı metin yok (pasif/devre dışı öğeler hariç).

## Hata ayıklama turu (12 Ekim 2026) — düzeltilenler

- `window.RX` tanımsızdı (üst düzey `const` pencereye bağlanmaz): Ayarlar'daki görünüm seçimi forma hiç uygulanmıyordu,
  özet metinleri HTML kaçışsız kalıyordu.
- Görüntüleme modunda seçenek kartına tıklamak kaydı (ekranda) değiştirebiliyordu.
- Görüntüleme modunda kök `script.js` "Klasik görünüm" anahtarını ve filtreyi de kilitliyordu (araç çubuğu form dışına alındı).
- Telefonda arşiv/Ayarlar üst çubuğu ve giriş sayfasındaki süs logosu yatay taşma yapıyordu.
- Masaüstünde telefon için olan "Daha fazla göster" kopyası görünebiliyordu.
- Tablet dikeyde arşiv tablosu kutu içinde yatay kayıyordu → iki sütunlu kartlar.
- Gece modunda PDF/yazdırma koyu zeminle çıkacaktı.
- Düzenleme modunda ESC kaydedilmemiş değişiklikleri sorgusuz atıyordu.
- Küçük mercan üst etiketin kontrastı 4.24:1 idi → 4.5:1 üstü.

## Bilinen eksikler / açık konular

1. **Test edilmedi:** PDF oluşturma (indirme izni gerekir) ve Firestore'a kaydetme/güncelleme/silme (gerçek hasta verisi —
   yazma yapılmadı). Akış kök `script.js` ile aynı fonksiyonları çağırıyor; ilk gerçek kayıtta kontrol edin.
2. `eski/form.html` değişince `node build-form.js` elle çalıştırılmalı (pre-commit kancasına eklenebilir).
3. Hekim PIN'i (1234) istemci kodunda açık — kök uygulamadaki gibi. Gerçek koruma Firestore kurallarıyla olmalı;
   asistan arayüzünde Sil yok ama kurallar izin veriyorsa teknik olarak silinebilir.
4. Kök formdan gelen metinler: "Invisalign şeffat alignerlar" (şeffaf), refinement 6. bölüm "Diş hareketli sınırlamaları",
   "Yetişkinim". IDS ile eşleşme kontrolü gerektiği için dokunulmadı.
5. Silme / giriş iptali / kayıt onayları hâlâ tarayıcının `confirm()` pencereleri; tasarıma uygun onay penceresi yapılabilir.
6. "Tedavi detayları görünümü" ayarı klinik geneli (Firestore `rxalign_settings/ui`), tüm cihazları etkiler; tema cihaza özel.
7. Arşiv tüm koleksiyonu tek seferde çekiyor (kök ile aynı); kayıt sayısı binleri bulursa sorgu sınırlaması gerekir.
8. iTero "Ara" düğmesi kökte de yer tutucu (gerçek arama yok).
9. Tablette "Ana ekrana ekle" için web uygulama bildirimi (manifest) yok; `images/icon-512.png` hazır.
10. Ekran görüntüsüyle görsel kontrol sınırlı kaldı (tarayıcı paneli arka plandaydı); kontroller ölçümle yapıldı.

## Eski tasarım

Eski sayfalar `eski/` altında; her yeni sayfanın altındaki "Eski tasarım" bağlantısı ve eski sayfaların sağ üstündeki
"Yeni tasarım" düğmesi aynı sayfayı aynı sorguyla karşı tarafta açar.
