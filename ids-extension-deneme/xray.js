// IDS Yardımcısı - Radyograf adımı.
// Hastanın klasöründeki panoramik röntgen bulunur, yüklenir ve sonraki adıma geçilir.
// Röntgen yapay zekasız tanınır: klinik fotoğraflar renklidir, röntgen gri tonludur ve
// panoramik film belirgin biçimde yataydır.
(function () {
    'use strict';

    // Hem hasta sihirbazının hem reçetenin Radyograf adımında çalışır.
    const params = new URLSearchParams(location.search);
    const inWizard = /\/patient\/editPatient\.action$/.test(location.pathname) && params.get('currentStep') === 'XRAY';
    const inRx = /\/rx\/.*\.action$/.test(location.pathname);
    if (!inWizard && !inRx) return;
    const input = document.getElementById('panoramicxTf');
    if (!input) return;

    const folder = window.idsfyFolder;
    const SAMPLE_WIDTH = 96;
    // Gri tonlu sayılmak için ortalama renk farkı (0-255). Ölçülen değerler: röntgen 0,
    // en karanlık klinik fotoğraf 8, tipik fotoğraf 25-40.
    const MAX_CHROMA = 4;
    const PANORAMIC_ASPECT = 1.9;  // tipik panoramik en/boy oranı
    let busy = false;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    const panel = el('div', 'idsfy-panel');
    const head = el('div', 'idsfy-head');
    head.appendChild(el('span', '', 'IDS Röntgen Yükleyici'));
    panel.appendChild(head);
    const body = el('div', 'idsfy-body');
    panel.appendChild(body);
    const status = el('div', 'idsfy-status', 'Hasta klasörü aranıyor…');
    body.appendChild(status);
    const actions = el('div', 'idsfy-actions');
    body.appendChild(actions);
    document.body.appendChild(panel);

    function setStatus(text, isError) {
        status.textContent = text;
        status.classList.toggle('idsfy-error', !!isError);
    }

    // Düğmeler kullanıcı tıklaması gerektiren işler içindir (klasör penceresi, izin).
    function showActions(list) {
        actions.textContent = '';
        list.forEach(function (item) {
            const node = el('button', 'idsfy-button', item.text);
            node.type = 'button';
            node.addEventListener('click', async function () {
                if (busy) return;
                busy = true;
                try {
                    await item.run();
                } catch (error) {
                    if (error.name !== 'AbortError') setStatus('Hata: ' + error.message, true);
                }
                busy = false;
            });
            actions.appendChild(node);
        });
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // Küçültülmüş karede ortalama renk farkı (kanalların en büyüğü ile en küçüğü arası).
    async function inspect(file) {
        const bitmap = await createImageBitmap(file, {
            imageOrientation: 'from-image', resizeWidth: SAMPLE_WIDTH, resizeQuality: 'low'
        });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let chroma = 0;
        for (let i = 0; i < data.length; i += 4) {
            chroma += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        }
        return { chroma: chroma / (data.length / 4), aspect: canvas.width / canvas.height };
    }

    async function findPanoramic(files) {
        let best = null;
        for (let i = 0; i < files.length; i++) {
            setStatus('Röntgen aranıyor: ' + (i + 1) + '/' + files.length);
            const info = await inspect(files[i]);
            if (info.chroma > MAX_CHROMA || info.aspect < 1.4 || info.aspect > 2.8) continue;
            const distance = Math.abs(info.aspect - PANORAMIC_ASPECT);
            if (!best || distance < best.distance) best = { file: files[i], distance: distance };
        }
        return best ? best.file : null;
    }

    function goNext() {
        const next = document.getElementById('uploadButton');
        if (next) next.click();
    }

    async function uploadFrom(handle) {
        showActions([]);
        const files = await folder.images(handle);
        const file = files.length ? await findPanoramic(files) : null;
        if (!file) {
            setStatus('"' + handle.name + '" klasöründe panoramik röntgen bulunamadı. ' + PASTE_HINT, true);
            showActions([pasteAction, { text: 'Radyografsız devam et', run: async function () { goNext(); } }, pickPatient]);
            return;
        }
        await uploadFile(file, file.name);
    }

    // Seçilen dosya (klasörden ya da panodan) IDS'in girişine verilir, yüklenince sonraki adıma geçilir.
    async function uploadFile(file, label) {
        showActions([]);
        setStatus('Yükleniyor: ' + label);
        const online = document.getElementById('onlineonline');
        if (online && !online.checked) online.click();
        const wrapper = input.closest('.photoWrapper') || document;
        const previous = wrapper.querySelector('img.loadedimage');
        const previousSrc = previous ? previous.src : null;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        let loaded = false;
        for (let i = 0; i < 300 && !loaded; i++) {
            await sleep(200);
            const now = (input.closest('.photoWrapper') || document).querySelector('img.loadedimage');
            loaded = !!now && (now !== previous || now.src !== previousSrc);
        }
        if (!loaded) throw new Error('IDS röntgeni yüklemedi; elle deneyin.');
        // Sayfaya geri dönüldüğünde yeniden yükleyip ilerlememek için hasta başına bir kez geçilir.
        sessionStorage.setItem(flag, '1');
        setStatus('Panoramik yüklendi: ' + label + '. Sonraki adıma geçiliyor…');
        await sleep(1200);
        goNext();
    }

    const flag = 'idsfy-xray-' + (params.get('patientId') || 'rx-' + params.get('formId'));

    // Panodan yükleme (13 Kasım 2026): klasörde röntgen yoksa röntgenin ekran görüntüsü bu sayfada Ctrl+V ile
    // yapıştırılır ya da düğmeyle panodan okunur. Yüklü röntgen varken yapıştırma yok sayılır (yanlışlıkla değişmesin).
    const PASTE_HINT = 'Röntgenin ekran görüntüsünü alıp bu sayfada Ctrl+V ile yapıştırabilirsiniz.';
    function xrayLoaded() {
        return !!(input.closest('.photoWrapper') || document).querySelector('img.loadedimage');
    }
    function fileFromClipboard(data) {
        const items = Array.from((data && data.items) || []);
        const item = items.find(function (it) { return it.kind === 'file' && /^image\//.test(it.type); });
        return item ? item.getAsFile() : null;
    }
    function namedFile(blob, type) {
        return new File([blob], 'rontgen-ekran-goruntusu.' + (/png/.test(type) ? 'png' : 'jpg'), { type: type });
    }
    async function uploadPasted(file) {
        try {
            await uploadFile(namedFile(file, file.type), 'panodaki ekran görüntüsü');
        } catch (error) {
            setStatus('Hata: ' + error.message, true);
            showActions([pasteAction, pickPatient]);
        }
    }
    document.addEventListener('paste', function (event) {
        if (busy || xrayLoaded()) return;
        const file = fileFromClipboard(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        busy = true;
        uploadPasted(file).finally(function () { busy = false; });
    });
    const pasteAction = {
        text: 'Ekran görüntüsünü yapıştır',
        run: async function () {
            let file = null;
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const type = item.types.find(function (t) { return /^image\//.test(t); });
                    if (type) { file = await item.getType(type); file = namedFile(file, type); break; }
                }
            } catch (error) {
                // Pano izni verilmedi ya da okunamadı: Ctrl+V yolu kalır.
            }
            if (!file) {
                setStatus('Panoda resim bulunamadı. ' + PASTE_HINT, true);
                return;
            }
            await uploadPasted(file);
        }
    };
    const pickPatient = {
        text: 'Bu hastanın klasörünü elle seç',
        run: async function () { await uploadFrom(await folder.pickPatient()); }
    };
    const pickRoot = function (text) {
        return { text: text, run: async function () { await folder.pickRoot(); await start(); } };
    };

    // Ortak ana klasörün izni sağ üstteki köprü kutusundan verilince (idsfy-folder-ready) sürer.
    let waitingPermission = false;
    document.addEventListener('idsfy-folder-ready', function () {
        if (!waitingPermission) return;
        waitingPermission = false;
        start();
    });

    async function start() {
        const found = await folder.resolve();
        if (found.status === 'ok') {
            try {
                await uploadFrom(found.handle);
            } catch (error) {
                setStatus('Hata: ' + error.message, true);
                showActions([pasteAction, pickPatient]);
            }
        } else if (found.status === 'no-root') {
            setStatus('Hasta klasörlerinin bulunduğu ana klasörü bir kez seçin. ' + PASTE_HINT);
            showActions([pickRoot('Ana klasörü seç'), pasteAction]);
        } else if (found.status === 'needs-permission') {
            waitingPermission = true;
            setStatus('Chrome, ana klasörü okumak için izninizi istiyor' +
                (found.shared ? ': sağ üstteki kutuda "İzin ver"e basın.' : '.'));
            showActions([{
                text: 'Klasör erişimine izin ver',
                run: async function () {
                    if (await folder.grant()) await start();
                    else setStatus('İzin verilmedi.', true);
                }
            }]);
        } else if (found.status === 'ambiguous') {
            setStatus('"' + folder.patientName() + '" adına birden fazla klasör uyuyor: ' + found.names.join(', '), true);
            showActions([pickPatient, pasteAction]);
        } else {
            setStatus('"' + found.root + '" içinde "' + folder.patientName() + '" adını taşıyan klasör bulunamadı. ' + PASTE_HINT, true);
            showActions([pasteAction, pickPatient, pickRoot('Ana klasörü değiştir')]);
        }
    }

    const existing = (input.closest('.photoWrapper') || document).querySelector('img.loadedimage');
    const resume = [
        { text: 'Devam et', run: async function () { goNext(); } },
        { text: 'Klasörden yeniden yükle', run: start }
    ];
    const decide = function (rxStopped) {
        if (rxStopped) {
            // Form doldurucu "Durdur" ile durdurulmuş: reçete elle sürdürülüyor, ilerletilmez.
            setStatus('Form doldurucu durduruldu; röntgen adımı size bırakıldı.');
            showActions(existing ? resume : [{ text: 'Klasörden yükle', run: start }, pasteAction]);
        } else if (existing && inRx) {
            // Reçetede, hasta sihirbazında yüklenen röntgen görünür; yeniden yüklenmeden geçilir
            // (aynı reçeteye ikinci kez gelinse de).
            sessionStorage.setItem(flag, '1');
            setStatus('Röntgen zaten yüklü. Sonraki adıma geçiliyor…');
            setTimeout(goNext, 1200);
        } else if (sessionStorage.getItem(flag)) {
            setStatus('Bu hastada röntgen adımı daha önce işlendi.');
            showActions(resume);
        } else if (existing) {
            // Sihirbazda sayfaya sonradan dönülmüştür; karar kullanıcıya bırakılır.
            setStatus('Röntgen zaten yüklü.');
            showActions(resume);
        } else {
            start().catch(function (error) { setStatus('Hata: ' + error.message, true); });
        }
    };
    if (inRx && chrome.storage && chrome.storage.local) {
        // Reçetede rx.js'in durumu okunur: doldurma durdurulmuşsa bu adım da kendiliğinden geçilmez.
        chrome.storage.local.get('idsRxFill', function (stored) {
            const state = stored && stored.idsRxFill;
            decide(!!(state && state.formId === params.get('formId') && state.auto === false));
        });
    } else {
        decide(false);
    }
})();
