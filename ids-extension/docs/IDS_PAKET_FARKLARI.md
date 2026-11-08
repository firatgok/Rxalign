# IDS geleneksel reçete: paketlere göre adım ve alan farkları

Kaynak: vip.invisalign.com, test hastası "B, B" (patientId 34183073), 6 Ekim 2026. Her paket için reçete
adımları `fetch(step=N)` ile çekilip Yetişkin Comprehensive dökümüyle karşılaştırıldı. Alan kimlikleri
`rx.js` içindeki `STEPS` eşlemesinde kullanılan kimliklerle aynı biçimdedir. Vivera ve Palatal Genişletici
bilerek dışarıda bırakıldı (kullanıcı kararı).

## Ürün seçimi akışı (mauiProduct.action)

- Hasta tipi kartları: "Yetişkinim", "Ergenler", "Çocuk" (`button.cardSelectButton`).
- Ürün kartları (`button.selectButton.selectOption`): yetişkin/ergen "Invisalign şeffaf alignerlar";
  çocuk "Invisalign First şeffaf alignerlar".
- Paket kartları (`button.selectOption`, başlık `a.expand`): "Comprehensive Paket", "Moderate Paket",
  "Lite Paket", "Express Paket"; çocukta tek kart "Invisalign First - Comprehensive Package".
- **Çocukta First seçilince uygunluk uyarısı penceresi açılır**; "Tamam" (`button.next-button`) ile geçilir.
- Mevcut taslağın paketini değiştirmek için: `mauiProduct.action?patientId=..&formId=<formId>&change=true`
  doğrudan paket aşamasını açar. `formId=0&change=true` ile hasta tipi aşamasından başlanır.
- Paket seçilince reçete Flex Rx görünümünde açılır; geleneksel reçeteye geçiş tüm paketlerde aynı
  (`#switchToTraditionalHyperlinkArea a` → `#switch-flex-modal .next-button`).

## Reçete sayfası yolları

| Paket | Yol |
|---|---|
| Yetişkin / Ergen Comprehensive | `/v3/auth/rx/i20/comprehensive.action` |
| Yetişkin / Ergen Moderate | `/v3/auth/rx/i20/moderate.action` |
| Yetişkin / Ergen Lite | `/v3/auth/rx/i20/maui/lite.action` |
| Yetişkin / Ergen Express | `/v3/auth/rx/i20/maui/express.action` |
| Çocuk Invisalign First | `/v3/auth/rx/i20/firstComprehensive.action` |

Ergen ve yetişkin aynı yolu kullanır; ergen sayfalarında boşluk/çapraşıklık adımına ergen bloğu eklenir.

## Adım sıraları

Comprehensive (yetişkin/ergen) ve First: 1 ark, 2 sınırlama+ataşman, 3 A-P, 4 overjet, 5 overbite,
6 bite ramp, 7 orta hat+çapraz, 8 boşluk+çapraşıklık, 9 çekim, 10 özel talimat (+ergen bloğu), 11 Tara,
12 Fotoğraflar, 13 Radyograf, 14 Klinik Etkinlik, 15 İndirim, 16 Özet, 17 bitti.

Moderate: Comprehensive ile aynı sıra (17 adım).

Lite: 1 ark, 2 sınırlama+ataşman, 3 A-P, **4 overjet+overbite (birleşik)**, 5 bite ramp, **6 orta hat
(çapraz kapanış yok)**, 7 boşluk+çapraşıklık, 8 çekim, 9 özel talimat (+ergen bloğu), 10 Tara,
11 Fotoğraflar, 12 Radyograf, 13 Klinik Etkinlik, 14 İndirim, 15 Özet, 16 bitti.

Express: 1 ark, 2 sınırlama+ataşman, **3 overjet+overbite (A-P adımı yok)**, 4 bite ramp, 5 orta hat
(çapraz yok), 6 boşluk+çapraşıklık, **(çekim adımı yok)**, 7 özel talimat (+ergen bloğu), 8 Tara,
9 Fotoğraflar, 10 Radyograf, 11 Klinik Etkinlik, 12 İndirim, 13 Özet, 14 bitti.

