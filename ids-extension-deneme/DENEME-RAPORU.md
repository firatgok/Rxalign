# IDS Yardımcısı 0.33.7 deneme raporu, ek (8 Kasım 2026, gece 2): hızlandırma 3 (1-4)

Kullanıcı "daha da hızlandırırsan ne kadar" sorusuna verilen 1-4 önerisini denemede uygulattı; aynı altı hastayla ölçüldü. Yayınlanmadı.

Uygulananlar (deneme klasörü):
1. Yüz kareleri planlama sürerken kırpılıp yuvaya yüklenir (`crop.faceEarly[key]`, planDirect'te yüz seçimi biter bitmez; yüz kutuları
   zaten erken okunuyordu). onFix'teki `placeCropped` hazır sonucu kullanır ("planlamada kırpıldı ... + yüklendi"); yükleme olmazsa
   yeniden kırpar. onDirect'in "yuva dolu" denetimi erken yüklenen yüz yuvalarını dolu saymaz (ilk denemede IDS'e bırakma yoluna düşüp
   60 sn sürmüştü).
2. Ön/bukkal kutu okumaları bukkal kümesi beklenmeden, tek kare okumalarına göre olası karelerle başlar (`prefetchBoxes(guess)`); küme
   karşı yanı derse anahtar tutmaz, onFix yeniden okur.
3. Yön okumaları etiketleri beklemeden, kare hazır olur olmaz başlar (bırakma işleyicisinde `startPose`, en çok 30 kare; yüz kareleri de
   okunur). planDirect aynı `pose|ad` anahtarını kullanır.
4. Bukkal kümesi bekleme penceresi 3 → 1 sn. Buna bağlı iki düzeltme:
   - Küme planlamaya yetişmezse onFix'in yön adımında en çok 2,5 sn daha beklenir; küme yerleşen bukkali karşı yana koyuyorsa yuvalar
     takas edilir ya da kümenin o yan dediği aday konur (`poseItemFor` ile yön öğesi yeniden kurulur, `pairDecided`). Demirtaş'ta tek kare
     okumaları 0546'yı sağ demişti, küme sol; sağ yuvaya 0547 kondu.
   - planDirect'te küme yerleştirdiyse tek kare okumasının `put`u üzerine yazmaz (`put` boş yuva denetimi yapmıyordu; kümenin koyduğu
     0547, 0546 ile ezilmişti).

Sonuçlar (son kodla; 8/8 ve paftalar gözle doğru):

| Set | Önceki (hız 2) | Şimdi | Plan / düzeltme | Not |
|---|---|---|---|---|
| Ferit (34 kare) | 26 | 24 (bir önceki koşu 21) | 10 / 14 | yerleşen bukkallerin orta kesit okumaları Opus hakeme düştü (8-10 sn), düzeltme bunu bekledi |
| Esra Demirtaş | 25 | 19 | 12 / 8 | tek kare okumaları üç bukkali aynı yana okudu; yedek küme (süren okuma) 0547 sağ, 0545 sol |
| Eray Çakır | 23 | 19 | 11 / 8 | |
| Enes Salar | 27 | 25 | 13 / 12 | sol bukkal 1546 kümeyle; orta kesit okuması onFix'te |
| Emirhan Balaban | 24 | 24 | 18 / 6 | A/B dik 15 sn (hakemler), oklüzal kümesi tahmini tutmadı → yeniden okundu |
| Elif Işınsu Satoğlu | 23 | 18 | 9 / 9 | |

