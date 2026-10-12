// =====================================================================
//  v3/form.html üretici
//  eski/form.html'deki form içeriğini (<main id="formContent">…</main>) alır,
//  yeni kabuğa (uygulama çubuğu, adım rayı, alt eylem çubuğu) yerleştirir.
//  Alan adları ve bölüm kimlikleri değişmez; script.js aynen çalışır.
//  Çalıştırma:  node build-form.js   (eski/form.html her değiştiğinde)
// =====================================================================
const fs = require('fs');
const path = require('path');

const root = __dirname;
// Form içeriğinin kaynağı eski tasarımdaki form (alan adları burada tanımlı)
const src = fs.readFileSync(path.join(root, 'eski', 'form.html'), 'utf8');

const start = src.indexOf('<main id="formContent">');
const end = src.indexOf('</main>', start);
if (start < 0 || end < 0) throw new Error('form.html içinde <main id="formContent"> bulunamadı');
const content = src.slice(start + '<main id="formContent">'.length, end);

const icon = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 7"></path></svg>',
    pdf: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h8l5 5v15H6z"></path><path d="M14 2v5h5M9 13h6M9 17h6"></path></svg>',
    cloud: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9H7z"></path><path d="M9 14l2 2 4-4"></path></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z"></path><path d="M12.5 7.5l4 4"></path></svg>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"></path><path d="M5 10v10h5v-6h4v6h5V10"></path></svg>',
    gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
    theme: '<svg class="ic-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg><svg class="ic-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
};

const steps = [
    ['1', 'Hasta'],
    ['2', 'Form ve hasta tipi'],
    ['3', 'Ürün ve paket'],
    ['4', 'Tedavi detayları'],
    ['5', 'Özet ve kaydet']
];

const stepperItems = steps.map(([n, title]) =>
    `        <li data-step="${n}"><button type="button" class="step-btn"><span class="step-num"><span class="step-n">${n}</span>${icon.check}</span><span class="step-text"><span class="step-title">${title}</span><span class="step-sub"></span></span></button></li>`
).join('\n');

const html = `<!DOCTYPE html>
<!-- ÜRETİLMİŞ DOSYA: node build-form.js — form içeriği eski/form.html'den gelir, elle düzenlemeyin -->
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#F6F5F1">
    <title>Yeni Form - Rxalign</title>
    <script src="js/theme.js"></script>
    <link rel="icon" type="image/png" href="images/favicon.png">
    <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/app.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
</head>
<body class="page-form" data-mode="new">

    <header class="appbar">
        <a class="appbar-logo" href="index.html" aria-label="Rxalign ana sayfa"><img src="images/rxalign-mark.png" alt=""></a>
        <div class="appbar-titles">
            <h1 class="appbar-title">Yeni form</h1>
            <p class="subtitle appbar-sub" id="appbarSub">Hasta bilgilerini girin</p>
        </div>
        <div class="appbar-chips">
            <span class="chip chip-patient" id="patientChip" hidden></span>
            <span class="chip chip-package" id="packageChip" hidden></span>
        </div>
        <div class="appbar-actions">
            <span class="draft-status" id="draftStatus" hidden>${icon.cloud}<span class="draft-status-text"></span></span>
            <nav class="icon-rail" aria-label="Hızlı erişim">
                <a class="rail-btn" href="index.html" title="Ana sayfa" aria-label="Ana sayfa">${icon.home}<span class="rail-label">Ana sayfa</span></a>
                <a class="rail-btn" href="settings.html" title="Ayarlar" aria-label="Ayarlar">${icon.gear}<span class="rail-label">Ayarlar</span></a>
                <button type="button" class="rail-btn theme-btn" data-theme-toggle aria-label="Gece moduna geç" title="Gece modu">${icon.theme}<span class="rail-label">Gece modu</span></button>
                <button type="button" class="rail-btn danger" id="resetBtn" title="Formu temizle" aria-label="Formu temizle">${icon.trash}<span class="rail-label">Formu temizle</span></button>
                <a class="rail-btn" href="index.html" id="viewFormsBtn" title="Kapat" aria-label="Kapat">${icon.close}<span class="rail-label">Kapat</span></a>
            </nav>
        </div>
    </header>

    <div class="shell">
        <nav class="stepper" id="stepper" aria-label="Form adımları">
            <ol class="stepper-list">
${stepperItems}
            </ol>
            <div class="stepper-progress" aria-hidden="true"><span id="stepperBar"></span></div>
        </nav>

        <div class="container">
            <div class="step-header" id="stepHeader" hidden>
                <span class="eyebrow" id="stepEyebrow"></span>
                <h2 class="step-h" id="stepTitle"></h2>
                <p class="step-desc" id="stepDesc"></p>
            </div>
            <div class="draft-banner" id="draftBanner" hidden>
                <div class="draft-banner-text"><strong>Kaydedilmemiş taslak var</strong><span id="draftBannerInfo"></span></div>
                <div class="draft-banner-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="draftRestore">Geri yükle</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="draftDiscard">Sil</button>
                </div>
            </div>
            <main id="formContent" data-view="intro" data-reach="1">${content}
            </main>
        </div>
    </div>

    <footer class="action-buttons">
        <div class="action-inner">
            <button type="button" id="wizardBack" class="btn btn-ghost">${icon.back}<span>Geri</span></button>
            <span class="action-status" id="actionStatus"></span>
            <div class="action-right">
                <button type="button" id="assistantEditBtn" class="btn btn-edit">${icon.edit}<span>Düzenle</span></button>
                <button id="generatePdfBtn" class="btn btn-secondary">${icon.pdf}<span>PDF oluştur</span></button>
                <button id="checkInBtn" class="btn btn-primary" style="display: none;">Giriş Yapıldı</button>
                <button id="saveBtn" class="btn btn-primary">${icon.check}<span>Formu kaydet</span></button>
                <button type="button" id="wizardNext" class="btn btn-primary"><span>Devam</span>${icon.next}</button>
            </div>
        </div>
    </footer>

    <div class="version-info">© 2026 Rxalign · <span id="appVersion">v2</span> · <a href="eski/form.html" data-legacy-link class="legacy-link">Eski tasarımda aç</a></div>

    <!-- Firebase SDK -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
    <script src="firebase-config.js"></script>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="defaults.js"></script>
    <script src="script.js"></script>
    <script src="js/app.js"></script>
    <script src="js/wizard.js"></script>
    <script src="version.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'form.html'), html);
console.log('form.html yazıldı:', (html.length / 1024).toFixed(0), 'KB');