Adımlar `rx.js`'deki gibi sayfadaki alan kimlikleriyle (probe) tanınmalı; numaralar pakete göre kayar.

## Alan farkları (Comprehensive'e göre)

### A-P ilişkisi (adım 3)

| Paket | Sağ/sol satır kimlikleri (`aPRelation.<...>Right/Left`) | Düzeltme seçenekleri |
|---|---|---|
| Comprehensive | maintain, improveToClass1CanineOnly, improveCanineAndMolar, class1CanineAndMolar | Diş hareketi (posteriorIPR, Sınıf II/III + precision, distalizasyon + precision), MA (tüm alt seçenekler), ortognatik |
| Moderate | maintain, improveToClass1CanineOnly, **partialClass1CanineOnly** | Diş hareketi (posteriorIPR, Sınıf II/III, distalizasyon), ortognatik; **MA yok** |
| Lite | maintain, improveToClass1CanineOnly, **improveCanineAndMolarUpTo2Mm** | Diş hareketi (posteriorIPR, Sınıf II/III); **distalizasyon, MA, ortognatik yok** |
| Express | **A-P adımı yok** | |
| First | maintain, **improveToClass1MolarOnly**, improveCanineAndMolar, class1CanineAndMolar | Comprehensive ile aynı |

Form sitesindeki karşılıklar: `ap_sag/ap_sol` değerleri `mevcut`, `kanin`, `kopekdisi_azidisi`, `sinif_1`;
Moderate'te `kopekdisi_azidisi` → partialClass1CanineOnly ("kısmi 3 mm"); Lite'ta → improveCanineAndMolarUpTo2Mm.

### Overbite

- Comprehensive, Moderate, First: ayrı adım; `overbite.maintainResultant`, `overbite.maintainInitial`,
  `archLevelOverBite.correctOpenBite` (+upper/lower/other alt kutuları), `archLevelOverBite.correctDeepBite` (+alt kutular).
- Lite, Express: overjet ile aynı adımda; `overbite.maintainResultant`, `overbite.maintainInitial`,
  **`overbite.improveOpenBite`**, **`overbite.improveDeepBite`** + `overbite.improveDeepBiteUpper` /
  `overbite.improveDeepBiteLower` kutuları. Açık kapanış alt seçenekleri yok.

### Diğer

- Posterior çapraz kapanış (`posteriorCrossbite.*`): Lite ve Express'te **yok**.
- Diş çekimi: Express'te **yok**. Lite'ta yalnızca **kesici dişler** (1.2–2.2, 3.2–4.2) seçilebilir, öbür
  kutular pasiftir; "Bu dişleri çek" seçilip hiç diş işaretlenmezse IDS adımı kabul etmez.
- Tek çene tedavisinde (`treatArches.upperOnly` / `lowerOnly`) öbür çeneye ait tüm kutular pasiftir:
  diş ızgaraları, çapraşıklık satırları, derin/açık kapanış alt-üst kutuları, orta hat alt-üst. Eklenti bu
  işlemleri uygulamaz; bilinçli seçimleri (diş, kapanış) notla bildirir.
- Bite ramp: First'te `biteRampsUpper_autoPrecisionBiteRamps` (otomatik) **yok**.
- Ark seçimi: First'te "karşıt arkta pasif alignerlar" (`...passiveAlignersOppositeArch`) **yok**.
- Tara adımında `cbct-rx` kutusu **yalnızca Comprehensive'de** var (Moderate, Lite, Express, First'te yok).
  Kutu işaretlenince `.cbct-body-container` açılır: "Yeni CBCT taraması yükleyin" bağlantısı
  (`https://auto.smarthub.invisalign.com/bertha/latest/index.html?pid=<pid>&locale=tr_TR`, yeni sekme; pid IDS
  patientId'den farklı bir iç kimlik), `button.cbct-refresh-button` ("Yenile", formu gönderip sayfayı yeniler) ve boş
  liste metni "Bu hasta için hiçbir tarama yüklenmedi". Sihirbazın Tara adımında aynı yapı `#cbct` ile.
- CBCT portalı ("bertha", v2.3.8): ayrı Align oturumu ister (myaccount-us.aligntech.com). Tek sayfa: "Adım 1 / 2:
  Dosyaları ekleyin" bırakma alanı `.dropzone`, gizli `input[type=file]` (accept .dcm,.zip,.rar,.7z, multiple,
  webkitdirectory). Dosyalar programla girişe verilip `change` olayı gönderilince portal tarayıcıda denetler; geçersizde
  "CBCT taraması kullanılabilir değil … geçerli veri bulunamadı", küçükte "Dosya boyutu çok küçük". 2. adımın
  düğme metinleri henüz görülmedi (cbct.js sezgisel arar: yükle/upload/devam/ileri).
