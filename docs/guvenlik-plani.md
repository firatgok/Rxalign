# Rxalign güvenlik planı: giriş, Firestore kuralları, çok kiracılı yapı, özel depo

Hazırlandı: 8 Kasım 2026 (dal `claude/jovial-ritchie-d19cb5`). Yayınlanmadı; her aşama kullanıcı onayıyla.

## 0. Bulgu (8 Kasım 2026)

- Firebase projesi `invisalign-forms`, koleksiyon `invisalign_forms` (100+ gerçek hasta kaydı) kimlik doğrulaması olmadan,
  yalnız herkese açık web API anahtarıyla (kökteki `firebase-config.js`) REST üzerinden okunabiliyor. Yazma denenmedi
  (olasılıkla o da açık).
- Sebep: IDS Yardımcısı eklentisi (`ids-extension/src/background.js`, `firestoreGet`) kayıtlı formları `?key=...` ile
  kimliksiz okuyor; bunun çalışması için konsoldaki kurallar herkese okuma veriyor.
- Hekim PIN'i (`js/app.js`, `1234`) yalnızca arayüz rolü seçer; veriyi korumaz. Olduğu gibi kalıyor (rol seçimi), güvenlik
  Firebase Authentication'a taşınıyor.
- Depoda kural dosyası yoktu; artık `firestore.rules` (+ `firebase.json`, `.firebaserc`) depoda.

## 1. Bu dalda yapılanlar

| Parça | Dosya | Ne yapar |
|---|---|---|
| Site girişi | `js/auth.js` | Firebase Auth (e-posta/şifre). Oturum yoksa sayfanın üstüne giriş penceresi; girişten sonra sayfa yenilenir. "Şifremi unuttum" sıfırlama e-postası gönderir. `window.RxAuth` (`ready`, `user`, `signOut`). |
| Sayfalar | `index/form/list/settings.html`, `eski/form/list/settings.html` | `firebase-auth-compat.js` ve `js/auth.js` eklendi (yükleme sırası: app, auth, firestore, firebase-config, auth.js). |
| Hesap bölümü | `settings.html`, `css/app.css` | "Hesap": açık hesabın e-postası ve **Oturumu kapat**. |
| Kurallar | `firestore.rules` | Yalnız giriş yapmış **ve** `rxalign_users/{uid}` belgesi olan hesaplar `invisalign_forms` ve `rxalign_settings` okur/yazar. Diğer her şey kapalı. |
| Eklenti | `ids-extension/` ve `ids-extension-deneme/` (aynı yama) | Ayarlar sayfasında **Rxalign hesabı**: e-posta/şifreyle giriş (Identity Toolkit REST), yenileme anahtarı `chrome.storage.local.rxAuth`'ta, şifre saklanmaz. `firestoreGet` ID token varsa `Authorization: Bearer` ekler; 401'de bir kez yeniler; 403'te anlaşılır hata ("ayarlardan giriş yapın" / "hesap klinik listesinde değil"). **Bağlantıyı sına** düğmesi tek belge okuyup token'lı okunup okunmadığını söyler. Giriş yoksa eski gibi kimliksiz dener (geçiş döneminde çalışır). |
| Sürümler | `manifest.json` | Yayın kopyası 0.33.6 → **0.34.0**; deneme kopyası 0.33.7 → **0.34.1** (deneme her zaman yayından büyük kalsın ki güncelleyici deneme kurulumunun üstüne yayın indirmesin). Yeni host izinleri: `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`. |

Neden e-posta/şifre, Google değil: eklentinin arka plan servisi tarayıcı penceresi açmadan, Google hesabı gerektirmeden
giriş yapabilmeli (REST ile e-posta/şifre bunu sağlar); asistan bilgisayarlarında ortak klinik hesabı yeterli. Google
girişi siteye sonradan eklenebilir, ama eklenti için her klinikte en az bir e-posta/şifre hesabı gerekir.

Neden yalnız "giriş yapmış" değil, üyelik belgesi de: e-posta/şifre sağlayıcısı açıkken herkese açık API anahtarıyla
herkes `signUp` çağırıp kendine hesap açabilir. `rxalign_users/{uid}` belgesi olmayan hesap hiçbir şey okuyamaz. Ek
olarak konsolda kendi kendine kayıt kapatılır (aşağıda).

## 2. Sıralama (kritik)

Sahadaki 0.33.6 eklentiler kimliksiz okur. Kurallar kapanırsa Form Doldurucu'da "Kayıtlar okunamadı: Firestore 403" olur.
Bu yüzden:

