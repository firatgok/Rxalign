// IDS Yardımcısı - CBCT portalı (auto.smarthub.invisalign.com, Align "bertha" yükleyicisi).
// IDS'in Tara adımında CBCT istenince rx.js bu portalı yeni sekmede açar ve chrome.storage'a bir
// istek yazar (idsCbctRequest: pid, hasta adı). Burada hastanın klasöründeki .dcm alt klasörü
// bulunur, dosyalar portalın yükleme girişine verilir, yükleme izlenir ve sonuç idsCbctDone'a
// yazılır; IDS sekmesi bunu görünce "Yenile"ye basıp sürer. Klasör izni site başına verildiği
// için ana klasör bu portalda bir kez daha seçilir.
(function () {
    'use strict';

    const REQUEST_KEY = 'idsCbctRequest';
    const DONE_KEY = 'idsCbctDone';
    const REQUEST_MAX_AGE_MS = 30 * 60000;
    const UPLOAD_TIMEOUT_MS = 30 * 60000;
    const ERROR_RE = /kullanılabilir değil|geçerli veri bulunamadı|çok küçük|not available|no valid data|too small/i;
    const SUCCESS_RE = /başarıyla|tamamlandı|yüklendi|successfully|uploaded|completed/i;

    const pid = new URLSearchParams(location.search).get('pid');
    if (!pid) return;
    // IDS'ten gelen istekteki bağlam: yeni hasta ya da refinement (ve seçilen refinement klasörü).
    let requestKind = 'new';
    let requestChoice = null;

    function getStored(key) {
        return new Promise(function (resolve) {
            chrome.storage.local.get(key, function (stored) { resolve(stored[key]); });
        });
    }

    function setStored(key, value) {
        return new Promise(function (resolve) {
            const payload = {};
            payload[key] = value;
            chrome.storage.local.set(payload, resolve);
        });
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // check doğru bir değer döndürene kadar bekler; süre dolarsa null.
    async function waitUntil(check, timeoutMs) {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            const value = check();
            if (value) return value;
            await sleep(500);
        }
        return null;
    }

    // ---------- Panel ----------

    let panel = null;
    let statusEl = null;
    let actionsEl = null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function ensurePanel() {
        if (panel) return;
        panel = el('div', 'idsfy-panel idsfy-rx');
        const head = el('div', 'idsfy-head');
        head.appendChild(el('span', '', 'IDS CBCT Yükleyici'));
        panel.appendChild(head);
        const body = el('div', 'idsfy-body');
        statusEl = el('div', 'idsfy-status', '');
        actionsEl = el('div', 'idsfy-actions');
        body.appendChild(statusEl);
        body.appendChild(actionsEl);
        panel.appendChild(body);
        document.body.appendChild(panel);
    }

    function say(text, isError) {
        ensurePanel();
        statusEl.textContent = text;
        statusEl.classList.toggle('idsfy-error', !!isError);
    }

    function showActions(list) {
        ensurePanel();
        actionsEl.textContent = '';
        list.forEach(function (action) {
            const button = el('button', 'idsfy-button', action.text);
            button.type = 'button';
            button.addEventListener('click', function () {
                action.run().catch(function (error) { say('Hata: ' + error.message, true); });
            });
            actionsEl.appendChild(button);
        });
    }

    // ---------- Portal ----------

    function fileInput() {
        return document.querySelector('input[type="file"]');
    }

    function pageText() {
        return (document.body.innerText || '').replace(/\s+/g, ' ');
    }

    // 2. adımdaki yükleme düğmesi: "Seri 1 — Yükle" (button.Series-load-button); yedek olarak metne bakılır.
    function uploadButton() {
        const known = Array.from(document.querySelectorAll('button.Series-load-button')).find(function (b) {
            return b.offsetWidth > 0 && !b.disabled;
        });
        if (known) return known;
        return Array.from(document.querySelectorAll('button')).find(function (b) {
            if (b.offsetWidth === 0 || b.disabled || b.closest('.idsfy-panel')) return false;
            const text = b.textContent || '';
            return /yükle|upload|gönder|submit|devam|ileri|başlat|continue|next/i.test(text) &&
                !/iptal|cancel|geri|back/i.test(text);
        }) || null;
    }

    async function finish(ok, text) {
        await setStored(DONE_KEY, { pid: pid, ok: ok, text: text, at: Date.now() });
        say(text + (ok ? ' IDS sekmesine dönün; liste orada kendiliğinden yenilenir.' : ''), !ok);
    }

    const markDone = {
        text: 'Yükleme bitti, IDS\'e bildir',
        run: function () { return finish(true, 'CBCT yüklendi (elle onaylandı).'); }
    };

    function pickAction(name) {
        return {
            text: 'Hasta klasörünü elle seç',
            run: async function () {
                const handle = await window.showDirectoryPicker({ id: 'idsfy-cbct', mode: 'read' });
                await upload(handle, name);
            }
        };
    }

    // Dosyaları portala verir, denetimi ve yüklemeyi izler.
    async function feed(files, folderName) {
        const input = fileInput();
        if (!input) throw new Error('portalda dosya girişi bulunamadı');
        const transfer = new DataTransfer();
        files.forEach(function (file) { transfer.items.add(file); });
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        say(files.length + ' DICOM dosyası ("' + folderName + '") portala verildi; portal denetliyor…');
        showActions([markDone]);
        const outcome = await waitUntil(function () {
            const text = pageText();
            if (ERROR_RE.test(text)) return 'error';
            if (/Adım 2|Step 2/i.test(text) || uploadButton()) return 'next';
            return null;
        }, 180000);
        if (outcome === 'error') {
            const detail = (pageText().match(/CBCT taraması kullanılabilir değil[^.]*\./) || [''])[0];
            throw new Error('portal dosyaları kabul etmedi. ' + detail);
        }
        if (!outcome) throw new Error('portal dosyalara yanıt vermedi');
        const button = uploadButton();
        if (button) {
            button.click();
            say('Yükleme başlatıldı; bitmesi bekleniyor…');
        } else {
            say('Dosyalar eklendi; yüklemeyi portalda siz başlatın. Bitince "Yükleme bitti"ye basın.');
        }
        const result = await waitUntil(function () {
            const text = pageText();
            if (SUCCESS_RE.test(text)) return 'ok';
            if (ERROR_RE.test(text)) return 'error';
            return null;
        }, UPLOAD_TIMEOUT_MS);
        if (result === 'ok') return finish(true, 'CBCT yüklendi.');
        if (result === 'error') throw new Error('yükleme sırasında portal hata verdi');
        throw new Error('yükleme 30 dakikada bitmedi');
    }

    async function upload(handle, name) {
        try {
            say('"' + handle.name + '" içinde .dcm klasörü aranıyor…');
            const dicom = await window.idsfyFolder.dicom(handle, requestKind, requestChoice);
            if (!dicom.files.length) throw new Error('"' + handle.name + '" içinde .dcm dosyası bulunamadı');
            await feed(dicom.files, dicom.folder);
        } catch (error) {
            await finish(false, 'CBCT yüklenemedi: ' + error.message);
            showActions([pickAction(name), markDone]);
        }
    }

    async function run(name) {
        say('"' + name + '" klasörü aranıyor…');
        let found;
        try {
            found = await window.idsfyFolder.resolveByName(name);
        } catch (error) {
            found = { status: 'error', message: error.message };
        }
        if (found.status === 'no-root') {
            say('Bu portal için ana klasör henüz seçilmedi (bir kez gerekir). "Ana klasörü seç"e basıp ' +
                'hasta klasörlerinin durduğu üst klasörü seçin.');
            showActions([{
                text: 'Ana klasörü seç',
                run: async function () { await window.idsfyFolder.pickRoot(); await run(name); }
            }, pickAction(name)]);
            return;
        }
        if (found.status === 'needs-permission') {
            waitingPermission = name;
            say(found.shared
                ? 'Ana klasör için okuma izni gerekiyor: sağ üstteki kutuda "İzin ver"e basın.'
                : 'Ana klasör için okuma izni gerekiyor.');
            showActions([{
                text: 'İzin ver',
                run: async function () { await window.idsfyFolder.grant(); await run(name); }
            }, pickAction(name)]);
            return;
        }
        if (found.status !== 'ok') {
            say('"' + name + '" için hasta klasörü bulunamadı' +
                (found.names ? ' (birden çok aday: ' + found.names.join(', ') + ')' : '') +
                '; klasörü elle seçin.', true);
            showActions([pickAction(name)]);
            return;
        }
        await upload(found.handle, name);
    }

    // Ortak ana klasörün izni köprü kutusundan verilince bekleyen arama sürer.
    let waitingPermission = null;
    document.addEventListener('idsfy-folder-ready', function () {
        if (waitingPermission === null) return;
        const name = waitingPermission;
        waitingPermission = null;
        run(name).catch(function (error) { say('Hata: ' + error.message, true); });
    });

    async function main() {
        if (!(await waitUntil(fileInput, 20000))) return;
        ensurePanel();
        const request = await getStored(REQUEST_KEY);
        const fresh = request && String(request.pid) === String(pid) && Date.now() - request.at < REQUEST_MAX_AGE_MS;
        if (!fresh) {
            say('IDS\'ten bu hasta için CBCT isteği yok. Hasta klasörünü seçerseniz içindeki .dcm klasörünü yüklerim.');
            showActions([pickAction(''), markDone]);
            return;
        }
        requestKind = request.kind || 'new';
        requestChoice = request.choice || null;
        await run(request.name || '');
    }

    main().catch(function (error) { say('Hata: ' + error.message, true); });
})();