- Hasta klasöründe CBCT: CD kopyası olarak derin bir alt klasörde durur, örn.
  `Ezgi Çetin Gök/Fırat Gök CBCT 06092026/260906074923678 …/Dicom/DICOM_invisalign_coverted/Slice_0000.dcm`
  (400 dosya × ~820 KB ≈ 330 MB). folder.js `dicom()` 6 düzeye kadar en çok .dcm içeren klasörü alır.
- Ataşman ızgarasındaki "Tümünü seç" (`selectAll`) First'te yok.

### Ergen bloğu (ergen paketlerinde özel talimat adımına eklenir; First'te de var)

- Erüpsiyon kompansasyonu: `SpacesForCanineAnd2ndBi.none` / `SpacesForCanineAnd2ndBi.tooth` radyoları,
  dişler `spacesForCanineAnd2NdBi_<i>` kutuları.
- Terminal azıdişi tablası: `teenSecondMolarTabs.none` / `teenSecondMolarTabsYes` radyoları, dişler
  `teenSecondMolarTabs_<i>` **radyoları** (kutu değil), başlangıç aşaması `teenSecondMolarTabs.startStage` (metin).
- Form sitesindeki karşılıklar: `erupsiyon_kompansasyonu_<ek>` (hicbiri / ...), `terminal_azidisi_<ek>`;
  diş alanları için script.js'teki `erupsiyon_*` / `terminal_*` alanlarına bakılmalı (henüz eşlenmedi).

## Diş ızgarası dizinleri

Kalıcı dişler (sınırlama, ataşman, çekim): dizin = Universal − 1. FDI 1.8→0 … 1.1→7, 2.1→8 … 2.8→15,
3.8→16 … 3.1→23, 4.1→24 … 4.8→31 (`rx.js` `toothIndex`).

Süt dişleri (yalnızca First; `..._tooth_primary_<i>`):

| Dizin | Diş | Dizin | Diş | Dizin | Diş | Dizin | Diş |
|---|---|---|---|---|---|---|---|
| 32 | 5.5 | 37 | 6.1 | 42 | 7.1 | 47 | 8.1 |
| 33 | 5.4 | 38 | 6.2 | 43 | 7.2 | 48 | 8.2 |
| 34 | 5.3 | 39 | 6.3 | 44 | 7.3 | 49 | 8.3 |
| 35 | 5.2 | 40 | 6.4 | 45 | 7.4 | 50 | 8.4 |
| 36 | 5.1 | 41 | 6.5 | 46 | 7.5 | 51 | 8.5 |

(Üst sağ 5.5→5.1 için doğrudan okundu; diğer çeyrekler kalıcı dişlerdeki düzenle aynı yöne göre türetildi,
ilk kullanımda sayfada doğrulanmalı.)

Erüpsiyon kompansasyonu ızgarası (`spacesForCanineAnd2NdBi_<i>`), sütunlar sayfadaki sırayla:

