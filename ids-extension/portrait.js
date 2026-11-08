// IDS Yardımcısı - Hasta Portresi adımı.
// Hastanın klasörü ana klasörde adından bulunur; dikey kareler küçültülüp yapay zekaya
// sorulur, önden gülümseyen yüz fotoğrafı portre olarak yüklenir ve sonraki adıma geçilir.
(function () {
    'use strict';

    const params = new URLSearchParams(location.search);
    if (!/\/patient\/editPatient\.action$/.test(location.pathname) ||
            params.get('currentStep') !== 'PROFILE_PICTURE') return;
    const input = document.getElementById('profilePicture');
    if (!input) return;

    const THUMB_EDGE = 512;
    const folder = window.idsfyFolder;
    let busy = false;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    const panel = el('div', 'idsfy-panel');
    const head = el('div', 'idsfy-head');
    head.appendChild(el('span', '', 'IDS Portre Yükleyici'));
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
                    // Klasör penceresi iptal edilirse sessiz kalınır.
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

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(blob);
        });
    }

    // Yüz fotoğrafları dikey çekilir; yatay kareler (ağız içi) elenir.
    async function thumbnail(file) {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const upright = bitmap.height > bitmap.width;
        let data = null;
        if (upright) {
            const scale = Math.min(1, THUMB_EDGE / bitmap.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.8); });
            data = await blobToBase64(blob);
        }
        bitmap.close();
        return data;
    }

    function ask(message) {
        return new Promise(function (resolve, reject) {
            // Eklenti yenilenince açık sayfadaki eski betik arka planla konuşamaz.
            if (!chrome.runtime || !chrome.runtime.id) {
                return reject(new Error('Eklenti güncellendi; bu sayfayı yenileyin (F5).'));
            }
            chrome.runtime.sendMessage(message, function (reply) {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!reply || !reply.ok) return reject(new Error(reply ? reply.error : 'yanıt yok'));
                resolve(reply);
            });
        });
    }

    async function uploadFrom(handle) {
        showActions([]);
        const files = await folder.images(handle);
        if (!files.length) throw new Error('"' + handle.name + '" klasöründe JPG/PNG bulunamadı.');
        const candidates = [];
        for (let i = 0; i < files.length; i++) {
            setStatus('"' + handle.name + '": fotoğraflar hazırlanıyor ' + (i + 1) + '/' + files.length);
            const data = await thumbnail(files[i]);
            if (data) candidates.push({ index: i, data: data });
        }
        if (!candidates.length) throw new Error('Klasörde dikey (yüz) fotoğrafı bulunamadı.');
        setStatus('Yapay zeka ' + candidates.length + ' kare arasından portreyi seçiyor…');
        const choice = (await ask({ type: 'ids-portrait', images: candidates })).choice;
        const file = files[choice.index];
        if (!file || !candidates.some(function (c) { return c.index === choice.index; })) {
            throw new Error('Önden yüz fotoğrafı bulunamadı; portreyi elle yükleyin.');
        }
        setStatus('Yükleniyor: ' + file.name);
        // Sayfada önceden bir portre varsa, yenisinin geldiği görüntünün değişmesinden anlaşılır.
        const previous = document.querySelector('img.loadedimage');
        const previousSrc = previous ? previous.src : null;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        let loaded = false;
        for (let i = 0; i < 300 && !loaded; i++) {
            await sleep(200);
            const now = document.querySelector('img.loadedimage');
            loaded = !!now && (now !== previous || now.src !== previousSrc);
        }
        if (!loaded) throw new Error('IDS portreyi yüklemedi; elle deneyin.');
        sessionStorage.setItem(flag, '1');
        setStatus('Portre yüklendi: ' + file.name + (choice.smiling ? '' : ' (gülümseyen kare bulunamadı, dinlenme karesi)') +
            '. Sonraki adıma geçiliyor…');
        await sleep(1200);
        goNext();
    }

    function goNext() {
        const next = document.getElementById('uploadButton');
        if (next) next.click();
    }

    // Sayfada daha önce yüklenmiş bir portre var mı (sunucudan gelen önizleme kısa gecikmeyle çizilebilir)?
    async function existingPortrait() {
        for (let i = 0; i < 10; i++) {
            if (document.querySelector('img.loadedimage')) return true;
            await sleep(200);
        }
        return false;
    }

    const pickPatient = {
        text: 'Bu hastanın klasörünü elle seç',
        run: async function () { await uploadFrom(await folder.pickPatient()); }
    };
    const pickRoot = function (text) {
        return { text: text, run: async function () { await folder.pickRoot(); await start(); } };
    };

    // Klasör bulunursa hiçbir tıklama beklenmeden yüklenir; bulunamazsa neyin eksik
    // olduğu ve tek tıklamalık çözümü gösterilir.
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
                showActions([pickPatient]);
            }
        } else if (found.status === 'no-root') {
            setStatus('Hasta klasörlerinin bulunduğu ana klasörü bir kez seçin; sonraki hastalarda klasör adından bulunur.');
            showActions([pickRoot('Ana klasörü seç')]);
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
            showActions([pickPatient]);
        } else {
            setStatus('"' + found.root + '" içinde "' + folder.patientName() + '" adını taşıyan klasör bulunamadı.', true);
            showActions([pickPatient, pickRoot('Ana klasörü değiştir')]);
        }
    }

    // Portre zaten yüklüyse (sayfaya sonradan dönüldü) kendiliğinden hiçbir şey yapılmaz;
    // devam etmek ya da klasörden yeniden yüklemek kullanıcıya bırakılır.
    const flag = 'idsfy-portrait-' + params.get('patientId');
    existingPortrait().then(function (existing) {
        if (existing || sessionStorage.getItem(flag)) {
            setStatus(existing ? 'Portre zaten yüklü.' : 'Bu hastada portre adımı daha önce işlendi.');
            showActions([
                { text: 'Devam et', run: async function () { goNext(); } },
                { text: 'Klasörden yeniden yükle', run: start }
            ]);
            return;
        }
        return start();
    }).catch(function (error) { setStatus('Hata: ' + error.message, true); });
})();
