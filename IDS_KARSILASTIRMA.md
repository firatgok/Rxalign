# IDS (Invisalign Doctor Site) ile Form Karşılaştırması

Kaynak: vip.invisalign.com, deneme hastası "DENEME, TEST" (yetişkin, 01/01/1990), 2 Ekim 2026.
Geleneksel Reçete (traditional Rx) akışı incelendi. Flex Rx ayrıca eklenecek, en sona bırakıldı.

## Genel akış (IDS)

Hasta Verisi → Klinik Koşullar → Hasta Portresi → Tara → Fotoğraflar → Radyograf → Hasta dosyası →
"Reçeteyi gönder / Başla" → Tedavi seçenekleri (hasta tipi süzgeci + paket kartları) → Rx formu (adımlar) → Tara → Fotoğraflar → Radyograf → İndirim → Özet → Sevk

13 Kasım 2026: IDS "Tedavi seçenekleri" ekranını yeniledi. Hasta tipi ve ürün tipi aşamaları kalktı; tek sayfada
hasta tipi süzgeci (Yetişkinim / Ergenler / Çocuk) ve o tipin tüm kartları durur (yetişkin: Comprehensive, Moderate,
Lite, Express, Vivera; ergen: + Palatal; çocuk: First, Vivera, Palatal). Gülümseme Mimarisi ayrı ürün değil, yetişkin
Comprehensive / Moderate / Lite kartında "Ekle Invisalign Smile Architect" anahtarı. Form aynı düzene çevrildi:
hasta tipi çipleri + tek paket ızgarası; `urun_tipi_*` alanı sorulmaz ama seçilen pakete göre kayda yazılmaya devam
eder (eski kayıtlar ve IDS Yardımcısı için). Aşağıdaki "Ürün tipi" başlıkları eski ekranın dökümüdür.

Kullanıcı kararları:
- Klinik Koşullar ve Genel Notlar: forma GİRMEYECEK.
- Hasta Portresi, Fotoğraflar, Radyograf: forma GİRMEYECEK (asistan yükler).
- Tara: formda KALACAK. "Daha sonra karar ver" seçeneği GİRMEYECEK. CBCT Tara kutusu EKLENDİ.

## Hasta tipi / Ürün tipi (Yetişkin)

- Hasta tipi: Yetişkinim / Ergenler / Çocuk → bizimle aynı.
- Yetişkin ürün: Invisalign şeffaf alignerlar / Vivera Retainerları / Invisalign Gülümseme Mimarisi → bizimle aynı.
- Yetişkin aligner paketleri: Comprehensive (3 yıl 3 set ₺65400 / 5 yıl sınırsız ₺73300), Moderate (₺57100), Lite (çift ark ₺45000 / tek ark ₺34400), Express (çift ark ₺25500 / tek ark ₺19500).
  - Comprehensive kartında "Tedavi özellikleri": Oklüzal bloklu MA ₺4000, Gelişmiş hassas kanatlı MA ek ücret yok.
- Vivera Retainer: tek seçenek "3 set retainer" (çift ark ₺8700 / tek ark ₺5500).

## Yetişkin Comprehensive — Geleneksel Rx, 10 adım

