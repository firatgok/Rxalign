# Rxalign

Rxalign: web tabanlı Invisalign tedavi formu uygulaması. Doktorların hızlıca tedavi detaylarını girmesini, kaydetmesini ve PDF çıktısı almasını sağlar.

## 🚀 Özellikler

- ✅ **Tam Kapsamlı Form**: 12 bölümlük detaylı Comprehensive Package formu
- ✅ **Firebase Entegrasyonu**: Formları veritabanına kaydetme ve listeleme
- ✅ **Arama & Filtreleme**: Hasta adına göre hızlı arama
- ✅ **Form Yönetimi**: Kayıtlı formları görüntüleme, düzenleme ve silme
- ✅ **Dinamik Seçimler**: Hasta tipi, ürün ve tedavi seçeneklerine göre otomatik form görünürlüğü
- ✅ **Akıllı Kontroller**: A-P ilişkisi, mandibular ilerletme, overbite/overjet otomatik kontrolleri
- ✅ **PDF Oluşturma**: HTML2Canvas ile screenshot + kopyalanabilir özel talimatlar
- ✅ **Auto-resize Textarea**: Özel talimatlar alanı içeriğe göre otomatik büyür
- ✅ **Kopyala Butonu**: Özel talimatları tek tıkla panoya kopyalama
- ✅ **Responsive Tasarım**: Farklı ekran boyutlarına uyumlu

## 📋 Teknolojiler

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Database**: Firebase Firestore
- **PDF Generation**: jsPDF v2.5.1, html2canvas v1.4.1
- **Deployment**: GitHub Pages / Netlify
- **Version Control**: Git

## 🔥 Firebase Kurulumu

### 1. Firebase Projesi Oluşturun

1. [Firebase Console](https://console.firebase.google.com/) adresine gidin
2. "Add project" butonuna tıklayın
3. Proje adı girin (örn: "invisalign-forms")
4. Google Analytics'i etkinleştirin (opsiyonel)
5. "Create project" butonuna tıklayın

### 2. Firestore Veritabanı Oluşturun

1. Sol menüden "Firestore Database" seçin
2. "Create database" butonuna tıklayın
3. **Production mode** seçin (güvenlik kuralları ile)
4. Bölge seçin (örn: europe-west1)
5. "Enable" butonuna tıklayın

### 3. Güvenlik Kurallarını Ayarlayın

"Rules" sekmesine gidin ve aşağıdaki kuralları ekleyin:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /invisalign_forms/{document=**} {
      allow read, write: if true; // Geliştirme için - Production'da authentication ekleyin!
    }
  }
}
```

**⚠️ ÖNEMLİ**: Production ortamında mutlaka authentication ekleyin!

### 4. Web App Ekleyin

1. Project Overview sayfasında "Web" ikonuna (</>)tıklayın
2. App nickname girin (örn: "invisalign-web")
3. "Register app" butonuna tıklayın
4. Yapılandırma kodunu kopyalayın

### 5. Firebase Config'i Güncelleyin

`firebase-config.js` dosyasını açın ve Firebase Console'dan aldığınız bilgileri yapıştırın:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:xxxxxxxxxxxxx"
};
```

### 6. Test Edin

1. `index.html` dosyasını bir web sunucusuyla açın
2. Formu doldurun
3. "Formu Kaydet" butonuna tıklayın
4. Firebase Console > Firestore Database'de veriyi kontrol edin

## 🛠️ Kurulum

### Yerel Çalıştırma

1. **Repoyu klonlayın:**
```bash
git clone https://github.com/firatgok/invisalign-form.git
cd invisalign-form
```

2. **Firebase'i yapılandırın** (yukarıdaki adımları takip edin)

3. **Dosyaları bir web sunucusuyla açın:**

**Seçenek 1 - VS Code Live Server:**
- VS Code'da projeyi açın
- `index.html` dosyasına sağ tıklayın
- "Open with Live Server" seçin

**Seçenek 2 - Python Simple Server:**
```bash
python -m http.server 8000
# Tarayıcıda: http://localhost:8000
```

**Seçenek 3 - Node.js http-server:**
```bash
npx http-server
```

### GitHub Pages'a Deploy

1. GitHub reposuna push edin
2. Settings > Pages
3. Source: "GitHub Actions" seçin
4. Otomatik deploy edilecek!

### Netlify'a Deploy

1. Netlify'a giriş yapın
2. "Add new site" > "Import an existing project"
3. GitHub reponuzu seçin
4. Deploy! (netlify.toml otomatik algılanır)

## 📖 Kullanım

### Yeni Form Oluşturma

1. **Hasta Bilgileri**: Hasta adı, soyadı, MI
2. **Hasta Tipi**: Yetişkin/Ergen/Çocuk seçin
3. **Ürün Tipi**: Invisalign/Vivera/diğer ürünleri seçin
4. **Tedavi Seçeneği**: Comprehensive/Moderate/Lite/Express
5. **Detaylı Form**: 12 bölümlük tedavi detaylarını doldurun
6. **Özel Talimatlar**: İngilizce talimatlarınızı yazın
7. **Formu Kaydet**: Firebase'e kaydedin
8. **PDF Oluştur** (opsiyonel): PDF indirin

### Kaydedilen Formları Görüntüleme

1. "Kaydedilen Formlar" butonuna tıklayın
2. Arama kutusuna hasta adı yazın
3. Forma tıklayarak detayları görün
4. PDF oluşturun veya formu silin

## 📁 Proje Yapısı

```
invisalign-form/
├── index.html          # Ana form sayfası
├── list.html           # Kaydedilen formları listele
├── form.html           # Form sayfası (yeni form, görüntüleme, düzenleme)
├── styles.css          # Tüm stiller
├── script.js           # Form logic + PDF generation
├── firebase-config.js  # Firebase yapılandırması
├── netlify.toml        # Netlify config
├── README.md           # Proje dokümantasyonu
└── .gitignore          # Git ignore dosyası
```

## 🔧 Geliştirme

### Yeni Özellik Ekleme

1. Branch oluşturun: `git checkout -b feature/yeni-ozellik`
2. Değişikliklerinizi yapın
3. Commit edin: `git commit -m "Yeni özellik: ..."`
4. Push edin: `git push origin feature/yeni-ozellik`
5. Pull Request açın

### Form Bölümleri

- **Hasta Tipi Kontrolleri**: `showProductSection()`
- **Tedavi Seçenekleri**: `showTreatmentSection()`
- **Detaylı Form**: `showDetailedForm()`
- **A-P Kontrolleri**: `setupAPControls()`
- **Overbite Kontrolleri**: `setupOverbiteControls()`
- **PDF Generation**: `generatePDF()`

## 📝 TODO

- [ ] Ergen ve Çocuk detaylı formları
- [ ] Moderate/Lite/Express detaylı formları
- [ ] Çoklu dil desteği
- [ ] Form verilerini localStorage'a kaydetme
- [ ] Form validasyonu iyileştirmeleri

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun
3. Commit edin
4. Push edin
5. Pull Request açın

## 📄 Lisans

Bu proje özel kullanım içindir.

## 👨‍⚕️ Kullanım Alanı

Invisalign tedavisi sunan diş hekimleri için tasarlanmıştır. Form, tedavi planlamasını hızlandırır ve asistanlarla paylaşılabilir PDF çıktıları sağlar.