- Üst sağ: 0→1.5, 1→1.4, 2→1.3, (First'te ayrıca 3→1.2, 4→1.1)
- Üst sol: (First'te 12→2.1, 13→2.2) 14→2.3, 15→2.4, 16→2.5
- Alt sağ: 31→4.5, 30→4.4, 29→4.3, (First'te 28→4.2, 27→4.1)
- Alt sol: (First'te 21→3.1, 20→3.2) 19→3.3, 18→3.4, 17→3.5

Terminal azıdişi tablası (`teenSecondMolarTabs_<i>`): 0→1.8, 1→1.7, 2→1.6; 13→2.6, 14→2.7, 15→2.8;
31→4.8, 30→4.7, 29→4.6; 18→3.6, 17→3.7, 16→3.8.

## Uygulama notları

- `rx.js`'de her paket için ayrı `STEPS` listesi yerine ortak adım tanımları + paket bazlı farklar
  (A-P satır haritası, overbite varyantı, hangi adımların olmadığı) daha az tekrar üretir.
- Paket, reçete sayfasının yolundan (`location.pathname`) ve kayıttaki `hasta_tipi` + `tedavi_secenegi*`
  alanlarından belirlenir; form alan son eki `PACKAGE_SUFFIX` ile aynı.
- Refinement reçetesi henüz dökülmedi.

## Refinement (Ek Hizalayıcılar) reçetesi

Kaynak: gerçek hastanın açık taslağı, yalnızca okundu (6 Ekim 2026). Yol:
`/v3/auth/rx/secondary/additionalAligners.action?formId=..&formType=ADDITIONAL_ALIGNERS_INT_2_0&patientId=..&step=N`.
Breadcrumb: 1-9 / Tara / Fotoğraflar / Klinik Etkinlik / Özet / Sevk. Radyograf ve İndirim adımı yok.
Alan adları `xmlFormObj.prescriptionQuestions.secondaryProduct.*` altındadır.

| Adım | İçerik | Kimlikler |
|---|---|---|
| 1 | Başvuru nedeni + mevcut aşama | `reasonForSubmission.needsFinishingImprovements` / `.teethAreNotTracking` / `.treatmentPlanChange` / `.patientHasNewRestorationOrDentalWork` / `.patientWasNotCompliant` / `.other` (+ `reasonForSubmission.other.description` textarea); `currentStageUpper`, `currentStageLower` (metin). İleri: `button.nextButton` |
| 2 | Tedavi edilecek ark, yeni PVS, tedavi planı talimatı | `treatedArch.both.both` / `treatedArch.upper.upper` (+ `treatedArch.upper.nothingOnOppositeArch`, `treatedArch.upper.passiveAlignersOppositeArch`) / `treatedArch.lower.lower` (+ `treatedArch.lower.*`); `sendingNewPVSUpper.yes/no`, `sendingNewPVSLower.yes/no`; `treatmentPlanInstructions.finishingForTheCurrentToothPosition` / `.sameFinalToothPositionAsTheOriginalClinCheckTreatmentPlan` / `.Other`. İleri: `#form_0` |
| 3 | Diş hareketi sınırlamaları | `doNotMoveTeeth_none` / `doNotMoveTeeth_theseTeeth` + `doNotMoveTeeth_theseTeeth_tooth_<i>` (32) |
| 4 | A-P ilişkisi | Satırlar: maintain, improveToClass1CanineOnly, **partialClass1CanineOnly**, class1CanineAndMolar (Right/Left). Seçenekler Comprehensive ile aynı (diş hareketi + posteriorIPR + Sınıf II/III + distalizasyon, MA tüm alt seçenekler, ortognatik) |
| 5 | Ataşmanlar + mevcut ataşmanlar | `teethPermittedForAttachments_anyTeeth` / `_doNotPutTheseTeeth` + `..._tooth_<i>`; `existingAttachments_virtuallyRemoveExistingAttachments` / `_virtuallyRemoveSelectedAttachments` (+ `existingAttachments_virtuallyRemoveSelectedAttachments_tooth_<i>`, 32) / `_virtuallyRemoveOptimizedAttachments` / `_keepAllAttachments` |
| 6 | IPR, geçmiş IPR, hassas kesimler | `ipr.performIPRAsNeeded` / `ipr.performIPROnSelectedContacts` (+ `contacts_space_<i>`, 60 kutu) / `ipr.doNotPerformAnyIPR` / `ipr.doNotPerformIPROnSpecificContacts`; `historicalipr.IPRPerformedAsPrescribed` / `.noIPRWasPerformed` / `.performedIPRAsSpecified` (+ `..._IPRDoneArray_<i>__amount` metinleri, diş arası dizinleri boşluk ızgarasıyla aynı: 0-14 üst, 16-30 alt); `precisionCutsQuestion.none` / `.samePlacementAsPreviousTreatmentPlan` / `.placePrecisionCutsAsNeeded` / `.placePrecisionCutsAsSpecified` |
| 7 | Rezidüel boşluklar + tedavi talimatları | `residualSpaces.none` / `residualSpaces.residualSpaces` (+ `..._residualToothSpaceArray_<i>__amount`); `upper.instruction`, `lower.instruction` (textarea) |
| 8, 9 | Yetişkinde boş; IDS 7'den doğrudan 10'a (Tara) geçer. **Ergende** düzen farklı: 7 = rezidüel boşluklar + erüpsiyon kompansasyonu (`SpacesForCanineAnd2ndBi.*`) + terminal azıdişi (**`teenSecondMolarTabsNo`** / `teenSecondMolarTabsYes`, Comprehensive'deki `teenSecondMolarTabs.none` yerine), 8 = yalnızca `upper.instruction` / `lower.instruction`, 9 boş (atlanır). rx.js her parçayı sayfada varsa doldurur | - |
| 10 | Tara | Reçetedeki Tara ile aynı kimlikler (`dentalRecords.*`, `cbct-rx`, `#next`) |
| 11 | Fotoğraflar | `#upload-photos`, `#uploadButton` |
| 12 | Klinik Etkinlik | `#form_0` |
| 13 | Özet | `#rxformsubmit` (Gönder) |
| 14 | Bitti | `trackingNumberId` |

Başlangıç: hasta dosyasında "Ek Hizalayıcılar" bağlantısı
(`checkArchivedPatient('auth/rx/dispatch.action?patientId=..&formType=ADDITIONAL_ALIGNERS_INT_2_0')`) doğrudan
`additionalAligners.action?patientId=..&formId=-1&formType=...&step=1` sayfasını açar (ürün seçimi yok, Flex yok).
1. adımın "İleri"si kimliksiz `input.next-button` (onclick `checkProgressFormType(this)`); gönderilince gerçek
`formId` atanır. 1. adımda "2. Hasta şu anda hangi hizalayıcıyı kullanıyor" (`currentStageUpper/Lower`) zorunludur.
Aynı yolda `formType=BATCH_ALIGNER_INT_2_0` ("No, add a new scan") toplu hizalayıcı formudur; doldurulmaz.

Form sitesi eşlemesi (`rx.js` `refinementSteps`): çoğu alan `_refinement` sonekli; `basvuru_nedeni`,
`basvuru_nedeni_diger`, `ust/alt_hizalayici_numara`, `tedavi_edilecek_ark`, `ust/alt_karsit_ark`, `ust/alt_ark_olcu`,
`tedavi_plani_duzenleme`, `dis_hareketi_sinirlamasi`, `dis_sinir` **soneksiz**. Diş listeleri (`dis_sinir`,
`atasmanlar_dis`, `mevcut_atasmanlar_dis`, `ipr_dis`) FDI değer dizisidir. `hasta_adi_refinement` Tara adımındaki
arama metnidir (ad ya da iTero kodu), `olcu_tipi_refinement` tarama türü. `cbct_tara_refinement` (12 Ekim 2026, form sitesine eklendi) CBCT isteğidir; IDS refinement Tara
adımında `cbct-rx` ile aynı akış. A-P düzeltme seçeneği tek radyo
(`ap_duzeltme_secenegi`: dis_hareketi / mandibular_ilerletme / ortognatik_cerrahi). Elle kalanlar (eklenti durur):
"Bu belirtilen temaslarda IPR yapma" temasları (formda diş, IDS'te temas), "belirlenen şekilde gerçekleştirilen IPR"
miktarları, "şurada belirtildiği gibi hassas kesimler", rezidüel boşluk miktarları.