Ortalama 25 → 22 sn (hız 2'ye göre); baştaki 40 sn'ye göre %45. Düzeltme adımı 6-9 sn'ye indi (yüzler planlamada yüklendiğinden);
kalan süre planlama dalgasındaki Opus hakem ve küme çağrılarının oynaklığı (3-10 sn) ile yuva başına ~3 sn IDS yüklemesi.
Dikkat: 1 sn'lik küme penceresiyle bukkal yan kararı daha sık tek kare okumalarına kalıyor; onFix'teki geç küme denetimi bunu yakalıyor
(Demirtaş'ta iki kez doğrulandı), ama küme 2,5 sn içinde de gelmezse tek kare okumaları kalır. Ek maliyet: yüz karelerine yön okuması
(set başına +10-20 Sonnet çağrısı, ~0,1 $).

# IDS Yardımcısı 0.33.7 deneme raporu, ek (8 Kasım 2026, gece): hızlandırma 2 (1-7)

Kullanıcı "daha da hızlandırmak mümkün mü" diye sordu; önerilen 1-7 denemede uygulandı ve aynı altı hastayla ölçüldü. Yayınlanmadı.

Uygulananlar (deneme klasörü):
1. Kutu okumaları planlama biterken başlar (`prefetchBoxes`): ön/bukkal için karenin kendi A/B okuması (yüz ipuçlu ya da iki ölçek
   uyuşan) ya da bukkal kümesi, oklüzal için yön okuması ile tahmini yön; anahtar `box|yuva|kare|dönüş|ayna` (`boxKey`); onFix aynı
   anahtarı `take()` ile alır, son yön farklıysa yeniden okur. Yüz kutuları da planlamada (`faceBoxKey`) başlar.
2. Opus oklüzal kümesi tahminle dalgayla birlikte (oklüzal etiketli en net 6); yön okumalarıyla aynı küme çıkarsa hazır yanıt, değilse
   yeniden okuma + not "Oklüzal kümesi tahmini tutmadı".
3. Yön okuması baştan yüz olmayan tüm karelere (en çok 18, `poseAll`); oklüzal havuzu (`occAll`) yön okumasından; etiket ön/bukkal
   dese de yön okuması oklüzal diyen kare ön/bukkal adayı değil (Ferit 0212/0213 bukkal etiketlenmişti). Yedek havuzlar kaldı ama
   okumalar hazır olduğundan ardışık süre yok.
4. Sınıflandırma hazırlıkla örtüşür: `prepare(files, progress, onItem)`, hazır olan her 6 kare hemen `classify`e gider
   (`crop.labelRuns`, `ensureLabels` birleştirir). Ayrıca sınıflandırma için kısa şema (`CLASSIFY_SCHEMA`: index/slot/confidence):
   ölçüm alanlarıyla 6 karelik çağrı 7-10 sn sürüyordu, şimdi ~2 sn.
5. Kutular yuva yuva (`boxOf[key]`, her kare ayrı `readBoxes([entry])`); kutusu gelen yuva ötekileri beklemeden kırpılıp yüklenir.
6. hedgeMs 20 → 10 sn.
7. poseParallel 24 → 48.
Ek bulgular ve düzeltmeler:
- Opus hakem (`poseArbiterEffort`) 'high' → 'medium' (8-11 sn → 3-6 sn). Dik okumada üç Sonnet okuması aynı anda (düz, ters, düz);
  düz ile ters uyuşunca sonuç, yalnız iki düz okuma ters okumaya karşı çıkınca hakem.
- 'other' etiketli kareler dik okumaya alınmadı (röntgen ve 0195 hakeme düşüp dalgayı 8 sn uzatıyordu).
- Bukkal kümesi (Opus) de tahminle dalgayla birlikte (bukkal etiketli en net 4): küme sağ ve sol bulursa yan kararı kümeden
  (Demirtaş 0545/0546/0547 üçü de "kesiciler sağda" okunmuş, sağ yuvaya baş aşağı çekilmiş sol bukkal konmuştu). Küme 7-18 sn
  sürebildiğinden dalgadan sonra en çok 3 sn beklenir ("bukkal kümesi beklenmedi" işareti); yuva boş kalırsa yedek aşama süren
  okumayı bekler. Yedek kümede, yerleşmiş bukkali küme karşı yana koyuyorsa yuva boşaltılıp kümeye göre doldurulur.
- Ölçüm: background `askClaude` çağrı istatistiklerini tutar (`ids-stats`: tür, model, ms, jeton, hız sınırı başlıkları); onFix sonunda
  "Model çağrıları" ve "Dik okuma işleri (kuyruk/hazırlık/toplam)" notları; planlamada alt dalga işaretleri (etiketler hazır, yüz
  seçici, A/B dik, yön okumaları, kapanış/oklüzal/bukkal kümesi, plan bitti).

Sonuçlar (son kodla; 8/8 ve paftalar gözle doğru):

| Set | Önce | Şimdi | Plan / düzeltme | Not |
|---|---|---|---|---|
| Ferit (34 kare) | 39 | 26 (bir önceki koşu 21) | 16 / 10 | bukkal kümesi beklenmedi; kapanış kümesi bu koşuda 7 sn |
| Esra Demirtaş | 37 | 25 | 14 / 11 | bukkal yanı kümeden (0547 sağ, 0545 sol) |
| Eray Çakır | 34 | 23 | 13 / 10 | |
| Enes Salar | 52 | 27 | 14 / 13 | sol bukkal 1546 ilk dalgada kümeyle |
| Emirhan Balaban | 44 | 24 (küme beklemesizken 33) | 13 / 11 | üst oklüzal 1505 (tam ark) |
| Elif Işınsu Satoğlu | 31 | 23 | 12 / 11 | |

Ortalama 40 → 25 sn. Zaman çizgisi tipik: hazırlık 2-4, etiketler 5-6, okuma dalgası 8-11, bukkal kümesi 12-14, düzeltme 10-11
(kutular 3 sn içinde, sonra 8 kırpma ikişer + yuva başına ~3 sn IDS yüklemesi). Kalan darboğazlar: Opus küme okumaları (3-18 sn,
oynak), kırpma kuyruğu (cropLock 2; bellek 0,6-1 GB), IDS yükleme tabanı.
Dikkat: sınıflandırma kısa şemayla bir koşuda Ferit'in oklüzallerini (0212/0213) ön etiketledi; yön okumaları bunu yakaladı. Etiketler
yalnız aday havuzu olduğundan sonuç değişmedi ama şema değişikliği etiket kalitesini düşürüyorsa ek sete bakmak gerekir.
Çağrı sayısı set başına ~90-120 (dik okuma üç kat, yön okuması tüm karelere, iki tahmini Opus kümesi).

# IDS Yardımcısı 0.33.7 deneme raporu, ek (7 Kasım 2026, akşam): ön yuvaya kapanıştaki kare

Kullanıcı: Ferit, Esra (Demirtaş), Eray Çakır, Enes Salar, Emirhan Balaban, Elif Işınsu Satoğlu'nda "ağız içi önden" yuvasına ağız açık
kare seçilmiş. Klinik ön kareyi iki kez çekiyor (kapanış + ağız açık); seçim netlik puanıyla yapıldığından açık kare öne geçiyordu.

Değişiklikler (deneme klasörü, yayınlanmadı):
- A/B dik okumasına (`ids-upright`) `bite` alanı: closed / open / none. `readRawUpright` sonucu `bite` taşır (iki okuma çelişirse null).
- Ön adaylar 4 (bukkal 3). `planDirect`'te `closedFirst`: kapanış → okunamayan → ağız açık (son durumda not: "kapanışta kare
  bulunamadı, ağız açık kare ... kondu; kontrol edin"). Bukkallerde de kapanış yeğlenir.
- Tek kare okuması dar aralığı kaçırdı (Çakır 0082 "kapanış"): ön adaylar birlikte `ids-bite-set` (Sonnet, iki sıra, uyuşanlar) ile
  karşılaştırılır; küme sonucu tek kare okumasını geçer.
- Salar: sol bukkal boş kaldı. İki neden: (1) yedek bukkal havuzu (en net 4) okunmamış üst oklüzallerle doluyordu → oklüzal etiketi
  olmayanlar önce, en çok 12, ve yön okuması "oklüzal" demedikçe aday; (2) üç bukkal de "kesiciler sağda" okundu (1546 baş aşağı
  çekilmiş sol). Yedek: bukkal görünümlü kareler birlikte Opus'a (`ids-buccal-set`, medium, iki sıra): hangisi baş aşağı, hangi yan.
  Küme kararı `crop.setOrient` / `crop.setSide` ile onFix'te yön (0°/180°) ve yan için de esas. Son koşuda tek kare okuması doğru
  dönünce (1546 sol) küme yolu devreye girmedi; kod yolu yalnız boş yuva kalınca çalışır. "Yedek bukkal adayları" notu eklendi.
- Balaban: üst oklüzaller "other"/ilk 3 dışı kalınca etiket yedeği bukkal etiketli 1503'ü üst yuvaya koydu. Yedek oklüzal havuzu:
  yüz/bukkal olmayan okunmamış kareler (en çok 10) yön okumasına girer, "oklüzal" görülenler çene okuması ve kümeyle yerleşir; etiket
  yedeği yön okuması bukkal/ön diyen kareyi oklüzal yuvaya koymaz. İlk denemede havuz yarım kadrajlı 1504'ü (tek çeyrek) tam arkın
  (1505) önüne aldı → yön okumasına `complete_arch` alanı; `bestOcc` tam arkı yeğler. "Yedek oklüzal adayları" notu.
- Yedek aşamada yerleşen bukkallerin orta kesit okuması erken başlar (Salar'da yön adımı 15 sn sürmüştü).

Sonuçlar (son kodla, 8/8 ve ön yuvada kapanış):

| Set | Toplam | Okumalar / düzeltme | Ön kare | Not |
|---|---|---|---|---|
| Ferit | 39 sn | 26 / 12 | 0198 kapanış | 0203/0204 açık okundu; ilk koşuda 38 sn |
| Esra Demirtaş | 37 sn | 25 / 12 | 0543 kapanış | 0544 açık |
| Eray Çakır | 34 sn | 21 / 12 | 0081 kapanış | 0082 küme okumasıyla açık (tek kare okuması kapanış demişti) |
| Enes Salar | 52 sn | 27 / 25 | 1543 kapanış | 1544/1545 açık; sol bukkal 1546 yedek havuzdan; düzeltme uzun (orta kesit okuması geç) |
| Emirhan Balaban | 44 sn | 22 / 22 | 1498 kapanış | bir önceki koşuda 36 sn, üst oklüzal yedek havuzdan 1504 (yarım) → tam ark düzeltmesi; son koşuda 1505 |
| Elif Işınsu Satoğlu | 31 sn | 18 / 13 | 0927 kapanış | 0928 açık |

Sınıflandırıcının etiketleri koşudan koşuya değişiyor (Salar'da bukkaller bir koşuda bukkal, diğerinde oklüzal/other); yedek havuzlar bu
yüzden gerekli. Bellek düşükken (0,7 GB) kutu okumaları uzuyor (Balaban son koşu: 11 sn).

# IDS Yardımcısı 0.33.7 deneme raporu (7 Kasım 2026)

## 0.33.7: doğrudan yerleştirme (0.33.6 yayında)
Kullanıcı "1'i dene" dedi: orijinaller IDS'e bırakılmıyor; eklenti kareleri kendisi seçip kırpıyor ve boş yuvaların dosya girişine
(`-<yuva>-uploader-input`) doğrudan yüklüyor. IDS'in 17-34 orijinali sınıflandırıp yüklemesi (12-39 sn) ve ikinci yükleme (Değiştir) atlanıyor.
Kapatmak: sayfada `localStorage.idsfyDirect = '0'` (eski akış). Yuvalar doluysa ya da sınıflandırma hiçbir kare ayıramazsa eski akışa düşer.

Yerleşim kararı (content.js `planDirect`): etiket yalnız aday havuzunu belirler, karar okumalardan:
- **Sınıflandırma iki geçişli** (`crop.js classify`): EXIF'li küçük kare (yüzler dik) + ham küçük kare (ağız içi dik). Kameranın yanlış EXIF'i
  yüzünden yan duran bukkaller tek geçişte "other"/"labial" etiketleniyordu (Girgin, Kumru). Güvenirliği yüksek etiket kazanır; ham geçişten
  yüz etiketi alınmaz; "other" 0,7 katsayıyla yarışır.
- **Yüz yuvaları**: yüz etiketli adaylar (en net 12) tek çağrıda seçiciye gösterilir (`ids-face-pick`, Sonnet): yakın plan gülümseme ve üç
  çeyrek kareler elenir (Satoğlu, Balaban'da etiket yanılmıştı).
- **Bukkal/ön**: her etiketten en net 3 aday A/B dik okumasına girer (`readRawUpright`, orta kesit de erkenden); dik karede kesiciler
  sağda → sağ bukkal, solda → sol bukkal, yok → ön. Bukkal yuvası boş kalırsa etiketi bukkal olmayan (oklüzal etiketli ama yön okuması
  "buccal" diyenler dahil) kalan karelere yön okuması + dik okuma uygulanır (Budak, Genç).
- **Oklüzal**: en net 3+3 aday çene okumasına girer; sonra "oklüzal" görülenler birlikte Opus'a (`ids-arch-set`, medium, iki sıra; iki
  okumada aynı çene denenler kabul) gösterilir, üst/alt oradan. Mutlak çene okuması aynanın bastırdığı dilli alt karede "damak" diyordu
  (Ulusoy 0170, Budak 9320, Çakır); ikili karşılaştırma iki üst kareyi karşılaştırınca "unsure" kaldı; küme halinde sorulunca 21/21 doğru.
  Küme kararı varsa çift denetimi (yanlış alarm) atlanır. Karar yoksa çene okuması, o da yoksa etiket/havuz (not: "kontrol edin").
- Planlama okumaları `crop.pre`'ye yazılır; onFix aynı okumaları `take()` ile kullanır (yön adımı 0-3 sn).
- `onFix(auto, direct)`: `has(key)` yuvayı değil planı sorar; `uploadDirect` (60 sn'de bitmezse yuva boşsa bir kez daha); `fixPairSlots`
  doğrudan modda taşımayı sanal yapar, `pairDecided` yuvaları atlar; `fixOcclusalArches` etiket çelişkisini doğrudan modda yok sayar.
- Notlar: "Bukkal/ön adayları", "Oklüzal adayları", "Oklüzal küme karşılaştırması", "Yüz seçimi", "Başlangıçtan beri (sn)".

21 hasta (yeniler klasörü, hasta başına bir set; son kodla koşanlar; Yazar Rx test yatağı):

| Set | Toplam | Okumalar / düzeltme | Not |
|---|---|---|---|
| Elif Işınsu Satoğlu bitim | 33 sn | 20 / 14 | ilk denemede gülümseme yakın planı seçilmişti; seçiciyle düzeldi |
| Elif Kutay Kök bitim | 34 sn | 20 / 14 | |
| Elif Kır | 38 sn | 24 / 14 | ilk denemede üst/alt oklüzal ters (etiket); okumayla düzeldi |
| Emine Girgin | 48 sn | 17 / 30 | ilk denemede bukkaller bulunamadı; iki geçişli sınıflandırmayla düzeldi; boş RAM 0,6 GB |
| Emir Yasir Kumru | 33 sn | 19 / 15 | ilk denemede bukkaller bulunamadı; düzeldi |
| Emirhan Balaban refinement | 37 sn | 16 / 22 | ilk denemede önden yüz üç çeyrek kareydi; seçiciyle düzeldi |
| Enes Salar Refinement | 37 sn | 24 / 13 | ilk denemede iki sağ bukkal; dik okumayla düzeldi |
| Ensar Budak refinement | 46 sn | 23 / 23 | bukkaller "alt oklüzal" etiketlenmişti; yön okuması yedeğiyle düzeldi |
| Eray Çakır Refinement | 32 sn | 20 / 12 | |
| Eren Alp bitim | 41 sn | 26 / 15 | |
| Esma Ulusoy rifaynıt | 39 sn | 22 / 17 | alt oklüzal 6 denemede çözüldü (küme okuması, Opus) |
| esmanur özdemir Refinement | 44 sn | 30 / 15 | |
| Esra Demirtaş bitim | 41 sn | 26 / 15 | |
| Esra Şavklıoğlu Refinement | 38 sn | 20 / 18 | |
| Eylül İşçi refinement | 32 sn | 19 / 13 | |
| Ezgi Ermen Refinement | 37 sn | 23 / 14 | sekme bir kez düşük bellekte yenilendi, tekrar koştu |
| Ezgisu Genç refinement | 37 sn | 24 / 13 | ilk denemede bukkaller bulunamadı ("alt oklüzal" etiketi); düzeldi |
| Fahri Kocak Bitim | 31 sn | 18 / 13 | |
| Fatih Çağlayan Refinement | 34 sn | 22 / 13 | |
| Fatih Çitli | 34 sn | 21 / 13 | |
| Ferit bulut dönmez | 37 sn | 22 / 16 | |

Ortalama 37 sn (0.33.6: 43 sn, 10 hasta; 0.33.5: ~99 sn). Hepsi 8/8 ve görsel olarak doğru (paftalar kullanıcıya gönderildi).
Kalan süre: hazırlık 2-5 sn, sınıflandırma + planlama okumaları 15-25 sn (iki geçişli sınıflandırma, yüz seçici, A/B okumalar, Opus küme
okuması ~7 sn), kırpma + yükleme 12-18 sn (yuva başına yükleme 3-5 sn, örtüşerek). Sonraki kazanç planlama okumalarında (ör. yüz seçici ve
küme okumasını sınıflandırmayla aynı anda başlatmak; ham geçişi yalnız ağız içi adaylara uygulamak).
Açık: düşük bellekte (≤0,7 GB) sekme donabiliyor; bu modda düzeltme 30 sn'ye çıktı (Girgin).

## 0.33.6: hızlandırma (0.33.5 yayında)
Kullanıcı 0.33.5'i yayınlattı, süre için optimizasyon istedi; değişiklikler önce denemede. Ölçüm: panel notlarında "Süre dağılımı" (düzeltme adımları;
Değiştir için [kilit / menü / IDS]) ve "Bırakmadan beri" (hazırlık, IDS yüklemeye başladı, IDS yerleştirdi, erken okuma, yükleme bitti, düzeltme bitti).

Bulgular (Alina Akyol, baz 0.33.5 akışı 60-61 sn):
- **Asıl darboğaz zamanlayıcı kısması:** Chrome penceresi başka pencerenin altındayken sekme gizli sayılır ve setTimeout saniyede bire kısılır.
  200-300 ms'lik beklemeler 1 sn sürüyordu: Değiştir'in menü adımı 0,8 yerine 4,0 sn, kilit yüzünden 8 yuva sırayla bekliyordu (son yuva 13 sn kilitte).
  IDS'in kendi işlemesi yuva başına 3-5 sn. Önceki tüm deneme süreleri de bu koşulda ölçülmüştü.
- Yön okumalarında iki Sonnet okuması sırayla yapılıyordu; 6'lık iş sınırı 8 yuvada 2 işi bekletiyordu; yön okumaları yüz etiketlemesini (5-10 sn) bekliyordu.
- Kırpma kutuları 5 karelik tek çağrıda ~9 sn.
- Dosya boyutu küçük karelerde belirleyici değil (0,1-0,2 MB'a inince de Değiştir sırası aynı); 3000 px sınırı yalnız büyük (2,7-3 MB) karelerde fark eder.
- IDS önizlemeleri yuvaya yükleme sürerken düşer (yuva girişi yükleme bitince oluşur); erken okuma 3-4 sn önce başlayabiliyor.

Değişiklikler:
- `content.js` `sleep`: sekme gizliyken bekleme arka plan servis çalışanında (`ids-sleep`, `src/background.js`); orada kısılmaz.
- Erken okuma (`prefetch`, `warmReads`, `take`): IDS önizlemeleri yerleşince (yükleme sürerken) etiketler, ön/yan karelerin A/B dik okumaları,
  oklüzal yön okumaları ve yüz kutuları istenir; onFix bunları tek kullanımlık alır. onFix'te de okumalar eşleştirmeden hemen sonra başlar.
- `crop.js`: readPose / readRawUpright iki okumayı aynı anda yapar (hakem yine gerektiğinde); `poseParallel` 6 → 12; orta kesit tek çözümle;
  kırpma kutuları kare başına ayrı çağrı (`boxGroupSize: 1`), aynı anda; kırpılmış kare uzun kenarı en çok 3000 px (`outMaxSide`).
- Kırpmalar ikişer ikişer (`cropLock = limited(2)`).
- Erken eşleştirme büyük önizlemeyi küçültülerek çözer (`matchRanked`, resizeWidth 512).
- Denenip geri alınanlar: hazırlığı IDS'e bırakmayla örtüştürmek (21 karelik Mutigulina'da sekme bellekten düştü, kazanç ~2 sn) ve oklüzal
  ölçümün kare başına ayrı çağrısı (`archSplit: false`; ayşe ceren alt oklüzalinde doğrudan görünen üst dişler diş sırasına katıldı).
- Karşılaştırma anahtarı: sayfada `localStorage.idsfyNoSpeed = '1'` hızlandırmaları kapatır.

10 hasta (son kod; Yazar Rx test yatağı, sekme gizli), hepsi yön/yuva doğru:

| Set | Bırakmadan bitişe | Düzeltme adımı | Önce (düzeltme; 0.33.5 / 0.33.4) |
|---|---|---|---|
| Alina Akyol bitim | 35 sn | 23 sn | baz 0.33.5 akışı 60-61 / 45 sn |
| Alina Mutigulina Bitim | 61 sn | 22 sn | 96 / 135 sn (IDS 21 kareyi 39 sn'de yükledi) |
| alis keleş Başlangıç | 31 sn | 20 sn | 105 / 69 sn |
| alper ergüney Başlangıç | 45 sn | 18 sn | – / 139 sn |
| Anastasiya Aydın Başlangıç | 47 sn | 18 sn | 95 / 163 sn |
| asil mert yürekli Faz I Bitim | 36 sn | 23 sn | – / 127 sn |
| Asiye Bozkurt Rifaynıt | 55 sn | 27 sn | 99 / 134 sn |
| Aysun Sezin Karaduman refinement | 38 sn | 21 sn | 107 / 74 sn |
| ayşe ceren akçiçek | 50 sn | 38 sn | 83 / 119 sn |
| Azra Dila Özkul Refinement 2 | 31 sn | 17 sn | 107 / 108 sn |

Ortalama: bırakmadan bitişe 43 sn, düzeltme adımı 23 sn (0.33.5'te 7 sette ~99 sn). Kalan sürenin büyük kısmı IDS'in orijinalleri sınıflandırıp
yüklemesi (bırakmadan sonra 12-39 sn) ve Değiştir işlemesi (yuva başına 4-6 sn, örtüşerek).
Not: ilk 7 set oklüzal ölçümü ayrı çağrıyla yapan ara sürümle koştu; ortak çağrıya dönülen son kod ayşe ceren (yeniden) ve Azra'da denendi.
Açık: ayşe ceren alt oklüzal üst köşelerinde karşı diş uçları (0.33.5 ile aynı), Aysun alt oklüzal üstünde ince çizgi.

## 0.33.5: hız, oklüzalde doğrudan görünen dişler, simetri, ön diş payı
Kullanıcı 0.33.4 görüntülerini uygun buldu. İstekleri: hızlandırma; oklüzalde aynadan yansımayan, doğrudan görünen dişlerin kesilmesi;
oklüzalde simetri için hafif döndürme; ön dişlerle fotoğraf kenarı arasındaki boşluğun kısalması.

- **Süre dağılımı:** panel notlarına adım süreleri yazılıyor ("Süre dağılımı (sn)": yön okumaları, ağız içi kutular, her yuva için kırpma + Değiştir, dosya boyutu).
  İlk ölçüm: yön okumaları 42. sn'de bitiyor, ağız içi işler yüz yuvalarını bekliyordu; yüz yuvalarında IDS "Değiştir" 18-32 sn sürdü.
- **Hız (`content.js`):** "Değiştir" ikiye bölündü: menü adımı sıra kilidiyle (`domLock`), IDS'in işlemesi kilit dışında beklenir. Yüz ve ağız içi yuvalar
  birbirini beklemez, kırpmalar bellek için tek tek (`cropLock`). Bekleme sınırı 60 → 120 sn. Menü kaybolursa (ızgara yeniden çizilince) menü adımı 3 kez denenir
  (Aysun 8507'de tek seferlik "Değiştir girişi bulunamadı" görüldü). Sonuç: Asiye 121 → 66-99 sn, Mutigulina 135 → 63-96 sn; kalan süre IDS'in yükleme
  işlemesi, yuva başına 7-16 sn, bazen bir yuva 70+ sn.
- **Doğrudan görünen dişler (`ids-arch` + `crop.js`):** ölçüm şeridin yanını ve diş sırasına en yakın kenarını bildirir. Model şeridi çoğu kez diş kutusuna da
  katıyor; kenar kutunun dış beşte birindeyse kutu orada kesilir (`trimDirect`), çerçeve şeridin kenarında biter (`excludeDirect`), kesilen boy karşı yana aktarılmaz.
- **Simetri:** ölçüm orta kesicilerin temas noktasını ve en arka iki azının ortasını verir; eksen dik olacak şekilde döndürülür (en çok 12°). Köşe boş kalacaksa
  kutu dişlere kadar daraltılır, yine olmuyorsa açının 2/3'ü, 1/3'ü denenir.
- **Kararlılık:** model aynı karede ekseni 6,3° / 2,2° okudu, şeridi bir çalıştırmada görüp ötekinde görmedi. Oklüzal ölçümü 3 bağımsız okumayla aynı anda:
  kutu ve eksen ortalanır (eksenler 5°'den fazla ayrışırsa döndürülmez), şeridi biri görse kesilir.
- **Ön diş payı:** ön diş yanında pay %10 → %3 (`occlusalFrontMargin`); yan, simetri ekseninden.

| Set (son kod) | Süre | Not |
|---|---|---|
| Asiye Bozkurt Rifaynıt | 99 sn | üst 4,7°, alt 2,0° döndürüldü; iki şerit dışarıda |
| Anastasiya Aydın Başlangıç | 95 sn | iki şerit dışarıda; alt 1,0° |
| Alina Mutigulina Bitim | 96 sn | 3,5° / 5,0°; üst oklüzalde en arka azılar alt köşelere değiyor |
| alis keleş Başlangıç | 105 sn | 2,6° / 1,7° |
| ayşe ceren akçiçek | 83 sn | alt oklüzal üst köşelerinde karşı diş uçları kaldı (3 okuma da şeridi bildirmedi) |
| Aysun Sezin Karaduman refinement | 107 sn | alt oklüzalin en üstünde ince bir karşı diş çizgisi |
| Azra Dila Özkul Refinement 2 | 107 sn | iki Değiştir 72-76 sn sürdü |

Açık: şerit tespiti hâlâ her seferinde tutmuyor (ayşe ceren); şerit azıların arasına sokulmuşsa düz kesim en arka azıları kırpabiliyor (Mutigulina);
IDS'in bazen tek yuvada 70+ sn beklemesi. Sekme düşük bellekte (0,7-1 GB) iki kez dondu/yenilendi.

---

# 0.33.4 raporu (4 Kasım 2026)

## 0.33.4: yan karelerde ön diş tarafı çok dardı
Kullanıcı bir sette sağ bukkalin sağ, sol bukkalin sol kenarını işaretledi: kenar kesicilere dayanıyor, IDS boşluğu bulanık dolduruyor. Diğer yuvaları iyi buldu.

- **Yeni kural (`intraoralFrame`):** yan karede ön diş yanı dişlerden en az `frontRoomX` (0,06) uzakta, en/boy `buccalAspect` (1,7) olana kadar açılır, en çok `frontRoomMax` (0,12). Değerler görüntü genişliğinin kesri. Karşı ekartör gerekirse kısmen kadraja girer. Azı dişi yanı değişmez.
- **Ön diş yanı:** dik karede yuvadan (sağ bukkalde kesiciler sağda). Model karşı ekartörü bazen yanlış yana yazıyor (Asiye, asil mert).
- **Ön diş sınırı:** model aynı karede diş sınırını çalıştırmadan çalıştırmaya 0,1 oynatıyor (alis: 0,24 / 0,36). Karşı ekartör diş sınırına 0,15'ten yakınsa sınır ondan alınır.
- **Emniyet adımı:** "çerçeve dişleri sarıyor" dalı yan karede yan kenarları modelin kutusuna geri alıp açmayı siliyor, yüksekliği de kutuya atlatıyordu. Yan karede artık yalnız yüksekliği diş boyuna göre büyütür.

| Set (son kod) | Süre | Ön diş boşluğu sağ / sol (ölçüm) | Not |
|---|---|---|---|
| Alina Akyol bitim | 131 sn | 0,075 / 0,093 | sağ bukkalde metal alet kadrajda |
| Alina Mutigulina Bitim | 135 sn | 0,101 / 0,107 | |
| alis keleş Başlangıç | 69 sn | 0,14 / 0,079 | |
| alper ergüney Başlangıç | 139 sn | 0,06 / 0,12 | |
| Anastasiya Aydın Başlangıç | 163 sn | 0,081 / 0,117 | Önden yüz: IDS zamanında değiştirmedi, panel uyardı (7/8); son görüntüde kırpılmış |
| asil mert yürekli Faz I Bitim | 127 sn | 0,12 / 0,08 | sağ bukkalde karşı ekartör kadrajda |
| Asiye Bozkurt Rifaynıt | 134 sn | 0,06 / 0,088 | |
| Aysun Sezin Karaduman refinement | 74 sn | 0,08 / 0,06 | |
| ayşe ceren akçiçek ana klasör | 119 sn | 0,06 / 0,107 | alt oklüzalde ayna kenarı ve karşı diş şeridi duruyor |
| Azra Dila Özkul Refinement 2 | 108 sn | 0,16 / 0,06 | |

Alina Akyol ve Mutigulina son iki küçük değişiklikten önce çalıştı; ölçümleriyle hesaplanınca çerçeveleri değişmiyor, yeniden çalıştırılmadı. Boşluklar modelin ölçümünden hesaplandı, göz denetimi büyütülmüş ekran görüntüsünden. Diğer 5 set ve önceki 4 hasta 0.33.4 ile çalıştırılmadı.
Süreler önceki turdan uzun (60-89 sn), neden kanıtlanmadı. Görülenler: "Önden yüz" değişimi bir sette 65 sn sürdü, bir sette zaman aşımına düştü; boş RAM 0,6-1,9 GB; sekme bir kez dondu.

---

# 0.33.3 raporu (3 Kasım 2026)

## 15 yeni hasta (0.33.2) ve 0.33.3 düzeltmesi: profil yuvasına gülen profil geliyordu
Kullanıcı önceki 5 seti iyi buldu, 15 yeni hasta istedi. Ağız içi yön ve sağ/sol 15 sette de doğru göründü. Yeni kusur: Aylin ve Barış'ta
profil yuvasında gülen profil, Asil Utku ve Avesta'da ağzı aralık profil vardı; sette dinlenme profili de bulunuyordu.

- **Kök neden:** sınıflandırma gülen profili de `profile_repose` sayıyordu. İki kare imzada ikiz çıktığı için aday listesine de girmiyordu.
- **Düzeltme:** yeni etiket `profile_smiling`. `fixFaceSlots` adayları yuvalarda kullanılmayan tüm karelerden seçer, düzeltmeden sonra "daha net ikiz" kuralı seçilen kareyi geri değiştirmez.
- **Bilinen sınırlar:** Adem'de gerçek gülümseme yok. 0.33.3 başka bir nötr kareyi gülümseme sayıp koydu, 0.33.2'deki uyarı çıkmadı. ayşe ceren alt oklüzalinde ayna kenarı ve karşı diş şeridi kadrajda kaldı.

| Set | 0.33.2 | 0.33.3 |
|---|---|---|
| Adem Beyter Başlangıç (20 kare) | 81 sn, yön doğru, gülümseme yok uyarısı | 89 sn, yön doğru, uyarı kayboldu |
| Alina Akyol bitim (17) | 76 sn, doğru | |
| Alina Mutigulina Bitim (21) | 70 sn, doğru | |
| alis keleş Başlangıç (12) | 60 sn, doğru | |
| alper ergüney Başlangıç (16) | 73 sn, doğru | |
| Anastasiya Aydın Başlangıç (22) | 70 sn, doğru | |
| asil mert yürekli Faz I Bitim (19) | 71 sn, doğru | |
| Asil Utku Kök ana klasör (20) | 80 sn, yön doğru, ağzı aralık profil | 88 sn, doğru |
| Asiye Bozkurt Rifaynıt (18) | 74 sn, doğru | |
| Avesta Momenzadeh CR (15) | 68 sn, yön doğru, ağzı aralık profil | 86 sn, doğru |
| Aylin Tok bitim (21) | 75 sn, yön doğru, gülen profil | 90 sn, doğru |
| Aysun Sezin Karaduman refinement (17) | 66 sn, doğru | |
| ayşe ceren akçiçek ana klasör (16) | 89 sn, yön doğru, alt oklüzal kadrajı geniş | |
| Azra Dila Özkul Refinement 2 (18) | 74 sn, doğru | |
| Barış Gül refinement (21) | 75 sn, yön doğru, gülen profil | 86 sn, doğru |

Denetim büyütülmüş ekran görüntüsünden yapıldı, tam çözünürlüklü kesit alınmadı. 0.33.3 yalnız tablodaki 5 sette çalıştırıldı.

---

## 0.33.2 düzeltmesi: üst oklüzal baş aşağı kalıyordu
Aşağıdaki tablodaki Altan Başlangıç "8/8" sonucu YANLIŞTI. Ön ve yan kareler doğruydu, ama üst oklüzal baş aşağıydı. Kullanıcının
şikâyetinin bu kısmını 0.33.1 çözmemişti, "iki oklüzal aynı yana ait" notunu da yanlış alarm saymıştım.

- **Kök neden:** ayna çekiminde kamera yukarı baktığı için EXIF rastgele çıkıyor (aynı tutuşta 6 ve 1). EXIF'i 6 olan 0661/0665 yan dönmüş
  küçük kareden okunuyordu. Model ayna görüntüsündeki arkın kesicilerini değil, doğrudan görünen büyük düz diş şeridini kesici sandı.
  Okuma her seferinde "sol" çıktı, gerçek yan "sağ" idi.
- **Düzeltme:** oklüzal yön okuması ham kareden yapılır, döndürme de ham kareye göre uygulanır. Ham karede aynı altı karenin kesici yönü okumalarının hepsi doğru çıktı.
- **Notlar:** panel artık oklüzal yuvaların dosya adını, ham karedeki kesici yanını, çene okumasını ve EXIF değerini yazıyor.
- **Bilinen zayıflık:** çene okuması ham karede de bazen yanlış (Altan 0663/0664, Bera 1897 alt oklüzal, "üst" okundu). Yuva seçimi IDS ve sınıflandırma
  etiketinden geldiği için sonuç bozulmadı. Altan Başlangıç'ta "aynı yana ait" notu bu yüzden yine çıkıyor.

| Set (0.33.2) | Süre | Son ekranda göz denetimi |
|---|---|---|
| Altan Doğan 1.Refinement | 70 sn | 8 yuva doğru |
| Altan Doğan Başlangıç | 65 sn | 8 yuva doğru, üst oklüzal düzeldi |
| Damla Gümüş Başlangıç (Kopya dosyaları hariç, 21 kare) | 68 sn | 8 yuva doğru |
| Bera Arat Başlangıç (16 karelik alt küme) | 70 sn | 8 yuva doğru |
| Altan 1.Refinement, ağız içi kareleri 180° çevrilmiş kopya | 65 sn | 8 yuva doğru, yanlış çevirme yok |

Denetim, IDS'in gösterdiği yuva görüntülerine büyütülmüş ekran görüntüsünden yapıldı. Tam çözünürlüklü kesit bu turda alınmadı.

---
Aşağısı 0.33.1 raporudur.

Bu klasör yayınlanmamış deneme sürümüdür; yayın klasörü `ids-extension/` (0.32.3) değişmedi. Chrome'daki kurulu eklenti test bitince
0.32.3'e geri alındı.

## 2 Kasım raporundaki iki kural yanlıştı (kullanıcı haklıydı)
Kullanıcı: "hatasız geçti dediğin setlerde hata var; Altan Doğan'da ağız içi ön ve iki yan baş aşağı, üst oklüzal de baş aşağı."
2 Kasım'daki "20 hastada 8/8 doğru" doğrulaması küçük resim ölçeğinde gözle yapılmıştı; 180° farkı o ölçekte gözle ayırt
edilemiyor (ben de iki kez yanlış okudum). Bugün her sonuç tam çözünürlükten nesnel kesitlerle denetlendi
(burun/burun delikleri üstte, çene altta; geniş üst kesiciler altları örter; bukkalde kesicilerin yanı).

1. **"Ham kare hep dik" kuralı yanlış.** Ham ön/bukkal kare setten sete, hatta set içinde değişiyor: Altan (0653, 1691), Adem (1420),
   Bera (1883), Damla (0546-0549) baş aşağı; Damla 0544/0545 dik. Kamera ters tutuşta EXIF'e 1 yazıyor (3 değil), etiketten anlaşılmaz.
2. **"Sağ/sol = çekim sırası" kuralı yanlış.** Damla'da 0547 küçük numaralı ama sol bukkal (ham karede burun altta, kesiciler sağda;
   180° sonrası solda).

## 0.33.1'de ne değişti
- **180° kararı modelden, yüz anatomisiyle (`ids-upright`):** aynı karenin ham ve 180° döndürülmüş hali birlikte gösterilir, "hangisi dik?"
  sorulur. Burun/burun delikleri üstte, çene/boyun altta, üst dudakta filtrum gibi yüz ipuçları esas (`face_cue`), diş ipuçları
  (`teeth_cue`: geniş üst kesiciler altları örter) ikincil. Mutlak okuma (`upper_jaw_side`) baş aşağı karede 15/15 "üstte" dediği
  için kullanılmıyor.
- **Okuma düzeni:** her ön/yan yuva iki ölçekte okunur (tam ham küçük kare → yüz ipucu; orta kesit → diş ipucu); her okuma 2 bağımsız
  Sonnet çağrısı (A/B sırası ters), uyuşmazsa Opus hakem. Karenin KENDİ yüz okuması kesindir: aynı sette kareler farklı tutuşla
  çekilebiliyor (Altan 1.Ref: 1696 baş aşağı, 1697 dik; Damla: 0544 dik, 0546 baş aşağı), set oylaması kendi okumasını ezmez
  (ezdiği denemede 1697 ters döndü). Yüz okuması olmayan kare için set oylaması (yüz ipuçlu okuma 3, diş 1, ön yuva ×2); hiç okuma
  yoksa 180° (daha sık) + ⚠ uyarı ve ↻ düğmeleri.
- **Sağ/sol bukkal:** dik karede kesicilerin yanından (sağda → sağ bukkal; `incisors_side_upright`); çekim sırası kuralı kaldırıldı.
  Çift kısıtı: iki bukkal aynı yanı veriyorsa biri ters duruyordur; iki ölçeği birbiriyle çelişen (yüz ≠ diş) kare 180° çevrilir,
  ikisi de tutarlıysa dokunulmaz + uyarı.
- Panel notlarında artık yuva → dosya adı ve okumalar yazıyor (ör. "Sağ bukkal = 2Y6A0548.JPG: baş aşağı (yüz), baş aşağı (yüz); kesiciler sağda").
- 0.33.0'dan kalanlar: EXIF okuyucu, ham kare üzerinden kırpma, sanal takas, asgari kırpma alanı, sınıflandırma yüz tanımları.

## Nesnel doğrulama (Yazar Rx foto adımı; her set yüklendi → yuva görüntüleri dışa aktarılıp kesitle denetlendi → silindi)
| Set | Ham kare | Sonuç |
|---|---|---|
| Altan Doğan 1.Refinement | baş aşağı | 8/8 doğru, 63-102 sn (hakemli koşuda uzun) |
| Altan Doğan Başlangıç | baş aşağı | 8/8 doğru, 81 sn; sağ/sol doğru |
| Damla Gümüş Başlangıç (21 kare) | baş aşağı (IDS 0546-0548'i seçti) | 8/8 doğru, 78 sn; sağ/sol artık doğru (çekim sırası kuralıyla tersti) |
| Bera Arat Başlangıç (16 karelik alt küme) | baş aşağı | 8/8 doğru, 77 sn |
| Sentetik: Altan 1.Ref ağız içi kareleri 180° çevrilmiş (ham DİK) | dik | 8/8 doğru, 102 sn; yanlış 180° yok (1697'nin yanlış yüz okumasını hakem düşürdü) |

Bilinen sınırlar: Bera'nın 22 karelik 30 MP seti bu bilgisayarda (0,4-1,8 GB boş RAM) Chrome sekmesini çökertti; 16 kareyle geçti.
Oklüzalde "iki yuva aynı çene" notu yine yanlış alarm (eylem yok). Model çağrısı set başına ~14 (0.33.0'da ~8; hakemli koşuda +2 Opus).

## Yayın
Onay verilirse: `ids-extension-deneme` içeriği `ids-extension`'a kopyalanır (exif.js dahil, manifest 0.33.1), `node tools/release.js --push`.
