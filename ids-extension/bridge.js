// IDS Yardımcısı - klasör köprüsü (eklenti sayfası, siteye gizli iframe olarak yüklenir).
// Klasör tanıtıcıları ve okuma izni kökene bağlıdır: ayar sayfasında (chrome-extension kökeni)
// seçilen ana klasör vip.invisalign.com ya da CBCT portalındaki betiklerce doğrudan okunamaz.
// Bu sayfa eklentinin kendi kökeninde çalışır, klasörü okur ve dosyaları (File nesneleri olarak)
// postMessage ile üst sayfaya verir. Yalnızca izin verilen sitelerden gelen isteklere yanıt verir.
// İzin yenilenmesi kullanıcı tıklaması ister; o tıklama bu çerçevenin içinde ("İzin ver") olmalıdır.
(function () {
    'use strict';

    const ALLOWED = ['https://vip.invisalign.com', 'https://auto.smarthub.invisalign.com'];
    const folder = window.idsfyFolder;
    const text = document.getElementById('text');
    const button = document.getElementById('grant');
    let parentOrigin = null;

    async function describe() {
        const status = await folder.rootStatus();
        if (!status.root) {
            text.textContent = 'Ana klasör seçilmemiş. Eklenti ayarlarından "Ana klasörü seç"e basın.';
            button.disabled = true;
        } else if (status.permission === 'granted') {
            text.textContent = '"' + status.root + '" klasörüne erişim var.';
            button.disabled = true;
        } else {
            text.textContent = 'IDS Yardımcısı: "' + status.root + '" klasörünü okumak için izin gerekiyor.';
            button.disabled = false;
        }
    }

    window.addEventListener('message', async function (event) {
        if (ALLOWED.indexOf(event.origin) < 0 || !event.data || !event.data.idsfy || !event.data.id) return;
        parentOrigin = event.origin;
        const msg = event.data;
        const reply = function (payload) {
            event.source.postMessage(Object.assign({ idsfy: true, id: msg.id }, payload), event.origin);
        };
        try {
            if (msg.type === 'status') {
                reply(await folder.rootStatus());
            } else if (msg.type === 'resolve') {
                const found = await folder.resolveByName(msg.name);
                reply(found.status === 'ok' ? { status: 'ok', folder: found.handle.name } : found);
            } else if (msg.type === 'images') {
                const found = await folder.resolveByName(msg.name);
                if (found.status !== 'ok') return reply(found);
                const files = await folder.images(found.handle, msg.kind || 'new', msg.choice || null);
                reply({ status: 'ok', folder: found.handle.name, files: files, choices: files.choices || null });
            } else if (msg.type === 'dicom') {
                const found = await folder.resolveByName(msg.name);
                if (found.status !== 'ok') return reply(found);
                const dicom = await folder.dicom(found.handle, msg.kind || 'new', msg.choice || null);
                reply({ status: 'ok', folder: dicom.folder, files: dicom.files });
            } else {
                reply({ status: 'error', message: 'bilinmeyen istek: ' + msg.type });
            }
        } catch (error) {
            reply({ status: 'error', message: error.message });
        }
    });

    // Çerçeve içinden izin istenir; Chrome çapraz kökenli çerçevede izin penceresi açmazsa ayar
    // sayfası açılır, oradaki "Okuma iznini yenile" ile verilen izin chrome.storage ile duyurulur.
    button.addEventListener('click', async function () {
        let granted = false;
        try {
            granted = await folder.grant();
        } catch (error) {
            granted = false;
        }
        if (granted) {
            await chrome.storage.local.set({ idsfyRootGrantedAt: Date.now() });
        } else {
            text.textContent = 'İzin burada alınamadı; eklenti ayar sayfası açılıyor, oradaki "Okuma iznini yenile"ye basın.';
            chrome.runtime.openOptionsPage();
        }
        await describe();
        window.parent.postMessage({ idsfy: true, type: 'permission', granted: granted }, parentOrigin || '*');
    });

    describe().then(function () {
        window.parent.postMessage({ idsfy: true, type: 'ready' }, '*');
    });
})();