| Adım | Bölüm | Bizim formla fark |
|---|---|---|
| 1 | 1. Tedavi edilecek ark | IDS'te Üst/Alt altındaki karşıt ark seçenekleri **radio** (tek seçim), ark seçilene kadar pasif, Üst/Alt seçilince "hiçbir şey yoktur" otomatik işaretli. Bizde checkbox. |
| 2 | 2. Diş hareketi sınırlamaları + 3. Ataşmanlar | Aynı. Izgaralar seçim yapılana kadar pasif, "Tümünü seç" var. |
| 3 | 4. A-P İlişkisi | Diş hareketi / Mandibular ilerletme / Ortognatik cerrahi **radio grubu** (bizde checkbox + manuel dışlama). Kurallar aşağıda. |
| 4 | 5. Overjet | Aynı (3 seçenek). |
| 5 | 6. Overbite | Aynı yapı. Kural: Üst veya Alt işaretliyse Diğer pasif; **Diğer işaretliyse Üst ve Alt pasif** (bizde eksik). |
| 6 | 7. Bite Ramp | Aynı. Alt seçenekler gizlenmiyor, pasif gösteriliyor. |
| 7 | 8. Orta hat + 9. Posterior Çapraz Kapanış | Aynı. |
| 8 | 10. Boşluk ve Çapraşıklık | Boşluk: "Tüm boşlukları kapat" / "Belli boşluklar bırak" + "Belli boşlukları düzenle" bağlantısı (diş aralarına mm girilen 30 kutuluk ızgara). Bizde 3. seçenek "düzenle" radio olarak var, ızgara yok. **IPR varsayılanları IDS'te "Hiçbiri"** (Genişlet ve Procline "Gerektiği gibi"). Bizde hepsi "gerektiğinde". |
| 9 | 10. devam — Diş çekimleri | Aynı (Hiçbiri / Bu dişleri çek + 32 diş). Ankraj notu metni var. |
| 10 | 11. Özel Talimatlar | Aynı, 4000 karakter. |
| Tara | Tarama | İntraoral / PVS, iTero kodu + Ara, "Önceki taramayı göster", **"İntraoral tarama mevcut değilse" kutusu (bizde yok)**, CBCT Tara (PVS seçilince "PVS ölçüleri ile birlikte kullanılamaz" ve pasif). |

### A-P kuralları (IDS'te ölçüldü)

| Sağ + Sol | Diş hareketi | Posterior IPR | Sınıf II/III | Distalizasyon | MA | Ortognatik |
|---|---|---|---|---|---|---|
| mevcut + mevcut | pasif | pasif | pasif | pasif | pasif | pasif |
| kanin + mevcut, kanin + kanin | otomatik seçili | aktif | **pasif** | aktif | aktif | **pasif** |
| köpekdişi veya Sınıf I herhangi bir tarafta (kanin ile karışık dahil) | otomatik seçili | aktif | aktif | aktif | aktif | aktif |

- Posterior IPR / Sınıf II/III / Distalizasyon yalnızca "Diş hareketi seçenekleri" seçiliyken aktif.
- Sınıf II/III işaretlenince Precision Cuts Evet/Hayır aktif; Distalizasyon işaretlenince kendi Evet/Hayır'ı aktif.
- MA seçilince MA alt seçenekleri (özellik, final pozisyon, aşamalandırma, alt ark asimetrik, dikey elastikler) görünür; varsayılanlar: gelişmiş hassas kanatlar, baş başa, ikişer mm, kaydırma, hayır.

## Yetişkin Moderate — farklar (Comprehensive'e göre)

- Adım 1: "Karşıt arkta pasif alignerlar (Not: çift ark ücreti uygulanır)".
- A-P tablosu 3 satır: Mevcut / Yalnızca Kanin / "Köpekdişi ve azıdişi ilişkisini kısmi olarak 3 mm'ye kadar iyileştir". **Sınıf I satırı yok.**
- A-P seçenekleri: Diş hareketi (Posterior IPR, Sınıf II/III + precision, Distalizasyon + precision), Ortognatik cerrahi. **Mandibular ilerletme yok.**
- Diğer adımlar Comprehensive ile aynı (10 adım).

## Yetişkin Lite — farklar

- A-P tablosu 3 satır: Mevcut / Yalnızca Kanin / "Kanin ve molar ilişkisini kısmi olarak 2 mm'ye kadar iyileştir".
- A-P seçenekleri: Diş hareketi → yalnızca Posterior IPR ve Sınıf II/III (+precision). Distalizasyon, MA, Ortognatik yok.
- Overjet + Overbite aynı adımda. Overbite basitleştirilmiş: Hizalama / İlk koru / "Açık kapanışı iyileştirin - Özel Talimatlarda belirtin" / "Derin kapanışı iyileştirin - ön dişleri intrüze et" (+ Üst / Alt kutuları).
- **Posterior Çapraz Kapanış bölümü yok.**
- Boşluk ve Çapraşıklık + diş çekimleri var.
- Toplam 10 adım (numaralar: 9 Boşluk, 10 Özel Talimatlar).

## Yetişkin Express — farklar

- **A-P bölümü yok.**
- Overjet + Overbite (Lite ile aynı basit hali).
- Bite Ramp, Orta hat var. Posterior Çapraz Kapanış yok.
- Boşluk ve Çapraşıklık var ama **diş çekimleri adımı yok**.
- 9 adım (9 Özel Talimatlar).

