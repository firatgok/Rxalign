# IDS Yardımcısı (Chrome eklentisi)

Invisalign Doctor Site'ta (IDS) yeni hasta girişini, form sitesinde kayıtlı reçeteden ve hastanın fotoğraf
klasöründen yararlanarak büyük ölçüde kendiliğinden yapar. Reçeteyi **göndermez**: Özet adımında durur, "Gönder"e
her zaman kullanıcı basar.

Desteklenen kayıtlar: yeni hasta (geleneksel reçete) için **Yetişkin ve Ergen Comprehensive / Moderate / Lite /
Express** ile **Çocuk Invisalign First**; mevcut hasta için **Refinement (Ek Hizalayıcılar)**. Vivera, palatal
genişletici, Flex Rx ve toplu hizalayıcı formları doldurulmaz; bu sayfalarda eklenti yalnızca durumu yazar.

## Kurulum (her bilgisayarda bir kez)

1. Bu klasörü kalıcı bir yere koyun (örneğin `C:\IDS-Yardimcisi\`); Chrome eklentiyi buradan çalıştırır.
2. Chrome'da `chrome://extensions` sayfasını açın, sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle**'ye basıp bu klasörü seçin.
4. Klasördeki `Guncelleyiciyi-Kur.bat` dosyasını bir kez çift tıklayın. Bu, Chrome'a eklentinin güncelleyicisini
   tanıtır (yalnızca bu kullanıcı için bir kayıt defteri girdisi ve `updater\updater-host.json`); eklenti
   bundan sonra yeni sürümleri kendisi indirir ve sorar (aşağıya bakın).
5. Eklenti simgesine tıklayın (ya da kartta **Ayrıntılar > Uzantı seçenekleri**), açılan sayfaya Anthropic API
   anahtarını girip kaydedin.
6. Aynı ayar sayfasında **Ana klasörü seç** ile hasta klasörlerinin durduğu üst klasörü (örneğin
   `Belgeler\FGO Hasta Fotoları`) bir kez seçin. Fotoğraflar, portre, röntgen ve CBCT her hastada bu klasörün
   içindeki, hastanın adını taşıyan alt klasörden alınır; IDS'te ve CBCT portalında ayrıca klasör seçmek gerekmez.
   Chrome tarayıcı yeniden açıldığında okuma iznini yeniden isteyebilir; o zaman IDS sayfasında sağ üstte çıkan
   kutudaki **İzin ver** düğmesine basın (bu düğme eklentinin kendi çerçevesindedir, çünkü izin siteye değil
   eklentiye verilir).

Eski yöntem de çalışır: ayar sayfasında ana klasör seçilmemişse paneller klasörü o sitede seçtirir (IDS ve CBCT
portalında ayrı ayrı).

### Güncelleme

Eklenti Chrome her açıldığında, IDS sayfası açılınca (son denetim 5 dakikadan eskiyse) ve 5 dakikada bir `raw.githubusercontent.com/firatgok/Rxalign/main/ids-extension-release/latest.json`
dosyasına bakar. Yeni sürüm varsa zip'i güncelleyiciye indirtir ve IDS sayfasındaki panelin başlığının altında
**"IDS Yardımcısı X güncellemesi indirildi; panel boşta kalınca kendiliğinden kurulacak"** şeridi çıkar. Kurulum
kendiliğinden yapılır: hiçbir IDS sekmesinde panel 60 sn boyunca çalışmıyorsa zip eklenti klasörünün üzerine açılır
ve eklenti yeniden başlar (açık IDS sayfalarında şerit "F5 ile yenileyin" der; paneller sayfa yenilenince döner).
**Şimdi kur** beklemeden kurar, **Sonra** şeridi 6 saat gizler. Ayar sayfasındaki **İndirilen güncellemeyi kendiliğinden
kur** kutusu kapatılırsa kurulum yalnız **Kur** düğmesiyle yapılır. API anahtarı ve ana klasör seçimi korunur. Ayar sayfasındaki **Güncelleme** bölümünden **Şimdi denetle**
ile beklemeden de denetlenebilir.

`Guncelleyiciyi-Kur.bat` çalıştırılmamışsa şerit zip bağlantısını gösterir; o zaman eski yöntem geçerlidir:
zip'i aynı klasörün üzerine açın, `chrome://extensions` sayfasında eklentinin yenile simgesine basın ve açık IDS
sekmelerini F5 ile yenileyin.

## Hasta klasörleri

Ana klasörün içinde her hastanın kendi klasörü olmalı ve klasör adında hastanın adı ve soyadı geçmelidir
(örneğin `Ana klasör\Ezgi Çetin Gök\`). Türkçe karakterler, sözcük sırası ve addaki fazladan sözcükler sorun olmaz.

Hasta klasörünün içi:

| Alt klasör | Kullanıldığı yer |
|---|---|
| **Başlangıç** (ya da doğrudan hasta klasörüne atılmış fotoğraflar ve panoramik röntgen) | Yeni hasta girişi: portre, fotoğraflar, röntgen |
| **Refinement** | Refinement (Ek Hizalayıcılar) reçetesinin Fotoğraflar adımı |
| **CBCT** (içinde .dcm dosyaları, alt klasörlerde olabilir) | Tara adımındaki CBCT yüklemesi |

Alt klasör adlarında yazım hatası ya da ek sözcük olabilir ("Fırat Gök CBCT 06092026", "rifaynıt", "baslangic
fotolar"); eklenti adı yakın yazımlardan tanır. "Başlangıç" klasörü yoksa hasta klasörünün kendisindeki fotoğraflar
alınır; CBCT ve Refinement klasörleri yeni hasta fotoğraflarına karışmaz. Refinement klasörü yoksa refinement
reçetesinde fotoğraf yüklenmez, panel uyarır.

## Akış

| IDS sayfası | Eklentinin yaptığı | Kullanıcıya kalan |
|---|---|---|
| Yeni hasta | Dentsoft hasta kartında "IDS'e aktar"a basıldıysa sayfa açılır açılmaz ad, soyad, cinsiyet, doğum tarihi ve T.C. kimlik no dolar ve Rxalign'daki kayıt ada göre bulunup seçilir (tek kesin eşleşmede; birden çoksa liste gösterilir). Dentsoft kullanılmadıysa kayıtlı formlar listelenir; seçilen kayıttan ad, soyad, MI yazılır (Türkçe karaktersiz) | Kontrol edip "İleri"; Dentsoft kullanılmadıysa kaydı seçmek ve cinsiyet, doğum tarihi, T.C. kimlik no |
| Klinik Koşullar | Boş bırakıp geçer | |
| Hasta Portresi | Hasta klasöründen önden gülümseme karesini seçip yükler, geçer (portre zaten yüklüyse dokunmaz, bekler) | |
| Tara | Kayıtlı iTero sipariş kodunu arar, taramayı seçer, geçer. CBCT işaretliyse CBCT kutusunu işaretler, Align CBCT portalını yeni sekmede açar, hasta klasöründeki .dcm klasörünü oraya yükler, bitince "Yenile"ye basıp geçer | Portalda ilk kez: oturum açmak ve ana klasörü bir kez seçmek |
| Fotoğraflar | Klasördeki orijinalleri olduğu gibi IDS'e bırakır (IDS'in sınıflandırıcısı ve yön okuması kırpılmamış kareyle çok daha isabetli; kullanıcı gözlemi, 30 Ekim 2026). Yükleme bitince: IDS'in boş bıraktığı yuvalar yerleşmeyen karelerin sınıflandırmasıyla doldurulur (silme yok); dolu yuvalar klasördeki orijinallerle imzayla eşlenir (benzer çekimlerden belirgin biçimde daha net olan seçilir); ağız içi beş yuvanın yönü (üst çene, ön dişler, oklüzalde damak/dil) Opus ile orijinal küçük kareden okunur ve aynı anda sekiz yuvanın kırpma kutusu/ölçümleri yuva etiketi verilerek Sonnet'ten alınır (oklüzalde diş sırası kutusu ayrıca odaklı okunur); sağ/sol bukkal ve üst/alt oklüzal karışmışsa orijinaller yer değiştirir; ağız içi karenin yönü (bağımsız tek kare okumaları, tutarlılık denetimi, uyuşmazlıkta Opus hakem) bilinince kare dikleştirilip kırpma kutusu dik karede ölçülür; sonra her yuvanın karesi tuvalde kırpılır (ön/yan: ekartör kolları %30 içeride, dudak-dişeti kıvrımı dengesi, C ekartör iç ucu, diş emniyeti, orta hat simetrisi, oklüzal düzlem eğimi düzeltmesi, en/boy en çok 2:1, asgari 1000x500 px; oklüzal: diş sırası + %10; yüz: saçtan yakaya dikey 2:3, %10 pay), döndürülür (oklüzalde aynalanır) ve yuvaya "Değiştir" ile konur. Kırpma kaydı olmayan (elle yüklenmiş, eşlenemeyen) yuvada yön IDS'in menüsüyle düzeltilir. Notlar kapalı "ⓘ Notlar (N)" düğmesinde; uyarılı satırda ↻ 90°/180°/270° ve "Karşı yuvaya taşı" düğmeleri. Orijinal dosyalar değişmez. | "Devam et" ya da "Kırpılmamış hallerine dön" (yön korunur); uyarı çıkan yuvaları kontrol |
| Radyograf | Klasördeki panoramik röntgeni yükler, geçer (röntgen zaten yüklüyse dokunmaz, bekler) | |
| Hasta dosyası | "Başla"ya basar | |
| Tedavi seçenekleri (hasta tipi, paket) | Hasta tipi süzgecini (Yetişkinim / Ergenler / Çocuk) kayıtlı forma göre işaretler, kayıtlı formdaki paketin kartını turuncu çerçeveyle gösterir, bekler | Paket kartında "Seç"e basmak (çocukta uygunluk penceresi açılırsa "Tamam") |
| Flex Rx açılışı | Geleneksel reçeteye geçer (form ve paket başına bir kez) | |
| Reçete 1. adım | Kayıt seçme paneli: ürün seçiminden ya da hasta dosyasından gelen kayıt "önerilen" olarak seçili gelir | "Formu doldur"a basmak (ya da başka kayıt seçmek) |
| Reçete adımları (pakete göre 7-10 adım) | Kayıtlı formdaki paketin alanlarını doldurur, ilerler; seçilen paket kayıttakinden farklıysa doldurmaz, uyarır | |
| Reçete: Tara, Fotoğraflar, Radyograf, Klinik Etkinlik, İndirim | Geçer; eksik fotoğraf ya da röntgen varsa klasörden tamamlar | CBCT işaretliyse Tara'da bekler |
| Özet | Durur | Kontrol edip "Gönder" |

Refinement (tedavisi süren hasta): hasta dosyasında panel kayıtlı refinement formunu bulur ve **"Ek Hizalayıcıları
başlat"** düğmesi gösterir (bu sayfaya her girişte kendiliğinden başlamaz). Düğmeye basılınca Ek Hizalayıcılar
reçetesi açılır ve 7 adım kayıttan doldurulur: başvuru nedeni ve kullanılan hizalayıcı numarası, tedavi edilecek ark
ve plan, diş hareketi sınırlamaları, A-P, ataşmanlar ve mevcut ataşmanlar, IPR ve hassas kesimler, rezidüel boşluklar
ve tedavi talimatları. Ardından Tara, Fotoğraflar, Klinik Etkinlik ve Özet aynı şekilde işlenir. Kayıtta "CBCT Tara" işaretliyse (form sitesinin refinement bölümüne eklendi) CBCT, hasta
klasörünün Refinement klasöründeki ya da hasta klasöründeki CBCT klasöründen yüklenir. Hastanın birden fazla
refinement klasörü varsa fotoğraf paneli hangisinin kullanılacağını sorar; seçim o reçete için hatırlanır ve CBCT de
aynı klasörden alınır. Tara adımında
kayıttaki "Hasta adı / iTero sipariş kodu" metni aranır; sipariş kodu yazılmışsa tarama kendiliğinden seçilir, ad
yazılmışsa (iTero'daki yazımla, Türkçe karakterler dahil) liste gösterilir ve seçim kullanıcıya kalır. Formda diş
olarak işaretlenen "IPR yapılmayacak temaslar", "belirlenen şekilde gerçekleştirilen IPR" miktarları, "belirtildiği
gibi hassas kesimler" ve rezidüel boşluk miktarları IDS'te elle girilir; eklenti o adımda bekler.

Eklenti bir adımda emin olamazsa (kayıt bulunamadı, tarama kodu tutmadı, IDS bir seçimi kabul etmedi ya da pasif
tuttu, fotoğrafta "sağ/sol şüpheli" uyarısı) ilerlemez, panelde nedenini yazar. Sayfayı kontrol edip "Devam et"e
basın: adım olduğu gibi gönderilir ve doldurma sonraki adımdan sürer. IDS'te "İleri"ye basarsanız sonraki adımda
panelden "Devam et" gerekir.

Kendiliğinden geçilen adımlar hasta başına bir kez geçilir; bir adıma geri dönerseniz eklenti sizi oradan atmaz.

**Durdurma ve elle sürdürme.** Paneldeki "Durdur" her an geçerlidir: o anki adım gönderilmez, Tara/Fotoğraflar
gibi bekleyen adımlar ilerletilmez, Radyograf paneli de kendiliğinden geçmez. Sonrasını IDS'te elle yapabilirsiniz;
eklenti o reçeteye dokunmaz. İstediğiniz adımda "Devam et" derseniz doldurma oradan sürer ve arada elle geçtiğiniz
adımlar listede "elle dolduruldu" olarak işaretlenir. Bulunduğunuz adımı kendiniz doldurduysanız "Elle bitirdim,
sonraki adımdan sür" düğmesi sayfayı olduğu gibi gönderir ve sonraki adımdan devam eder. Listede artık Tara,
Fotoğraflar, Radyograf, Klinik Etkinlik ve İndirim de görünür.

Fotoğraf panelinin düğmeleri (hasta sihirbazında ve reçetede aynı): **Hasta klasörünü otomatik yükle** (ana
klasörden hastanın klasörünü bulup IDS'e bırakır; bulamazsa klasör penceresi açar; "Durdur" açıkken de çalışır),
**Klasörü elle seç**, **Yönleri düzelt**, **Tüm fotoları sil** (onay sorar; sekiz yuvayı IDS'in kalem menüsündeki
"Sil" ile tek tek boşaltır) ve **Durdur / Devam et**.

Hasta sihirbazındaki Fotoğraflar adımında fotoğraf panelinin kendi "Durdur" düğmesi vardır: basılınca yönler
düzeltilmez ve "İleri"ye basılmaz; fotoğrafları elle yükleyip kendiniz ilerlersiniz ("2. Yönleri düzelt" yine
elle kullanılabilir). "Devam et" bekleyen yüklemeyi izleyip yönleri düzeltir ve ilerler. Durdurma o hasta için
oturum boyunca hatırlanır; sayfaya geri dönülürse klasör kendiliğinden bırakılmaz. Reçetede form doldurucu
durdurulmuşsa fotoğraf paneli de klasörü kendiliğinden bırakmaz.

Reçete yarıda bırakılıp (sekme kapatılıp) sonradan yeniden açılırsa doldurma açılan adımdan kendiliğinden sürer;
"Durdur"a basılmışsa "Beklemede" yazar ve "Devam et" beklenir. Aynı reçete aynı anda iki sekmede açıksa yalnızca
biri doldurur; öbüründe "Bu reçete başka bir sekmede dolduruluyor" yazısı ve "Bu sekmede devam et" düğmesi çıkar.

## Kurallar

- **Fotoğraf yönleri.** Ağız dışı üç fotoğrafa dokunulmaz. Oklüzaller kesiciler üst arkta yukarı ("n"), alt arkta
  aşağı ("u") gelecek şekilde döndürülür ve her zaman ayna görüntüsü alınır. Ağız içi önden, üst çene yukarı gelecek
  şekilde döndürülür. Bukkallerde ön dişler sağ bukkalde sağda, sol bukkalde solda olur (sağ/sol ayrımını IDS yapar).
- **Tarama.** Kod birebir tutan tek tarama varsa seçilip geçilir. Kayıtlı formda "İntraoral tarama mevcut değilse"
  işaretliyse adım kullanıcıya bırakılır.
- **Röntgen.** Klasördeki gri tonlu ve yatay görüntü panoramik sayılır. Renkli kaydedilmiş röntgen tanınmaz.
- **Boşluklar.** "Belli boşluklar bırak" (Comprehensive) ya da "Rezidüel boşlukları kapat" (refinement) seçiliyse
  diş aralarındaki mm değerleri kayıtlı formda olmadığından eklenti o adımda durur. Panelde **ekran görüntüsü
  yapıştırma kutusu** çıkar: ölçülerin göründüğü ekranı Win+Shift+S ile kırpıp kutuya Ctrl+V ile yapıştırın;
  görüntü yapay zekaya gönderilir, okunan değerler ızgaradaki doğru diş aralarına yazılır (FDI çiftleri, ör.
  1.3-1.2), panel yazılanları ve eşlenemeyenleri listeler. Izgarayı kontrol edip "Devam et"e basın.
- **Tek çene.** Yalnızca üst ya da alt çene tedavi ediliyorsa IDS öbür çeneye ait kutuları kapatır. Eklenti o
  çeneye ait seçimleri uygulamaz; formda bilinçli işaretlenmiş olanları (diş, kapanış) notla bildirir, çapraşıklık
  satırlarını sessizce atlar.
- **Paket kuralları.** Lite'ta diş çekimi yalnızca kesici dişlerde seçilebilir; Express'te A-P ve çekim adımı yoktur;
  Moderate, Lite, Express ve First'te Tara adımında CBCT kutusu yoktur. Kayıtta olup IDS'te bulunmayan seçimler
  panelde uyarı olarak görünür.
- **Ergen ve çocuk.** Özel talimat adımındaki erüpsiyon kompansasyonu ve terminal azıdişi seçimleri kayıttan
  doldurulur; IDS her çeyrekte tek terminal azıdişi kabul eder.
- **Kırpma.** Yönler düzeltildikten sonra panel "Fotoğrafları kırpmanız bekleniyor" der ve bekler; yuvalardaki
  kalem > Kırp ile kırptıktan sonra "Kırptım, devam et" ya da kırpmadan geçmek için "Kırpmadan devam et" seçilir.
  Hasta sihirbazında "İleri" ancak bundan sonra basılır, reçetede doldurma ancak bundan sonra sürer.
- IDS dolu bir fotoğraf yuvasına yeni fotoğraf yerleştirmez.

## CBCT

Kayıtlı formda "CBCT Tara" işaretliyse Tara adımında kutu işaretlenir. IDS'te CBCT kaydı yoksa eklenti Align'ın CBCT
portalını (auto.smarthub.invisalign.com) yeni sekmede açar; oradaki panel hasta klasörünü adından bulur, içindeki
.dcm klasörünü (en çok .dcm dosyası içeren alt klasör, altı düzeye kadar) portala verir, portal dosyaları denetleyince
"Yükle"ye basar ve yükleme bitince IDS sekmesine haber verir. IDS sekmesi "Yenile"ye basıp CBCT'nin listelendiğini
görünce taramayı seçip geçer. İlk kullanımda portalda bir kez Align hesabıyla oturum açmak ve "Ana klasörü seç" ile
hasta klasörlerinin üst klasörünü seçmek gerekir (klasör izni site başına verilir). Portal dosyaları kabul etmezse
ya da yükleme bitmezse panel nedenini yazar; "Yükleme bitti, IDS'e bildir" düğmesiyle elle tamamlanan yükleme IDS'e
bildirilebilir.

## Gizlilik

- Portre seçimi için hasta klasöründeki dikey karelerin (yüz fotoğrafları) küçültülmüş kopyaları (512 piksel)
  Anthropic API'sine gönderilir.
- Yön düzeltme için yuvalardaki beş ağız içi fotoğrafın IDS önizlemeleri (yaklaşık 800 piksel) gönderilir.
- Tam boy dosyalar ve röntgen yalnızca IDS'e gider. Röntgen yapay zekasız tanınır.
- API anahtarı yalnızca o bilgisayardaki eklenti deposunda durur.
- Kayıtlı formlar form sitesinin Firestore veritabanından yalnızca okunur. Bulut yalnızca giriş yapmış klinik hesaplarına açık
  olduğundan ayar sayfasındaki **Rxalign hesabı** bölümünden (sitedeki e-posta/şifreyle) bir kez giriş yapılır; şifre saklanmaz,
  yalnız oturumun yenileme anahtarı eklenti deposunda durur. **Bağlantıyı sına** okumanın çalıştığını gösterir.

## Geliştirme

| Dosya | Görevi |
|---|---|
| `rx.js` | Yeni hasta, Klinik Koşullar, Tara, hasta dosyası, ürün seçimi, reçete doldurma ve sonraki adımlar |
| `content.js` | Fotoğraflar adımı: klasörü bırakma, yön düzeltme, kırpma sonrası kontrol |
| `crop.js` | Yerleştirme sonrası kırpma yardımcıları: `prepare` (küçük kare + imza + netlik), `classify` (yerleşmeyen kareler), `readBoxes` (yuva bilinerek kutu + ölçümler, oklüzalde `ids-arch`), `frameFor`/`cropFor`/`fullFor` (çerçeve hesabı `intraoralFrame`, `occlusalBox`, `relaxBox`; tuvalde kırp + döndür + ayna), `matchGroup` (önizleme ↔ orijinal, dört yönlü imza) |
| `page.js` | Sayfanın kendi dünyasında bırakma olayı ve yükleme isteklerinin sayımı |
| `portrait.js`, `xray.js` | Hasta Portresi ve Radyograf adımları |
| `folder.js` | Ana klasör, hasta klasörünü adından bulma; ayar sayfasında seçilen ortak klasör `bridge.html` çerçevesi üzerinden okunur (klasör tanıtıcıları kökene bağlı olduğundan) |
| `bridge.html`, `bridge.js` | Eklenti kökeninde çalışan klasör köprüsü: siteye gizli iframe olarak yüklenir, dosyaları postMessage ile verir, gerekirse "İzin ver" düğmesini gösterir |
| `cbct.js` | CBCT portalı: hasta klasöründeki .dcm klasörünü portala verir, yüklemeyi izler |
| `options.html`, `options.js` | Rxalign hesabı girişi, API anahtarı, ana klasör seçimi, güncelleme durumu ve "Şimdi denetle" |
| `update.js` | Panellerin başlığının altındaki güncelleme şeridi (kendiliğinden kurulum bildirimi / Şimdi kur / Sonra; sekme etkinliğini ve yeniden başlayan eklentiyi izler) |
| `updater/updater.ps1`, `updater.bat` | Chrome'un yerel mesajlaşma sunucusu: zip'i indirir, eklenti klasörünün üzerine açar |
| `Guncelleyiciyi-Kur.bat`, `updater/kur.ps1` | Güncelleyiciyi bu bilgisayara kaydeder (HKCU `NativeMessagingHosts\com.rxalign.idsupdater`) |
| `../tools/release.js` | Sürüm yayını: zip + `latest.json` üretir (`ids-extension-release/`), `--push` ile siteye gönderir |
| `src/background.js` | Anthropic çağrıları ve Firestore okuması; `npm run build` ile `background.bundle.js` üretilir |

```bash
npm install
npm run build
```

Sürüm yayınlama: `manifest.json` içindeki `version` artırılır, `npm run build` ile paket üretilir, sonra
`node ../tools/release.js --push --notes "kısa not"` çalıştırılır. Betik eklenti klasörünü (node_modules ve
makineye özel `updater-host.json` hariç) `ids-extension-release/ids-yardimcisi-<sürüm>.zip` olarak paketler,
`latest.json` yazar, zip'i İndirilenler'e kopyalar ve depoya commit + push eder; birkaç dakika içinde (GitHub
önbelleği) kurulu eklentiler yeni sürümü görür. Sitenin kendi alan adında HTTPS sertifikası olmadığından dosyalar depodan okunur. Depo herkese açık olduğundan zip içindeki kod da
açıktır; API anahtarı ve klasör bilgisi zipte yoktur. Eklentinin kimliği (`bgepiaaakgecaoehcgjakjcoaejcoiip`)
`manifest.json` içindeki `key` ile sabitlenmiştir; bu kimlik güncelleyicinin `allowed_origins` kaydında da
geçtiğinden değiştirilmemelidir (özel anahtar `../ids-extension-key.pem`, depoda yoktur).

Form eşlemesi `rx.js` içindedir: `PACKAGES` kayıt türünü (hasta tipi + paket) form alanı sonekine
(`_yetiskin_comp`, `_ergen_lite`, `_cocuk_first`…) ve IDS reçete sayfasına bağlar; `stepsFor(page)` paketin adım
listesini verir, her adım sayfadaki bir alan kimliğinden (probe) tanınır ve bir yapıcı işlev (`buildAP`,
`buildOverbiteLite`…) kayıt değerlerini IDS kimliklerine çevirir. Paketler arası farklar
`docs/IDS_PAKET_FARKLARI.md` dosyasındadır. Eklentinin tamamı IDS'in sayfa yapısına (alan kimlikleri, düğme
sınıfları, görüntü servisinin adresi) dayanır; Align sayfayı değiştirirse ilgili dosyadaki seçiciler güncellenmelidir.

## Dentsoft köprüsü

Dentsoft (clinic.dentsoft.com.tr) hasta kartının "Bilgi" sekmesinde sağ altta **IDS'e aktar** düğmesi görünür.
Basılınca ad, soyad, T.C. / pasaport no, doğum tarihi ve cinsiyet eklentiye alınır ve IDS'in Yeni hasta sayfası yeni
sekmede açılır ve kimlik alanları kendiliğinden dolar (panelde **Dentsoft bilgileriyle doldur** düğmesi yeniden yazmak için durur); kontrol edip
"İleri"ye basılır. Dentsoft'a hiçbir şey yazılmaz. Alınan bilgi 3 saat geçerlidir ve yeni bir aktarım öncekinin
yerine geçer.