1. Konsolda Authentication açılır, hesaplar ve `rxalign_users` belgeleri oluşturulur (kurallar hâlâ açık; hiçbir şey bozulmaz).
2. Site yayınlanır (main'e merge → GitHub Pages). Giriş penceresi çıkar; giriş yapılır. Veri okuma/yazma eskisi gibi çalışır.
3. Eklenti **0.34.0** yayınlanır (`node tools/release.js --push --notes "..."`). Her bilgisayarda eklenti güncellenir
   (5 dakikada bir denetler; kendiliğinden kurulum açıksa kurulur), ayarlar sayfasından **Rxalign hesabı** ile giriş yapılır,
   **Bağlantıyı sına** "giriş yapılmış hesapla okunuyor" der.
4. Tüm bilgisayarlar 0.34.0'da ve girişli olunca **kurallar yayınlanır** (`firestore.rules`).
5. Doğrulama: siteden çıkış yapıp arşive bakınca giriş penceresi; eklentide çıkış yapıp "Bağlantıyı sına" → "giriş istiyor";
   dışarıdan kimliksiz REST isteği 403.

Geri dönüş: Firestore > Rules sekmesinde sürüm geçmişi var; önceki kurala tek tıkla dönülür. Site ve eklenti girişli
kalmaya devam eder (zararsız).

## 3. Konsol adımları (kullanıcı kendi hesabıyla)

Firebase konsolu: <https://console.firebase.google.com/project/invisalign-forms>

### 3a. Authentication'ı aç

1. Sol menü **Build > Authentication** > **Get started**.
2. **Sign-in method** sekmesi > **Email/Password** > **Enable** (yalnız üstteki anahtar; "Email link (passwordless)" kapalı kalsın) > **Save**.
3. **Settings** sekmesi > **User actions**: **Enable create (sign-up)** işaretini KALDIR (kendi kendine kayıt kapanır) > Save.
   Aynı yerde **Email enumeration protection** açık kalabilir (hata iletileri "e-posta ya da şifre hatalı" olur; `js/auth.js` bunu karşılar).
4. **Settings > Authorized domains**: `rxalign.fgoapps.com` listede yoksa **Add domain** ile ekle (`localhost` ve
   `invisalign-forms.firebaseapp.com` hazır gelir). Netlify adresi de kullanılıyorsa o da eklenir.
5. **Templates** sekmesi (isteğe bağlı): şifre sıfırlama e-postasının gönderen adı "Rxalign" yapılabilir.

### 3b. Hesapları aç

1. **Users** sekmesi > **Add user**: e-posta + geçici şifre. Önerilen: hekim hesabı (kendi e-postan) ve bir klinik/asistan
   hesabı (ör. `klinik@...`). Her hesabın **User UID** sütununu kopyala.
2. İlk girişte şifre değiştirmek için sitedeki "Şifremi unuttum" kullanılabilir (sıfırlama e-postası gelir).

### 3c. Üyelik belgeleri (`rxalign_users`)

1. **Build > Firestore Database > Data** > **Start collection** (zaten koleksiyon varsa **+ Start collection** üst düzeyde):
   Collection ID `rxalign_users`.
2. Her hesap için bir belge: **Document ID = o hesabın User UID'si** (otomatik kimlik DEĞİL). Alanlar:
   - `email` (string): hesabın e-postası
   - `clinicId` (string): `fgo` (şimdilik tek klinik; çok kiracılı aşamada kullanılacak)
   - `role` (string): `owner` (hekim) ya da `staff` (asistan)
   - `createdAt` (timestamp): şimdi
3. Belge yoksa o hesap kurallar kapandıktan sonra hiçbir şey okuyamaz; "erişim izni yok" hatası bunu gösterir.

### 3d. Siteyi yayınla ve dene

1. Bu dal main'e merge edilir, push; GitHub Pages birkaç dakikada yayınlar.
2. `rxalign.fgoapps.com` açılır → "Rxalign girişi" penceresi; hesapla girilir; sayfa yenilenir; ana sayfadaki PIN akışı
   eskisi gibi. Ayarlar > Hesap'ta e-posta görünür.
3. Tarayıcının başka bir profilinde ya da gizli pencerede `list.html` → giriş istemeli.

### 3e. Eklentiyi yayınla (0.34.0)

```bash
node tools/release.js --push --notes "0.34.0: Rxalign hesabıyla giriş (ayarlar sayfası); kayıtlı formlar giriş yapılmış hesapla okunur. Bulut kuralları kapatılmadan önce her bilgisayarda giriş yapılmalı."
```

Sonra her bilgisayarda: eklenti simgesi > Ayarlar > **Rxalign hesabı** > e-posta/şifre > **Giriş yap** > **Bağlantıyı sına**.
Not: paketlenmemiş (unpacked) eklentide yeni host izinleri yeniden yüklemede kendiliğinden verilir; Chrome eklentiyi
kapatırsa `chrome://extensions` sayfasında yeniden etkinleştirmek yeter.

### 3f. Kuralları yayınla

1. **Firestore Database > Rules**. Önce mevcut kuralların metnini kopyalayıp bir yere kaydet (geri dönüş için; sürüm geçmişi de var).
2. `firestore.rules` dosyasının tamamını yapıştır > **Publish**. Birkaç saniyede geçerli.
3. **Rules Playground** ile dene: `get /databases/(default)/documents/invisalign_forms/<bir belge kimliği>`,
   Authenticated kapalı → Denied; Authenticated açık + Firebase UID = üye UID → Allowed.
4. Dışarıdan denetim (kendi bilgisayarından; anahtar `firebase-config.js` içindeki `apiKey`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://firestore.googleapis.com/v1/projects/invisalign-forms/databases/(default)/documents/invisalign_forms?pageSize=1&key=<WEB_API_KEY>"
```

   Beklenen `403`. (Bugün `200` dönüyor; bulgu buydu.)

Alternatif: `npm i -g firebase-tools`, `firebase login`, depo kökünde `firebase deploy --only firestore:rules`
(`firebase.json` ve `.firebaserc` hazır). Konsoldan yapıştırmak da aynı sonucu verir.

## 4. Çok kiracılı yapı planı (satış için)

Amaç: her klinik yalnız kendi kayıtlarını görür; lisans bitince yazma (ya da erişim) durur.

### Veri modeli

- `rxalign_clinics/{clinicId}`: `name`, `license: { status: "active"|"suspended", validUntil: timestamp, seats: number }`, `createdAt`.
- `rxalign_users/{uid}`: mevcut alanlar + `clinicId` (zaten ekleniyor). İsteğe bağlı: `disabled: true`.
- `invisalign_forms/{formId}`: yeni alan `clinicId`. Mevcut kayıtlara `fgo` yazılır (göç).
- `rxalign_settings`: belge kimlikleri klinik başına ayrılır: `form_defaults` → `form_defaults_<clinicId>`, `ui` → `ui_<clinicId>`
  ya da alt koleksiyon `rxalign_clinics/{clinicId}/settings/{doc}` (daha temiz; `defaults.js` ve `app.js`'teki `uiRef`/`defaultsRef` değişir).

### Kurallar (ikinci sürüm, taslak)

```
function me() { return get(/databases/$(database)/documents/rxalign_users/$(request.auth.uid)).data; }
function clinic(id) { return get(/databases/$(database)/documents/rxalign_clinics/$(id)).data; }
function licensed(id) { return clinic(id).license.status == "active" && clinic(id).license.validUntil > request.time; }
function sameClinic(res) { return signedIn() && res.data.clinicId == me().clinicId; }

match /invisalign_forms/{formId} {
  allow read: if sameClinic(resource);
  allow create: if signedIn() && request.resource.data.clinicId == me().clinicId && licensed(me().clinicId);
  allow update: if sameClinic(resource) && request.resource.data.clinicId == resource.data.clinicId && licensed(me().clinicId);
  allow delete: if sameClinic(resource) && me().role == "owner";
}
```

Önemli: Firestore'da liste sorguları kurala uymak zorunda. Site şu an `collection('invisalign_forms').orderBy('createdAt')`
çekiyor; çok kiracılıda **`where('clinicId','==', myClinic)`** şart, yoksa sorgu reddedilir. Eklentideki REST liste de düz
`documents` listesi yerine `:runQuery` (structuredQuery + where clinicId) olur. Bileşik dizin gerekir: `clinicId ASC, createdAt DESC`
(ilk sorguda konsol bağlantı verir).

Kullanıcı belgesi okuması (`get`) her istekte ek okuma; büyüyünce **custom claims** (`clinicId`, `role` token içinde) daha ucuz:
bir Cloud Function (ya da yerel Admin SDK betiği) hesap açılırken claim yazar, kural `request.auth.token.clinicId` okur.
İlk sürümde belge yeterli.

### Lisans / kullanım kısıtı

- `license.validUntil` geçince `create/update` reddedilir, okuma sürer (klinik verisini görmeye devam eder, yeni form yazamaz).
  Site ve eklenti bunu anlaşılır iletiyle gösterir ("lisans süresi doldu").
- Koltuk sınırı: `rxalign_users` içinde o kliniğin kullanıcı sayısı; hesap açma yalnız yönetici tarafından (konsol ya da
  Admin SDK aracı) yapıldığından kuralda değil araçta denetlenir.
- Kullanım ölçümü isteniyorsa aylık form sayısı `rxalign_clinics/{id}/usage/{YYYY-MM}` sayaç belgesinde (Cloud Function
  tetikleyicisi ya da istemci artırımı + kural).

### Göç adımları

1. Kurallar (aşama 3f) yayınlanmış olsun.
2. `rxalign_clinics/fgo` belgesi + mevcut `rxalign_users` belgelerine `clinicId: "fgo"`.
3. Tek seferlik betik (Admin SDK, hizmet hesabı anahtarıyla yerelde; anahtar depoya girmez): tüm `invisalign_forms`
   belgelerine `clinicId: "fgo"` yazar. Gerçek veriye yazma olduğundan önce dışa aktarım (Firestore export ya da betiğin
   JSON yedeği), sonra kullanıcı onayıyla.
4. Site: form kaydında `clinicId` eklenir (`script.js` kaydet/güncelle), liste sorgularına `where`; `defaults.js`/`app.js`
   ayar belgeleri klinik başına.
5. Eklenti: `runQuery` ile liste; `clinicId` token'daki ya da kullanıcı belgesindeki değer.
6. Kurallar ikinci sürüme geçer.
7. Yönetim aracı: yeni klinik + ilk hesap + lisans açan küçük Node betiği (Admin SDK) ya da sitede yalnız `role == "owner"`
   ve ayrı bir `superadmin` claim'e açık yönetim sayfası.

## 5. Depoyu özele alma planı

Bugün: `firatgok/Rxalign` herkese açık; GitHub Pages köktekini yayınlıyor; eklenti güncellemeleri
`https://raw.githubusercontent.com/firatgok/Rxalign/main/ids-extension-release/latest.json` ve zip'ten geliyor
(`tools/release.js` içindeki `SITE` sabiti; eklentide `src/background.js` içindeki `UPDATE_URL`).

Kısıtlar:
- Özel depoda `raw.githubusercontent.com` adresleri kimlik ister → sahadaki eklentiler güncellemeyi bulamaz.
- GitHub Pages özel depodan yayın için ücretli plan ister (Pro/Team). Netlify özel depodan ücretsiz yayınlar, ama `publish = "."`
  ile tüm depo (eklenti kaynağı dahil) herkese açık dosya olarak sunulur; yayın klasörü daraltılmalı.
- Eklenti zip'i zaten herkese açık olmak zorunda (Web Store dışı dağıtım); içindeki istemler/kod indirilebilir kalır.
  Özel depo siteyi, geçmişi ve geliştirme notlarını korur; eklenti kodunu değil.

Önerilen yol (en az hareketli parça): **ayrı açık yayın deposu**.

1. GitHub'da `firatgok/rxalign-release` (public) açılır; içinde yalnız `ids-extension-release/` (zip + `latest.json`) olur.
2. `tools/release.js`: `SITE = 'https://raw.githubusercontent.com/firatgok/rxalign-release/main/ids-extension-release/'`;
   `--push` bölümü zip + latest.json'ı bu depoya (yerel klon ya da ikinci remote) commit+push eder; kaynak commit'i ana depoda kalır.
3. Eklenti `UPDATE_URL` yeni adrese çevrilir ve bu sürüm (ör. 0.34.x) **eski adresten** yayınlanır: eski eklentiler onu
   eski adresten alır, ondan sonrakiler yeni adresten. Yeni `latest.json` iki yerde de en az bir sürüm boyunca tutulur.
4. Sahadaki tüm bilgisayarlar yeni adresli sürüme geçince ana depo **Private** yapılır (Settings > General > Danger Zone > Change visibility).
5. Site yayını: GitHub Pages özel depoda çalışmayacaksa Netlify'a (`netlify.toml` hazır; `publish` yalnız site dosyalarını
   içeren bir klasöre ya da `[build].ignore`/`_redirects` ile `ids-extension*` dışlanarak) ya da GitHub Pro'ya geçilir.
   DNS: `rxalign.fgoapps.com` CNAME'i Netlify'a döner (bugün `firatgok.github.io`).
6. `README.md` içindeki eski Firebase kurulum notları (herkese açık kurallar önerisi) güncellenir.

Alternatif: yayın dosyalarını doğrudan siteden sunmak (`https://rxalign.fgoapps.com/ids-extension-release/latest.json`);
tek alan adı, ama 5. maddedeki barındırma değişikliğine bağlı ve yayın klasörünün sitede açık kalması gerekir.

## 6. Yapılmayanlar / dikkat

- Gerçek veriye dokunulmadı; yazma kuralı denenmedi.
- `ids-extension-key.pem` ve `.pub.b64` dokunulmadı (gitignore'da).
- Google ile giriş eklenmedi (gerekirse `js/auth.js`'e `GoogleAuthProvider` düğmesi; eklenti e-posta/şifre ile kalır).
- PIN (`1234`) arayüz rolü olarak duruyor; satışta kliniğe özel PIN ayarı (`rxalign_settings`) ya da rolün hesaptan gelmesi
  (`role`) düşünülmeli.
- `eski/index.html` Firebase kullanmıyor; giriş eklenmedi.