## Yetişkin Vivera Retainer — 6 adım (bizde form yok)

1. Tedavi edilecek ark: Her ikisi / Üst / Alt.
2. Kurulum Talimatları (üst ve alt ark ayrı): yeni ölçü/tarama kullan (önerilen) / son ClinCheck planındaki son aktif aşama / ClinCheck'ten aşama numarası (açılır liste) / önceki retainer siparişindeki arkı kullan.
3. Pontikler: otomatik / belirtilen boşluklara (32 diş ızgarası).
4. Sabit lingual retainer: yok / var → koru ve kapla / koru ve etrafını kontürle / sanal olarak çıkar.
5. Isırma destekleri: Hiçbiri / yerleştir → Kesici dişler (santral, lateral) / Kaninler.
6. İnterproksimal temasların sıkıştırılması (üst ve alt ayrı): sıkılaştırma / Power Chain / Virtual C-chain.
Sonra: Tara, İndirim, Özet, Şartlar, Sevk.

## Ergen (2. deneme hastası "DENEMEIKI, TEST")

- Ürünler: Invisalign şeffaf alignerlar / Vivera Retainerları / Invisalign Palatal Genişleticiler → bizimle aynı.
- Paketler ve fiyatlar yetişkinle birebir aynı (Comprehensive / Moderate / Lite / Express).
- **Her ergen formu = aynı yetişkin formu + ek "Erupsiyon kompansasyonu" bölümü** (Özel Talimatlar ile aynı adımda):
  - Erupsiyon kompansasyonu: Hiçbiri / Şu dişler için ekle → 1.5 1.4 1.3 | 2.3 2.4 2.5 ve 4.5 4.4 4.3 | 3.3 3.4 3.5
  - Terminal azıdişi tablaları: Hiçbiri / Şu dişlere ekle → 1.8 1.7 1.6 | 2.6 2.7 2.8 ve 4.8 4.7 4.6 | 3.6 3.7 3.8
  - "Terminal azıdişi tablalarını başlatma aşaması" metin kutusu
- Ergen Comprehensive: 11 adım (11 Erupsiyon + 12 Özel Talimatlar aynı adımda), Tara'da CBCT var.
- Ergen Moderate: yetişkin Moderate + Erupsiyon (A-P 3 satır, MA yok).
- Ergen Lite: yetişkin Lite + Erupsiyon (10 Erupsiyon, 11 Özel Talimatlar).
- Ergen Express: yetişkin Express + Erupsiyon (9 Erupsiyon, 10 Özel Talimatlar).
- Lite ve Express'in Tara adımında CBCT yok.

## Çocuk - Invisalign First

- Ürünler: Invisalign First şeffaf alignerlar / Vivera / Palatal → bizimle aynı.
- Tek paket: "Invisalign First - Comprehensive Package" (çift ark ₺42100 / tek ark ₺35000). Faz 2 indirimi notu var.
- Seçilince **uygunluk uyarısı** çıkıyor: "hastaların kalıcı kesicilerinin en az 2/3'ü ... ark başına en az iki kesici diş çıkmış olmalı. Çift ark: en az 3 çeyrekte en az 2 süt dişi (C, D veya E) veya çıkmamış kalıcı diş (3, 4 veya 5). Tek ark: aynı, 3 çeyrekte 2 süt dişi (C, D veya E) veya çıkmamış kalıcı diş (2, 4 veya 5)."
- Form farkları (Comprehensive'e göre):
  - 1. Ark: karşıt ark seçenekleri yalnızca "hiçbir şey yoktur" ve "tanı modeli" (pasif alignerlar YOK).
  - 2./3. Diş ızgaraları **süt dişlerini içeriyor** (5.5–5.1, 6.1–6.5, 8.5–8.1, 7.1–7.5): 52 diş. Diş çekimi ızgarası da 52 diş.
  - 4. A-P satırları: Mevcut / **Yalnızca azıdişi ilişkisini iyileştir** / Köpekdişi ve azıdişi ilişkisini iyileştir / Sınıf I'e düzeltim. MA ve ortognatik var.
  - 7. Bite Ramp: **"Hiçbiri" (varsayılan) / Lingual rampler** — "otomatik" seçeneği yok.
  - 9. Posterior Çapraz Kapanış: varsayılan **"Düzelt"**.
  - 11. Erupsiyon: diş listesi daha geniş: 1.5 1.4 1.3 1.2 1.1 | 2.1 2.2 2.3 2.4 2.5 ve 4.5 4.4 4.3 4.2 4.1 | 3.1 3.2 3.3 3.4 3.5. Terminal listesi ergenle aynı.
  - Tara'da CBCT yok.

## Flex Rx (3 Ekim 2026, ayrıntılı)

Şablon tabanlı form: her bölüm varsayılan olarak hekimin **Klinik Tercihler Şablonu**'nu takip eder; hekim yalnızca sapmak istediği bölümde "Takip edin Global Klinik Tercihler Şablonu" kutusunu kaldırıp vakaya özel seçim yapar. Sayfa: Tercihler (Görünüm / Şablonu düzenle) · Vakaya özel klinik tercihler · Tedavi edilecek ark · Sınırlamalar, ekstraksiyonlar ve eksik dişler · Özel Notlar · "Reçeteyi tamamla".

### Dr. Fırat Gök Klinik Tercihler Şablonu (Birincil / Comprehensive, 7 Nis 2026 güncel)

17 bölüm, metinler aynen:
- **Tedavi edilecek ark (2):** Tek ark vakalarında karşı arktaki hareketleri veya pasifleri görüntülemeyin. · Tek çene tedavisi için antero-posterior ilişkisini koruyun.
- **Anterior-Posterior düzeltme (4):** Sınıf II Yetişkinler: Gelişmiş sekanslı distalizasyon aşamalandırma paterni; estetik başlangıç; kanin ile molar aynı anda tam Sınıf I elde edilemiyorsa kanine öncelik. · Sınıf III Yetişkinler: aynı (estetik başlangıç yok). · Sınıf II Ergenler: tedavi boyunca kapanış düzeltme simülasyonu ile Sınıf I'e ulaşın; kanine öncelik. · Sınıf III Ergenler: gelişmiş sekanslı distalizasyon; kanine öncelik.
- **IPR (6):** Yetişkinler: anterior maks 0.5 mm, posterior maks 0.5 mm · IPR'den önce hizalama · IPR'yi ertelemeyin. Ergenler: arka dişlerde IPR yok, ön dişlerde maks 0.5 mm · IPR'den önce hizalama · ertelemeyin.
- **Boşluk (2):** Yetişkinler: Boşluk yok · Ergenler: Boşluk yok.
- **Çapraşıklık (1):** Genişletme ve öne eğilimi birincil stratejiler olarak kullanın.
- **Overbite (4):** Yetişkin derin kapanış: alt+üst anterior intrüzyon ve alt+üst posterior ekstrüzyon; ağır oklüzal kontaklarla bitir; başlangıç ≥2 mm ise alt arkta +1 mm intrüzyon, hedef 1 mm. · Yetişkin açık kapanış: anterior ekstrüzyon + posterior intrüzyon; başlangıç ≤0.5 mm ise hedef 2 mm. · Ergenler: aynı iki madde.
- **Çapraz kapanış (2):** Yetişkinler/Ergenler: çapraz kapanışta premolarları ve molarları düzeltin.
- **Anterior seviyeleme (2):** Üst: lateraller santrallerden 0,5 mm daha gingival olacak şekilde kesici kenarlarını seviyele. · Alt: lateraller santrallerle aynı seviyede.
- **Orta hat (2):** Yetişkinler/Ergenler: Hizalama sonrasında oluşan orta hattı göster.
- **Ataşmanlar (3):** Anterior için büyük boy Optimize · Posterior için büyük boy Optimize · Ataşman yerleşimini geciktirmeyin, 1. aşamadan.
- **Hassas kesiler (5):** Optimize ataşmanla birlikte hassas kesi; olmazsa geleneksel ataşmanla; kuron yalnızca birine izin veriyorsa hassas kesiye öncelik; 1. aşamada. · Sınıf II Yetişkin: üst kaninlere kanca (yoksa 1. üst premolar), 1. alt molarlara kanca (yoksa 2. alt molar). · Sınıf III Yetişkin: alt kaninlere (yoksa 1. alt premolar), 1. üst molarlara (yoksa 2. üst molar). · Ergenler: aynı iki madde.
- **Isırma destekleri (2):** Yetişkinler/Ergenler: üst kaninlere ısırma destekleri.
- **Power Ridge özelliği (1), Pasif/aktif plaklar (1):** Pasif plaklara izin verin.
- **Boşluk kapatma için aşırı düzeltme (1):** aşırı düzeltme plakları eklemeyin.
- **Eksik dişler (1):** Anterior ve posterior boşluklar için pontiklere izin; tam boy pontikler otomatik.
- **Ekstraksiyonlar (4):** Ekstraksiyonu 1. aşamaya kadar erteleyin · 1. küçük azı çekim protokolü · Alt kesici çekim protokolü · pontiklere izin.
Şablon penceresinde "Sipariş türü" (Birincil / …) ve "Paket" seçicileri ile "PDF'i Dışa Aktar" var.

### Vakaya özel klinik tercihler — geçersiz kılma panelleri (her birinde "Takip edin Global Klinik Tercihler Şablonu" kutusu)

- **IPR:** IPR'ye izin verilen segmentler (Sağ/Sol kutuları); Anterior IPR'yi temas başına sınırla 0.5/0.4/0.3/0.2; Posterior IPR'yi temas başına sınırla 0.5/0.4/0.3/0.2; IPR zamanlaması: IPR'dan önce hizalama / IPR'dan sonra hizalama; IPR'yi erteleyin (kutu); IPR planlayın: Temaslara erişime göre / Her (belirli sayıda) aşamada bir / Belirli aşamalarda.
- **Çapraşıklık:** diş ızgarası (hareket sınırlaması / çekilmiş / eksik göstergeli); Proklinasyon referansı; İnterproksimal açıklık seçimi; kutular: Proklinasyonu sınırlayın, Ark ekspansiyonunu sınırlayın, İnterproksimal açıklık.
- **Boşluk:** Nihai konumdaki boşluklar: Hayır, nihai konumda boşluk istemiyorum (eksik ve çekilmiş dişler hariç) / Evet, nihai konumda boşluk olmasını istiyorum. Not: kapatılamayan üst anterior artık boşluklar laterallere distal dağıtılır.
- **Orta hat:** Hedef: Hizalama sonrasında oluşan orta hattı göster / Orta hattı IPR ile iyileştir (+ uyarı notu).
- **Anterior-Posterior düzeltme:** Başlangıç molar sınıfı — Sağ taraf / Sol taraf açılır liste: Sınıf I / Sınıf II / Sınıf III (zorunlu).
- **Çapraz kapanış:** Yaklaşım: Premolarları ve molarları düzeltin / Yalnızca premolarları düzeltin / Düzeltmeyin.
- **Anterior seviyeleme:** Üst ark yaklaşımı: Lateraller santrallerden 0,5 mm daha gingival / Kesici kenarları seviyeleyin / Diş eti marjinlerini seviyeleyin*; Alt ark: Kesici kenarları seviyeleyin / Diş eti marjinlerini seviyeleyin*.
- **Overbite:** Başlangıç maloklüzyonu açılır liste: Anterior açık kapanış / Derin kapanış (zorunlu).
- **Plak özellikleri** (4 sekme): Ataşmanlar — Optimize ataşman boyutları (anterior / posterior: "Uyan en büyük seçenek"…), Ataşman yerleşimini erteleyin, bu vakaya özel ataşman yerleşimi (Bukkal/Lingual/Oklüzal sürükle-bırak diş grafiği). Hassas kesiler — Tüm hassas kesileri kaldırın, Hassas kesilerde gecikme, önceliklendirme: Ataşmanlara öncelik / Hassas kesilere öncelik / Ataşmanla birlikte hassas kesi; Bukkal/Lingual diş grafiği. Isırma destekleri — Tüm ısırma desteklerini kaldırın / Otomatik yerleştirin / Yerleşimi özelleştirin → Tür: santral kesiciler için hassas / lateral kesiciler için hassas / kaninler için geleneksel. Power Ridge — Power Ridge özelliklerini etkinleştir (kutu).
- **Boşluk kapatma için aşırı düzeltme:** 3 aşırı düzeltme plağı ekleyin / Aşırı düzeltme plakları eklemeyin.
- **Pasif/aktif plaklar:** Aktif aşamalar nasıl bitirilir: her iki arkta aynı anda başlat ve bitir / aynı anda başlat farklı zamanlarda bitir; Pasif plaklar: pasif hizalayıcılar ekleyin / eklemeyin.

### Diğer bölümler

- **Tedavi edilecek ark:** Her ikisi de / Yalnızca Üst / Yalnızca Alt.
- **Sınırlamalar, ekstraksiyonlar ve eksik dişler:** sekmeler Diş Hareketi (hareket ettirilmemesi gereken dişler, 32 diş) · Ataşmanlar (ataşman yerleştirilmemesi gereken dişler, Tümünü seç) · Diş çekimleri (çekilecek dişler; seçilince ayarlar açılıyor) · Eksik dişler (tedavi öncesi eksik dişler, isteğe bağlı).
- **Özel Notlar:** 10000 karakter; yalnızca hekim görür, ClinCheck Notlar bölümünde görünür.
- Alt düğmeler: Geri / İptal / Reçeteyi tamamla; "Değişiklikleri sıfırla" bağlantısı.

## Atlananlar (kullanıcı kararı)

- Yetişkin Gülümseme Mimarisi, Vivera (çocuk/ergen), Palatal genişleticiler.
- Ek Hizalayıcılar akışı deneme hastasında açılamaz (aktif tedavi gerekir).
- "Belli boşlukları düzenle" bağlantısı otomasyonla açılamadı (muhtemelen ayrı pencere).

## Uygulanan değişiklikler (2 Ekim 2026)

1. ✅ Tüm formlar: karşıt ark seçenekleri radio (`ust_karsit_ark_<form>` / `alt_karsit_ark_<form>`); Üst/Alt seçilince "hiçbir şey yoktur" otomatik. Eski kayıtlardaki checkbox anahtarları görüntülemede radio'ya çevriliyor.
2. ✅ Tüm formlar: Tarama'ya "İntraoral tarama mevcut değilse" kutusu (`intraoral_tarama_yok_<form>`).
3. ✅ Tüm formlar: Çapraşıklık IPR satırlarının varsayılanı "Hiçbiri".
4. ✅ A-P kuralı: köpekdişi/Sınıf I varsa hepsi açık (kanin ile karışık dahil).
5. ✅ Overbite: Diğer işaretliyse Üst/Alt pasif.
6. ✅ Moderate (yetişkin, ergen): A-P 3 satır, 3. satır "kısmi olarak 3 mm'ye kadar".
7. ✅ Çocuk First: süt dişleri (52 diş) üç ızgarada, A-P 2. satır "Yalnızca azıdişi", bite ramp Hiçbiri/Lingual, posterior çapraz varsayılan Düzelt, karşıt arkta pasif aligner yok, erupsiyon kesicileri eklendi, uygunluk notu.
8. ✅ Yeni formlar: `detayli_form_yetiskin_lite`, `detayli_form_yetiskin_express`, `detayli_form_ergen_lite`, `detayli_form_ergen_express` (Moderate'ten türetildi; Lite/Express paketleri artık aktif).
9. ✅ Flex Rx (3 Ekim 2026): form türüne "Yeni Hasta (Flex Rx)" kartı eklendi (`form_turu = yeni_hasta_flex`). Paket seçilince `#flex_form_section` açılır: ark (3 seçenek), dört diş ızgarası (hareket sınırı, ataşman sınırı, çekim, eksik), 11 "vakaya özel tercih" kutusu (`flex_override_<bölüm>` işaretlenince IDS seçenekleri açılır, şablon metni gri referans), tarama, 10.000 karakterlik özel notlar. Kayıtta yalnızca işaretlenen bölümlerin seçenekleri saklanır. Ergen/çocuk için de aynı Flex formu kullanılır (IDS'te ayrı Flex incelenmedi). Deneme sonrası sadeleştirilebilir.

Yapılmayanlar: "Belli boşlukları düzenle" mm ızgarası (IDS'te açılamadı), Gülümseme Mimarisi / Vivera / Palatal formları (kullanıcı kararı).

Not: IDS'te "DENEMEIKI, TEST" deneme hastası ve üzerinde Comprehensive (Flex) reçete taslağı duruyor; arşivlenmeli.
