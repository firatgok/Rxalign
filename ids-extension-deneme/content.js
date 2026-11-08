// IDS Foto Yükleyici - sayfa betiği.
// IDS'in Fotoğraflar adımında bir panel açar. Hasta klasörü seçilince orijinal dosyalar IDS'in kendi otomatik
// sıralamasına bırakılır; yükleme bitince ağız içi yuvaların yönü yapay zekayla orijinal kareden okunur, her yuvanın
// karesi yuvası bilinerek kırpılıp döndürülür ve IDS'teki yuvaya "Değiştir" ile konur (crop.js). Kırpma kaydı olmayan
// karelerde yön IDS'in kalem menüsündeki döndürme/çevirme araçlarıyla düzeltilir.
(function () {
    'use strict';

    // Düzeltilen yuvalar (anahtarların yazımı IDS'in).
    const SLOTS = [
        { key: 'occlussal_upper', label: 'Üst oklüzal' },
        { key: 'occlussal_lower', label: 'Alt oklüzal' },
        { key: 'buccal_right', label: 'Sağ bukkal' },
        { key: 'labial_anterior', label: 'Ağız içi önden' },
        { key: 'buccal_left', label: 'Sol bukkal' }
    ];

    // Yönler saat yönünde derecedir: üst 0, sağ 90, alt 180, sol 270.
    const SIDE = { top: 0, right: 90, bottom: 180, left: 270 };

    // Kalem menüsündeki düğmelerin sırası (metinler dile göre değiştiği için sıra kullanılır).
    const MENU = { flipVertical: 0, flipHorizontal: 1, rotateLeft: 2, rotateRight: 3 };

    // crop: bu yüklemenin kırpma kaydı { originals, items (hazırlanmış orijinaller), notes, placed (yuva → bizim koyduğumuz kare),
    // labelOf (yerleşmeyen karelerin etiketleri), timing }; preparing: küçük kareler hazırlanıyor.
    const state = { busy: false, results: {}, stopped: false, crop: null, preparing: false };
    let panel = null;

    // Ayar sayfasındaki "yerleştirildikten sonra kırp" seçeneği (varsayılan açık).
    function cropEnabled() {
        return new Promise(function (resolve) {
            if (!chrome.storage || !chrome.storage.local) return resolve(true);
            chrome.storage.local.get('idsfyCropPhotos', function (stored) {
                resolve(!stored || stored.idsfyCropPhotos !== false);
            });
        });
    }

    // "Durdur": bu hastada klasör kendiliğinden bırakılmaz, yönler düzeltilmez, "İleri"ye basılmaz.
    // Hasta (sihirbaz) ya da form (reçete) başına oturum boyunca hatırlanır.
    function stopKey() {
        const params = new URLSearchParams(location.search);
        return 'idsfy-photos-stop-' + (params.get('patientId') || params.get('formId') || '');
    }

    // Bu eklentiyle pikselleri döndürülüp aynalanmış (kırpılmış) yuvalar hasta/form başına işaretlenir: sayfa yenilenince klasör kaydı
    // kaybolur ve eski yol (IDS menüsü) bu yuvaları bir daha döndürüp aynalamasın (oklüzal iki kez aynalanırdı).
    function processedKey() {
        const params = new URLSearchParams(location.search);
        return 'idsfy-processed-' + (params.get('patientId') || params.get('formId') || '');
    }
    function processedSlots() {
        try { return JSON.parse(localStorage.getItem(processedKey()) || '[]'); } catch (error) { return []; }
    }
    function markProcessed(key, on) {
        try {
            const list = processedSlots().filter(function (k) { return k !== key; });
            if (on) list.push(key);
            localStorage.setItem(processedKey(), JSON.stringify(list));
        } catch (error) { /* depolama kapalıysa işaret tutulmaz */ }
    }

    // Reçetede form doldurucu (rx.js) "Durdur" ile durdurulmuşsa fotoğraflar da kendiliğinden
    // bırakılmaz.
    function rxStopped() {
        return new Promise(function (resolve) {
            if (!/\/rx\//.test(location.pathname) || !chrome.storage || !chrome.storage.local) return resolve(false);
            const formId = new URLSearchParams(location.search).get('formId');
            chrome.storage.local.get('idsRxFill', function (stored) {
                const st = stored && stored.idsRxFill;
                resolve(!!(st && st.formId === formId && st.auto === false));
            });
        });
    }

    // Sekme gizliyken (arka sekme ya da başka pencerenin altında kalan Chrome) Chrome setTimeout'u saniyede bire kısar: 200 ms'lik
    // bekleme 1 sn sürüyor, "Değiştir"in menü adımı 0,8 yerine 4 sn ve kilit yüzünden 8 yuva bunu sırayla bekliyordu (6 Kasım 2026).
    // Gizliyken bekleme arka plan servis çalışanında yapılır (orada kısılmaz); yanıt gelmezse yedek zamanlayıcı.
    function sleep(ms) {
        if (document.hidden && speedOn() && chrome.runtime && chrome.runtime.id) {
            return new Promise(function (resolve) {
                let done = false;
                const finish = function () { if (!done) { done = true; resolve(); } };
                setTimeout(finish, ms + 1000);
                try {
                    chrome.runtime.sendMessage({ type: 'ids-sleep', ms: ms }, function () { void chrome.runtime.lastError; finish(); });
                } catch (error) { /* yedek zamanlayıcı çözer */ }
            });
        }
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function waitFor(check, timeoutMs) {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            const value = check();
            if (value) return value;
            await sleep(150);
        }
        return null;
    }

    function turn(degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    // ---------- IDS sayfası ----------

    function onPhotosStep() {
        return !!document.querySelector(
            'input[type="file"][id$="-uploader-input"], input[type="file"][id$="-uploaded-photo-input"]'
        );
    }

    function tileOf(slot) {
        const filled = document.querySelector('input[type="file"][id$="-' + slot + '-uploaded-photo-input"]');
        return filled ? filled.parentElement : null;
    }

    function previewOf(slot) {
        const tile = tileOf(slot);
        return tile ? tile.querySelector('img[class*="Preview-photo"]:not([class*="Blur"])') : null;
    }

    function matrixOf(element) {
        const text = getComputedStyle(element).transform;
        if (!text || text === 'none') return [1, 0, 0, 1];
        return text.slice(text.indexOf('(') + 1).split(',').slice(0, 4).map(Number);
    }

    // IDS döndürmeyi resmin kendisine, çevirmeleri (ekran eksenlerinde) sarmalayıcıya uygular.
    function readOrientation(slot) {
        const img = previewOf(slot);
        if (!img) return null;
        const m = matrixOf(img);
        const quarter = Math.round(Math.atan2(m[1], m[0]) / (Math.PI / 2));
        const wrap = matrixOf(img.closest('[class*="Preview-photoWrapper"]') || img.parentElement);
        return { rotate: turn(quarter * 90), flipX: wrap[0] < 0, flipY: wrap[3] < 0 };
    }

    function menuButtons() {
        const menu = document.querySelector('[class*="Dropdown-dropdownMenu"]:not([class*="Item"])');
        return menu ? menu.querySelectorAll('button') : null;
    }

    function closeMenus() {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
            document.body.dispatchEvent(new MouseEvent(type, { bubbles: true }));
        });
    }

    async function clickTool(slot, index) {
        const buttons = menuButtons();
        if (!buttons || !buttons[index]) throw new Error('düzenleme menüsü bulunamadı');
        const before = JSON.stringify(readOrientation(slot));
        buttons[index].click();
        const changed = await waitFor(function () {
            return JSON.stringify(readOrientation(slot)) !== before;
        }, 4000);
        if (!changed) throw new Error('IDS düzenleme aracı yanıt vermedi');
    }

    // Hedef: ham kare önce saat yönünde target.rotate kadar döndürülmüş, sonra
    // target.mirror ise sağ-sol aynalanmış görünsün.
    async function applyOrientation(slot, target) {
        const tile = tileOf(slot);
        const pencil = tile && tile.querySelector('[class*="UploadedPhoto-editButton"]');
        if (!pencil) throw new Error('düzenle düğmesi bulunamadı');
        closeMenus();
        await sleep(200);
        pencil.click();
        if (!(await waitFor(menuButtons, 4000))) throw new Error('düzenleme menüsü açılmadı');
        try {
            let now = readOrientation(slot);
            const steps = turn(target.rotate - now.rotate) / 90;
            if (steps === 3) {
                await clickTool(slot, MENU.rotateLeft);
            } else {
                for (let i = 0; i < steps; i++) await clickTool(slot, MENU.rotateRight);
            }
            now = readOrientation(slot);
            if (now.flipX !== target.mirror) await clickTool(slot, MENU.flipHorizontal);
            now = readOrientation(slot);
            if (now.flipY) await clickTool(slot, MENU.flipVertical);
        } finally {
            closeMenus();
        }
        const end = readOrientation(slot);
        if (end.rotate !== target.rotate || end.flipX !== target.mirror || end.flipY) {
            throw new Error('IDS beklenen yöne getirilemedi');
        }
    }

    // ---------- Yön kararı ----------

    // Kliniğin kuralları:
    //  - Oklüzaller aynayla çekilir: kesiciler üst arkta yukarı ("n"), alt arkta aşağı
    //    ("u") gelecek şekilde döndürülür ve her zaman ayna görüntüsü alınır.
    //  - Ağız içi önden: üst çene yukarı gelecek şekilde döndürülür.
    //  - Bukkaller: üst çene yukarı gelecek şekilde döndürülür; bu durumda sağ bukkalde ön
    //    dişler sağda, sol bukkalde solda olmalıdır. Değilse kare karşı yuvaya aittir
    //    (fixBuccalSides yuvaları değiştirir; yapamazsa uyarı verilir).
    function decide(slot, item) {
        // Kuralla (ham kare) dikleştirilmiş ve doğrulanmış kare: yön kuraldan.
        if (item.viaRule && item.orient) return { rotate: item.orient.rotate, mirror: item.orient.mirror, raw: true, exifRotate: item.exifRotate || 0, warning: item.note || '' };
        const upper = SIDE[item.upper_jaw_side];
        const incisors = SIDE[item.incisors_side];
        const target = { rotate: 0, mirror: false, warning: item.note || '' };
        const warn = function (text) { target.warning = target.warning ? target.warning + '; ' + text : text; };
        if (slot === 'occlussal_upper' || slot === 'occlussal_lower') {
            if (incisors === undefined) return null;
            target.rotate = turn((slot === 'occlussal_upper' ? 0 : 180) - incisors);
            target.mirror = true;
            // Okuma ham kareden yapıldıysa döndürme de ham kareye göredir (EXIF geri alınır).
            if (item.occRaw) { target.raw = true; target.exifRotate = item.exifRotate || 0; }
        } else if (slot === 'labial_anterior') {
            if (upper === undefined) return null;
            target.rotate = turn(-upper);
        } else {
            // Üst çene her zaman yukarıda (kliniğin kuralı); yuvanın yanı ön dişlerin yönünden doğrulanır.
            // Eskiden döndürme ön dişleri yuvanın yanına çevirecek şekilde seçiliyordu; kare yanlış yuvadaysa
            // baş aşağı kalıyordu.
            const wanted = slot === 'buccal_right' ? 90 : 270;
            if (upper !== undefined) {
                target.rotate = turn(-upper);
                if (incisors === undefined) {
                    warn('ön dişlerin yönü okunamadı, sağ/sol kontrol edin');
                } else if (turn(incisors + target.rotate) !== wanted) {
                    warn('sağ/sol şüpheli, bu fotoğraf karşı yuvaya ait olabilir');
                }
            } else if (incisors !== undefined) {
                target.rotate = turn(wanted - incisors);
                warn('üst çenenin yönü okunamadı, kontrol edin');
            } else {
                return null;
            }
        }
        return target;
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(blob);
        });
    }

    // Modele IDS önizlemesinin ham hali gider (IDS'te uygulanmış döndürmeler hariç). Kırpma kaydı varsa orijinalin küçük karesi
    // (burun, çene, ekartör gibi ipuçları kalsın); yoksa önizlemenin kendisi.
    async function previewImage(slot) {
        const img = previewOf(slot);
        if (!img) return null;
        if (state.crop && state.crop.items && window.idsfyCrop) {
            try {
                const r = await resolveSlot(slot);
                if (r) return { slot: slot, media_type: 'image/jpeg', data: r.item.thumb, original: r.item.name };
            } catch (error) { /* önizlemeyle sürer */ }
        }
        const blob = await (await fetch(img.src, { credentials: 'include' })).blob();
        const type = ['image/jpeg', 'image/png', 'image/webp'].indexOf(blob.type) >= 0 ? blob.type : 'image/jpeg';
        return { slot: slot, media_type: type, data: await blobToBase64(blob) };
    }

    function askOrientation(images) {
        return new Promise(function (resolve, reject) {
            // Eklenti yenilenince açık sayfadaki eski betik arka planla konuşamaz.
            if (!chrome.runtime || !chrome.runtime.id) {
                return reject(new Error('Eklenti güncellendi; bu sayfayı yenileyin (F5).'));
            }
            chrome.runtime.sendMessage({ type: 'ids-orient', images: images }, function (reply) {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!reply || !reply.ok) return reject(new Error(reply ? reply.error : 'yanıt yok'));
                resolve(reply.items);
            });
        });
    }

    function describe(target) {
        const parts = [];
        if (target.rotate) parts.push(target.rotate + '° döndürüldü');
        if (target.mirror) parts.push('ayna görüntüsü alındı');
        return parts.length ? parts.join(', ') : 'yön doğru, dokunulmadı';
    }

    // ---------- Panel ----------

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function setStatus(text, isError) {
        const status = panel.querySelector('.idsfy-status');
        status.textContent = text;
        status.classList.toggle('idsfy-error', !!isError);
    }

    // IDS bir yuvaya "Görüntü çözünürlüğü, fotoğraf gerekliliklerini karşılamıyor" ünlemini koyduysa o yuvaların anahtarları
    // (karo içindeki Placeholder-<yuva> sınıfından). Ünlem karosu yalnız uyarı varken DOM'da bulunur.
    function idsResolutionWarnings() {
        const keys = [];
        document.querySelectorAll('[class*="Tile-warningIconWrap"]').forEach(function (icon) {
            const tile = icon.closest('[class*="Tile-photoTile"]');
            const holder = tile && tile.querySelector('[class*="Placeholder-placeholder"]');
            const m = holder && String(holder.className).match(/Placeholder-(profile_repose|frontal_repose|frontal_smiling|occlussal_upper|occlussal_lower|buccal_right|buccal_left|labial_anterior)\b/);
            if (m && keys.indexOf(m[1]) < 0) keys.push(m[1]);
        });
        return keys;
    }

    // Elle düzeltme düğmeleri: uyarılı ya da hatalı satırda ekranda görünen fotoğraf saat yönünde 90/180/270° döndürülür
    // (IDS'in döndürme düğmeleriyle); "sağ/sol şüpheli" uyarısında kare karşı bukkal yuvaya taşınır.
    function fixButtons(slotKey, result) {
        const bar = el('div', 'idsfy-fixbar');
        [90, 180, 270].forEach(function (deg) {
            const button = el('button', 'idsfy-mini', '↻ ' + deg + '°');
            button.type = 'button';
            button.title = 'Fotoğrafı ekranda göründüğü haliyle saat yönünde ' + deg + '° döndür';
            button.disabled = state.busy;
            button.addEventListener('click', function () { rotateBy(slotKey, deg); });
            bar.appendChild(button);
        });
        if (/^buccal_/.test(slotKey) && /sağ\/sol şüpheli/.test(result.warning || '')) {
            const move = el('button', 'idsfy-mini', 'Karşı yuvaya taşı');
            move.type = 'button';
            move.title = 'Bu fotoğrafı karşı bukkal yuvaya taşır (karşı yuva doluysa yer değiştirir), sonra yönleri yeniden düzeltir';
            move.disabled = state.busy;
            move.addEventListener('click', function () { moveToOpposite(slotKey); });
            bar.appendChild(move);
        }
        return bar;
    }

    // Ekranda görünen yöne göre döndürür. Ayna açıkken (oklüzaller) IDS'in döndürmesi aynalamadan önce uygulandığından
    // ekranda ters görünür: görünen saat yönü için dönüş eksi alınır.
    async function rotateBy(slotKey, degrees) {
        if (state.busy) return;
        state.busy = true;
        render();
        const label = SLOTS.find(function (s) { return s.key === slotKey; }).label;
        setStatus(label + ' ' + degrees + '° döndürülüyor…');
        try {
            const now = readOrientation(slotKey);
            if (!now) throw new Error('önizleme bulunamadı');
            await applyOrientation(slotKey, { rotate: turn(now.rotate + (now.flipX ? -degrees : degrees)), mirror: now.flipX });
            state.results[slotKey] = { ok: true, text: 'elle ' + degrees + '° döndürüldü', manual: true };
            setStatus(label + ' ' + degrees + '° döndürüldü.');
        } catch (error) {
            state.results[slotKey] = { ok: false, text: error.message };
            setStatus(label + ' döndürülemedi: ' + error.message, true);
        }
        state.busy = false;
        render();
    }

    // Bukkal fotoğrafı karşı yuvaya taşır: karşı yuva boşsa yükleyip kaynağı siler, doluysa yer değiştirir (kırpılmış dosyalar
    // kullanılır; eşlenemezse elle taşınmalıdır, IDS önizlemesinin düşük çözünürlüklü kopyası yüklenmez). Sonra yönler yeniden düzeltilir.
    async function moveToOpposite(slotKey) {
        if (state.busy) return;
        const other = slotKey === 'buccal_right' ? 'buccal_left' : 'buccal_right';
        state.busy = true;
        render();
        const label = function (key) { return SLOTS.find(function (s) { return s.key === key; }).label; };
        let moved = false;
        try {
            const mine = await cropItemOfSlot(slotKey);
            if (!mine) throw new Error('dosya eşlenemedi (klasör kaydı yok); elle taşıyın');
            if (!tileOf(other)) {
                setStatus(label(slotKey) + ' fotoğrafı ' + label(other) + ' yuvasına taşınıyor…');
                await uploadToEmptySlot(other, mine.file);
                await deleteSlot(tileOf(slotKey), slotKey);
            } else {
                const theirs = await cropItemOfSlot(other);
                if (!theirs || theirs === mine) throw new Error('karşı yuvadaki dosya eşlenemedi; elle değiştirin');
                setStatus(label(slotKey) + ' ve ' + label(other) + ' yer değiştiriyor…');
                await replaceInSlot(slotKey, theirs.file);
                await replaceInSlot(other, mine.file);
            }
            moved = true;
            if (state.crop) {
                state.crop.notes.push(mine.name + ': elle ' + label(other) + ' yuvasına taşındı');
                setNotes(state.crop.notes);
            }
        } catch (error) {
            state.results[slotKey] = { ok: false, text: error.message };
            setStatus(label(slotKey) + ' taşınamadı: ' + error.message, true);
        }
        state.busy = false;
        render();
        if (moved) await onFix(false);
    }

    // Notları ayarlar ve kapalı hale getirir; liste boşsa düğme gizlenir.
    function setNotes(list) {
        const bar = panel && panel.querySelector('.idsfy-notebar');
        if (!bar) return;
        const button = bar.querySelector('button');
        const box = bar.querySelector('.idsfy-notes');
        const lines = (list || []).filter(Boolean);
        box.textContent = lines.join(String.fromCharCode(10));
        box.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'ⓘ Notlar (' + lines.length + ')';
        bar.style.display = lines.length ? '' : 'none';
    }

    function render() {
        const list = panel.querySelector('.idsfy-list');
        list.textContent = '';
        ALL_KEYS.forEach(function (key) {
            const result = state.results[key];
            if (!result) return;
            const row = el('div', 'idsfy-row' + (result.ok ? '' : ' idsfy-row-error'));
            row.appendChild(el('span', 'idsfy-label', labelOfKey(key)));
            row.appendChild(el('span', 'idsfy-info', result.text));
            if (result.warning) row.appendChild(el('span', 'idsfy-warning', '⚠ ' + result.warning));
            if ((result.warning || !result.ok || result.manual) && previewOf(key)) row.appendChild(fixButtons(key, result));
            list.appendChild(row);
        });
        panel.querySelectorAll('.idsfy-button:not(.idsfy-stop)').forEach(function (button) {
            button.disabled = state.busy;
        });
        const stopButton = panel.querySelector('.idsfy-stop');
        if (stopButton) stopButton.textContent = state.stopped ? 'Devam et' : 'Durdur';
    }

    // Yüklemenin bittiği, IDS'in görüntü servisine attığı isteklerden anlaşılır: page.js
    // bırakmadan sonra başlayan ve süren istek sayılarını <html> özniteliklerine yazar.
    // İstekler başlamış, hiçbiri sürmüyor ve kısa bir süredir yenisi gelmiyorsa tüm
    // fotoğraflar yüklenmiş demektir; yönler o zaman düzeltilir.
    const QUIET_MS = 2500;
    const PLACED_STABLE_MS = 20000;
    const START_TIMEOUT_MS = 3 * 60000;
    const UPLOAD_TIMEOUT_MS = 20 * 60000;

    function uploadCounts() {
        const data = document.documentElement.dataset;
        return { started: Number(data.idsfyStarted || 0), pending: Number(data.idsfyPending || 0),
            failed: Number(data.idsfyFailed || 0) };
    }

    function previewsLoaded() {
        return SLOTS.every(function (slot) {
            const img = previewOf(slot.key);
            return !img || (img.complete && img.naturalWidth > 0);
        });
    }

    async function fixWhenUploaded(fileCount, explicit) {
        const began = Date.now();
        let quietSince = 0;
        let lastStarted = 0;
        let reconciled = false;
        let placedSince = 0;
        let placedCount = 0;
        let prefetched = false, preCount = 0, preSince = 0, uploadSeen = false;
        while (Date.now() - began < UPLOAD_TIMEOUT_MS) {
            await sleep(500);
            if (state.busy || (state.stopped && !explicit)) return;
            const now = uploadCounts();
            if (now.started && !uploadSeen) { uploadSeen = true; mark('IDS yüklemeye başladı'); }
            if (speedOn() && !prefetched) {
                const n = earlyCount();
                if (n !== preCount) { preCount = n; preSince = Date.now(); }
                else if (n > 0 && Date.now() - preSince >= 1500) { prefetched = true; mark('IDS yerleştirdi'); prefetch(); }
            }
            // IDS kareleri yerleştirmiş ama yükleme isteği gelmiyorsa (yerel önizlemeler; B,B denetimi, 30 Ekim 2026) yuvalar
            // PLACED_STABLE_MS boyunca değişmeden dolu kalınca yine sürülür: "Değiştir" ile konan kareler yüklemeyi başlatır.
            const filledNow = document.querySelectorAll('input[type="file"][id$="-uploaded-photo-input"]').length;
            if (!now.started && filledNow > 0 && previewsLoaded()) {
                if (filledNow !== placedCount) { placedCount = filledNow; placedSince = Date.now(); }
                if (Date.now() - placedSince >= PLACED_STABLE_MS) {
                    if (!reconciled) {
                        reconciled = true;
                        if (await fillEmptySlots()) { placedSince = 0; placedCount = 0; continue; }
                    }
                    askCrop(await onFix(!explicit));
                    return;
                }
                setStatus('IDS ' + filledNow + ' yuvayı doldurdu; yükleme bekleniyor…');
                continue;
            }
            if (!now.started) {
                // IDS önce tüm kareleri sınıflandırır; yükleme istekleri ondan sonra başlar.
                if (Date.now() - began > START_TIMEOUT_MS) {
                    setStatus('IDS hiçbir fotoğrafı yuvalara yerleştirmedi (yuvalar doluysa yerleştirmez). ' +
                        'Gerekirse "2. Yönleri düzelt"e basın.', true);
                    return;
                }
                setStatus(fileCount
                    ? fileCount + ' fotoğraf IDS\'e bırakıldı; IDS sınıflandırıyor…'
                    : 'Fotoğraf yüklemesi bekleniyor (klasörden ya da elle)…');
                continue;
            }
            if (now.pending > 0 || now.started !== lastStarted || !previewsLoaded()) {
                lastStarted = now.started;
                quietSince = 0;
                setStatus('IDS fotoğrafları yüklüyor…');
                continue;
            }
            if (!quietSince) quietSince = Date.now();
            if (Date.now() - quietSince >= QUIET_MS) {
                // Yükleme durulunca bir kez: IDS'in boş bıraktığı yuvalar yerleşmeyen karelerle doldurulur; yüklendiyse
                // yeni yüklemelerin bitmesi yeniden beklenir.
                if (!reconciled) {
                    reconciled = true;
                    if (await fillEmptySlots()) { quietSince = 0; lastStarted = 0; continue; }
                }
                if (now.failed) setStatus('Bazı yükleme istekleri başarısız oldu; yuvaları kontrol edin.', true);
                mark('yükleme bitti');
                askCrop(await onFix(!explicit));
                return;
            }
        }
        setStatus('Yükleme çok uzun sürdü; bitince "2. Yönleri düzelt"e basın.', true);
    }

    // explicit: kullanıcı düğmeye bastı; "Durdur" açık olsa da yüklenir ve yönler düzeltilir (yalnızca "İleri"ye basılmaz).
    // Orijinaller olduğu gibi IDS'e bırakılır (IDS'in sınıflandırıcısı ve yön okuması kırpılmamış kareyle çok daha isabetli;
    // kullanıcı gözlemi, 30 Ekim 2026). Kırpma ve yön düzeltmesi yerleştirmeden sonra yapılır (onFix). Önce küçük kareler ve
    // imzalar hazırlanır (model ve eşleştirme için); klasördeki dosyalar değişmez.
    async function onFolder(fileList, bridge, explicit) {
        const files = Array.from(fileList).filter(function (f) {
            return /\.(jpe?g|png)$/i.test(f.name);
        });
        if (!files.length) {
            setStatus('Klasörde JPG/PNG bulunamadı.', true);
            return;
        }
        if (state.preparing) {
            setStatus('Fotoğraflar hâlâ hazırlanıyor; bekleyin.');
            return;
        }
        state.crop = null;
        state.cropReady = null;
        state.dropAt = Date.now();
        state.marks = [];
        setNotes([]);
        try { localStorage.removeItem(processedKey()); } catch (error) { /* yok */ }
        if (window.idsfyCrop && await cropEnabled()) {
            state.preparing = true;
            state.cropReady = (async function () {
                try {
                    const began = Date.now();
                    // Hızlandırma: hazır olan her 6 kare hemen sınıflandırmaya gider (hepsinin hazırlanması beklenmez; 2-3 sn).
                    // Doğrudan yerleştirmede IDS orijinalleri yüklemediği için bellek baskısı eski endişe değil.
                    const runs = [];
                    let batch = [];
                    const flush = function () { if (!batch.length) return; const list = batch; batch = []; const run = window.idsfyCrop.classify(list, function () {}); run.catch(function () {}); runs.push(run); };
                    const early = speedOn() && directOn() && window.idsfyCrop.classify;
                    // Yön okumaları da etiketleri beklemeden, kare hazır olur olmaz başlar (yüz kareleri de okunur: set başına +10-20
                    // Sonnet çağrısı; dalga ~2 sn erken biter). planDirect aynı anahtarı ('pose|ad') kullanır.
                    const pres = {};
                    let posed = 0;
                    const startPose = function (it) { if (posed >= 30) return; posed++; const p = window.idsfyCrop.readPose(it, 'occlusal', true); p.catch(function () {}); pres['pose|' + it.name] = p; };
                    const items = await window.idsfyCrop.prepare(files, setStatus, early ? function (it) { batch.push(it); if (batch.length >= 6) flush(); startPose(it); } : null);
                    if (early) flush();
                    state.crop = { originals: files, items: items, notes: [], placed: {}, labelOf: null, pre: pres, labelRuns: runs,
                        timing: { prepare: Math.round((Date.now() - began) / 1000) } };
                    mark('hazırlık bitti');
                } catch (error) {
                    setStatus('Fotoğraflar hazırlanamadı (' + error.message + '); kırpma yapılmayacak.', true);
                    await sleep(1500);
                } finally {
                    state.preparing = false;
                }
            })();
            // Hazırlık bırakmadan önce bitirilir: IDS 20+ tam boy kareyi işlerken aynı anda çözmek sekmeyi bellekten düşürdü
            // (Mutigulina 21 kare, 0,6 GB boş RAM; 6 Kasım 2026). Örtüşmenin kazancı ~2 sn idi.
            await state.cropReady;
        }
        if (state.crop && directOn()) {
            let direct = false;
            try { direct = await onDirect(explicit); } catch (error) { state.crop.notes.push('Doğrudan yerleştirme hata verdi (' + error.message + ')'); }
            if (direct) return;
            setNotes(state.crop.notes);
        }
        const transfer = new DataTransfer();
        files.forEach(function (f) { transfer.items.add(f); });
        bridge.files = transfer.files;
        delete bridge.dataset.result;
        document.dispatchEvent(new CustomEvent('idsfy-drop'));
        const result = bridge.dataset.result || 'error:sayfa köprüsü yanıt vermedi (sayfayı yenileyin)';
        if (result.indexOf('ok:') === 0) {
            setStatus(files.length + ' fotoğraf IDS\'e bırakıldı; IDS sınıflandırıyor…');
            fixWhenUploaded(files.length, explicit);
        } else {
            setStatus('Hata: ' + result.slice(6), true);
        }
    }

    // ---------- Yuva düzeltmeleri ----------

    const ALL_KEYS = ['profile_repose', 'frontal_repose', 'frontal_smiling', 'occlussal_upper', 'occlussal_lower', 'buccal_right', 'labial_anterior', 'buccal_left'];
    const KEY_LABELS = { profile_repose: 'Profil', profile_smiling: 'Gülen profil', frontal_repose: 'Önden yüz', frontal_smiling: 'Gülümseme' };
    SLOTS.forEach(function (s) { KEY_LABELS[s.key] = s.label; });
    function labelOfKey(key) { return KEY_LABELS[key] || key; }
    function isIntraoral(key) { return SLOTS.some(function (s) { return s.key === key; }); }

    // Ham karede üst çeneyi yukarı alan döndürmeden sonra ön dişler sağdaysa sağ bukkal, soldaysa sol bukkaldir
    // (kliniğin kuralı; fotoğraflar aynasız çekilir). Belirsizse null.
    function buccalSideOf(item) {
        const upper = SIDE[item.upper_jaw_side];
        const incisors = SIDE[item.incisors_side];
        if (upper === undefined || incisors === undefined) return null;
        const after = turn(incisors - upper);
        return after === 90 ? 'buccal_right' : after === 270 ? 'buccal_left' : null;
    }

    // Adaylar arasından en net ve pozlaması dengeli olan (item.score, crop.js qualityScore); eşitse ilk.
    function bestOf(list) {
        let best = null;
        list.forEach(function (it) {
            if (!best || (Number(it.score) || 0) > (Number(best.score) || 0)) best = it;
        });
        return best;
    }

    // Yuvanın türü: oklüzal (üst/alt), bukkal (sağ/sol) ya da önden ağız içi.
    function slotKind(slot) {
        return /^occlussal_/.test(slot) ? 'occlusal' : /^buccal_/.test(slot) ? 'buccal' : slot;
    }

    // Hangi kareler hangi yuvaya girmeli (saf planlama; test edilebilir). slots[anahtar] = { filled: IDS yuvayı
    // doldurmuş, labels: yuvadaki karenin (ikizlerse tüm ikizlerin) etiketleri (eşleşmediyse yok), names: yuvadaki karenin
    // (ikizlerin) adları }; items: etiketli kareler (slot = hedef yuva). Dönüş: { deletes: [anahtar], uploads: [{ key, item }] }.
    // HİÇBİR ŞEY SİLİNMEZ: IDS'in seçimleri büyük çoğunlukla doğru. deletes yalnız UYARI içindir: farklı türde görünen karelerin
    // yuvaları. Yalnızca gerçekten boş kalan yuvaya, hedefi o yuva olan, henüz yerleşmemiş (en iyi) kare yüklenir.
    function planSlots(keys, slots, items) {
        const placed = {};
        const deletes = keys.filter(function (key) {
            const s = slots[key];
            if (!(s && s.filled && s.labels && s.labels.length)) return false;
            const kinds = s.labels.map(slotKind).filter(function (k, i, all) { return all.indexOf(k) === i; });
            return kinds.length === 1 && kinds[0] !== slotKind(key);
        });
        keys.forEach(function (key) {
            const s = slots[key];
            if (s && s.filled) (s.names || []).forEach(function (name) { placed[name] = true; });
        });
        const uploads = [];
        keys.forEach(function (key) {
            const s = slots[key];
            if (s && s.filled) return;
            const item = bestOf(items.filter(function (it) { return it.slot === key && !placed[it.name]; }));
            if (item) { placed[item.name] = true; uploads.push({ key: key, item: item }); }
        });
        return { deletes: deletes, uploads: uploads };
    }

    // Yuvadaki önizleme hangi orijinal? Önce bu oturumda o yuvaya bizim koyduğumuz kare (önizleme adresi aynıysa), yoksa imzayla
    // orijinaller arasından; benzer çekimler (ikizler) grup olarak döner, en net olan seçilir. Dönüş { item, shown, group, ours } ya da null.
    async function resolveSlot(key) {
        const crop = state.crop;
        const img = previewOf(key);
        if (!crop || !crop.items || !window.idsfyCrop || !img) return null;
        const known = crop.placed[key];
        if (known && known.src === img.src) return { item: known.item, shown: known.item, group: [known.item], ours: true };
        const blob = await (await fetch(img.src, { credentials: 'include' })).blob();
        const ranked = await window.idsfyCrop.matchRanked(blob, crop.items);
        if (!ranked.length) return null;
        const group = ranked.filter(function (r) { return r.d < ranked[0].d + 3 && r.d <= 10; }).map(function (r) { return r.item; });
        if (!group.length) group.push(ranked[0].item);
        return { item: bestOf(group), shown: ranked[0].item, group: group, ours: false };
    }

    // Yuvadaki karenin orijinali ({name, file, thumb, ...}); eşlenemezse null.
    async function cropItemOfSlot(key) {
        const r = await resolveSlot(key);
        return r ? r.item : null;
    }

    function previewReady(key) {
        const img = previewOf(key);
        return !!(img && img.complete && img.naturalWidth > 0);
    }

    // Boş yuvanın dosya girişine doğrudan yükler (IDS sınıflandırmayı atlar); önizleme gelene kadar bekler.
    async function uploadToEmptySlot(key, file) {
        const input = document.querySelector('input[type="file"][id$="-' + key + '-uploader-input"]');
        if (!input) throw new Error('boş yuva girişi bulunamadı');
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (!(await waitFor(function () { return previewReady(key); }, 60000))) throw new Error('yükleme tamamlanmadı');
        await sleep(600);
    }

    // İşleri sırayla çalıştırır (biri bitmeden sıradaki başlamaz); hata zinciri bozmaz.
    function serial() {
        let tail = Promise.resolve();
        return function (fn) {
            const run = tail.then(function () { return fn(); });
            tail = run.catch(function () {});
            return run;
        };
    }
    // Menü tıklamaları aynı anda yapılamaz (tek açık menü); IDS'in yüklemeyi işlemesi beklenirken kilit bırakılır.
    const domLock = serial();
    // En çok n iş aynı anda (sıra korunur).
    function limited(n) {
        let active = 0;
        const queue = [];
        const next = function () {
            if (active >= n || !queue.length) return;
            active++;
            const job = queue.shift();
            Promise.resolve().then(job.fn).then(job.resolve, job.reject).then(function () { active--; next(); });
        };
        return function (fn) { return new Promise(function (resolve, reject) { queue.push({ fn: fn, resolve: resolve, reject: reject }); next(); }); };
    }
    // Tam boyutlu kare çözme bellek ister: kırpmalar en çok ikişer (tek tek iken 8 yuvada ~10 sn sıra bekleniyordu; 6 Kasım 2026).
    const cropLock = speedOn() ? limited(2) : serial();

    // Dolu yuvadaki fotoğrafı kalem menüsündeki "Değiştir" girişiyle yenisiyle değiştirir (silmeden). Menü adımı kilit altında;
    // IDS'in yüklemesi kilit dışında beklenir, böylece başka yuvaların değişimi örtüşebilir (6 Kasım 2026: yüz yuvalarında IDS
    // yanıtı 18-32 sn sürüyor, yuvalar sırayla beklenince ağız içi işler de bekliyordu).
    // Başka bir yuvanın yüklemesi bitip IDS ızgarayı yeniden çizerse açılan menü kaybolabiliyor (Aysun 8507: "Değiştir girişi
    // bulunamadı"); menü adımı yuva her seferinde yeniden bulunarak 3 kez denenir.
    const replaceTimes = {};
    async function replaceInSlot(key, file) {
        const t0 = Date.now();
        let t1 = 0;
        const settle = await domLock(async function () {
            t1 = Date.now();
            for (let attempt = 1; ; attempt++) {
                try { return await startReplace(key, file); } catch (error) {
                    if (attempt >= 3 || !/girişi bulunamadı|düğmesi bulunamadı/.test(error.message)) throw error;
                    closeMenus();
                    await sleep(1500);
                }
            }
        });
        const t2 = Date.now();
        await settle();
        replaceTimes[key] = 'kilit ' + ((t1 - t0) / 1000).toFixed(1) + ' menü ' + ((t2 - t1) / 1000).toFixed(1) + ' IDS ' + ((Date.now() - t2) / 1000).toFixed(1);
    }

    async function startReplace(key, file) {
        const tile = tileOf(key);
        const pencil = tile && tile.querySelector('[class*="UploadedPhoto-editButton"]');
        if (!pencil) throw new Error('düzenle düğmesi bulunamadı');
        const before = previewOf(key);
        const beforeSrc = before ? before.src : '';
        closeMenus();
        await sleep(200);
        pencil.click();
        const input = await waitFor(function () {
            return document.querySelector('input[type="file"][id$="-' + key + '-dropdown-input"]');
        }, 4000);
        if (!input) { closeMenus(); throw new Error('"Değiştir" girişi bulunamadı'); }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);
        closeMenus();
        await sleep(200);
        return async function () {
            const done = await waitFor(function () {
                const img = previewOf(key);
                return img && img.src !== beforeSrc && img.complete && img.naturalWidth > 0;
            }, 120000);
            if (!done) throw new Error('IDS fotoğrafı değiştirmedi');
            await sleep(800);
        };
    }

    // Hiçbir yuvada olmayan orijinaller (ikizler yerleşmiş sayılır).
    async function unplacedItems() {
        const crop = state.crop;
        const placed = {};
        for (const key of ALL_KEYS) {
            if (!tileOf(key)) continue;
            let r = null;
            try { r = await resolveSlot(key); } catch (error) { r = null; }
            if (r) r.group.forEach(function (it) { placed[it.name] = true; });
        }
        return crop.items.filter(function (it) { return !placed[it.name]; });
    }

    // Yerleşmemiş karelerin etiketleri; bir kez sınıflandırılır, oturum boyunca saklanır. Dönüş { ad: yuva }.
    async function ensureLabels(items, quiet) {
        const crop = state.crop;
        if (!crop.labelOf) crop.labelOf = {};
        // Erken okumada başlamış sınıflandırma sürüyorsa önce o beklenir (aynı kareler iki kez sorulmaz).
        while (crop.labelWait) { const w = crop.labelWait; await w.catch(function () {}); if (crop.labelWait === w) crop.labelWait = null; }
        // Hazırlıkla örtüşen erken sınıflandırmalar.
        if (crop.labelRuns && crop.labelRuns.length) {
            const runs = crop.labelRuns;
            crop.labelRuns = [];
            const results = await Promise.all(runs.map(function (r) { return r.catch(function () { return {}; }); }));
            results.forEach(function (l) { Object.keys(l || {}).forEach(function (name) { if (!(name in crop.labelOf)) crop.labelOf[name] = l[name]; }); });
        }
        const missing = items.filter(function (it) { return !(it.name in crop.labelOf); });
        if (missing.length) {
            const run = window.idsfyCrop.classify(missing, quiet ? function () {} : setStatus);
            crop.labelWait = run;
            try { Object.assign(crop.labelOf, await run); } finally { if (crop.labelWait === run) crop.labelWait = null; }
        }
        return crop.labelOf;
    }

    // ---------- Doğrudan yerleştirme (0.33.7 deneme) ----------
    // Orijinaller IDS'e bırakılmaz: kareler eklentinin sınıflandırmasıyla seçilir, kırpılıp düzeltilir ve boş yuvaların dosya girişine
    // doğrudan yüklenir. IDS'in 17-22 orijinali sınıflandırıp yüklemesi (12-39 sn) ve ikinci yükleme ("Değiştir") atlanır. Sağ/sol ve
    // üst/alt, eskisi gibi yön okumalarıyla doğrulanır (sanal takas). Kapatmak: sayfada localStorage.idsfyDirect = '0'.
    function directOn() { try { return localStorage.getItem('idsfyDirect') !== '0'; } catch (error) { return true; } }

    // Etiketlerden yuva planı: { yuva: { item, shown, group, ours } }; hiç kare seçilemezse null.
    async function planDirect(crop) {
        const labels = await ensureLabels(crop.items, true);
        mark('etiketler hazır');
        const byLabel = {};
        crop.items.forEach(function (it) { const l = labels[it.name] || 'other'; (byLabel[l] = byLabel[l] || []).push(it); });
        const used = {};
        const placed = {};
        const wrap = function (it) { return { item: it, shown: it, group: [it], ours: true }; };
        const pick = function (list) { return bestOf((list || []).filter(function (it) { return !used[it.name]; })); };
        const put = function (key, it) { if (!it) return false; used[it.name] = true; placed[key] = wrap(it); return true; };
        const notes = crop.notes;
        const byScore = function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0); };
        // Etiket yalnız aday havuzunu belirler; yuva kararı okumalardan: yüzler için seçici çağrısı, bukkal/ön için A/B dik okumasındaki
        // kesici yanı (sağda = sağ bukkal, yok = ön), oklüzal için çene okuması (damak/dil). Okumalar onFix'te yeniden kullanılır (crop.pre).
        const faceCands = crop.items.filter(function (it) { return /^(profile|frontal)_/.test(labels[it.name] || ''); }).sort(byScore).slice(0, 12);
        // Her etiketten en net 3 aday okunur (Salar: 8 oklüzal + 6 bukkal adayı 21 sn sürmüştü).
        const topOf = function (re, n) { const out = []; Object.keys(byLabel).filter(function (l) { return re.test(l); }).forEach(function (l) { byLabel[l].slice().sort(byScore).slice(0, n).forEach(function (it) { out.push(it); }); }); return out; };
        // Ön adaylar 4 (klinikte kapanış ve ağız açık ön kareler birlikte çekiliyor; en net 3'ü hep açık kareler olabiliyordu).
        // 'other' etiketli kareler dik okumaya girmez (röntgen/0195 gibi kareler hakeme düşüp dalgayı 8 sn uzatıyordu, 7 Kasım 2026);
        // bukkal yuvası boş kalırsa yedek aşama yön okuması 'bukkal' diyenleri okur.
        const intraCands = topOf(/^labial_/, 4).concat(topOf(/^buccal_/, 3));
        const occCands = topOf(/^occlussal_/, 3);
        // Yön okuması baştan yüz olmayan tüm karelere (en çok 14), hepsi aynı anda: yedek bukkal/oklüzal havuzları ardışık 10-15 sn
        // sürüyordu (Salar, Balaban, 7 Kasım 2026). Oklüzal adaylar her durumda okunur.
        const poseAll = crop.items.filter(function (it) { return !/^(profile|frontal)_/.test(labels[it.name] || ''); }).sort(byScore).slice(0, 18);
        occCands.forEach(function (it) { if (poseAll.indexOf(it) < 0) poseAll.push(it); });
        // Opus oklüzal kümesi tahminle hemen başlar (oklüzal etiketli en net 6): bugüne dek yön okumalarını bekliyordu (~7 sn).
        const specOcc = topOf(/^occlussal_/, 6).sort(byScore).slice(0, 6);
        const specWork = specOcc.length >= 2 ? window.idsfyCrop.readArchSet(specOcc).catch(function () { return null; }) : Promise.resolve(null);
        // Bukkal kümesi de tahminle dalgayla birlikte (bukkal etiketli en net 4): tek kare okuması baş aşağı çekilmiş bukkalde yanılıyor
        // (Demirtaş 0545/0546/0547 üçü de "kesiciler sağda" okundu, sağ yuvaya sol bukkal kondu, 7 Kasım 2026); küme sağ ve sol bulursa
        // yan kararı kümeden.
        const specBucc = topOf(/^buccal_/, 4).sort(byScore).slice(0, 4);
        const specBuccWork = specBucc.length >= 2 ? window.idsfyCrop.readBuccalSet(specBucc).catch(function () { return null; }) : Promise.resolve(null);
        crop.buccSetWork = specBuccWork; crop.specBucc = specBucc;
        if (!crop.pre) crop.pre = {};
        const pre = function (key, fn) { if (!crop.pre[key]) { const p = fn(); p.catch(function () {}); crop.pre[key] = p; } return crop.pre[key]; };
        const faceWork = faceCands.length ? window.idsfyCrop.pickFaces(faceCands).catch(function () { return null; }) : Promise.resolve(null);
        const upWork = Promise.all(intraCands.map(function (it) { return pre('up|thumb|' + it.name, function () { return window.idsfyCrop.readRawUpright(it, 'thumb'); }).catch(function () { return null; }); }));
        // Orta kesit okumaları da şimdi başlar (onFix bunları da kullanır; yön adımı sıfıra yakın iner).
        intraCands.forEach(function (it) { pre('up|center|' + it.name, function () { return window.idsfyCrop.readRawUpright(it, 'center'); }); });
        const occWork = Promise.all(occCands.map(function (it) { return pre('pose|' + it.name, function () { return window.idsfyCrop.readPose(it, 'occlusal', true); }).catch(function () { return null; }); }));
        const poseWork = Promise.all(poseAll.map(function (it) { return pre('pose|' + it.name, function () { return window.idsfyCrop.readPose(it, 'occlusal', true); }).catch(function () { return null; }); }));
        // Ön adaylar birlikte: hangisi kapanışta (tek kare okuması dar aralığı kaçırıyordu).
        const labialCands = intraCands.filter(function (it) { return /^labial_/.test(labels[it.name] || ''); });
        const biteWork = labialCands.length >= 2 ? window.idsfyCrop.readBiteSet(labialCands).catch(function () { return {}; }) : Promise.resolve({});
        // Alt dalgaların bitiş anları (hızlandırma ölçümü).
        const timed = function (name, p) { return p.then(function (v) { mark(name); return v; }); };
        const all = await Promise.all([timed('yüz seçici', faceWork), timed('A/B dik', upWork), occWork, timed('kapanış kümesi', biteWork), timed('yön okumaları', poseWork), timed('oklüzal kümesi (tahmin)', specWork)]);
        const faces = all[0], ups = all[1], occs = all[2], biteSet = all[3] || {}, poses = all[4], specAns = all[5];
        const poseOf = {}, poseView = {};
        poseAll.forEach(function (it, i) { poseOf[it.name] = poses[i] || null; poseView[it.name] = poses[i] ? poses[i].view : null; });
        mark('yerleşim okumaları bitti');
        // Yüzler: seçici; karar yoksa etiket.
        FACE_KEYS.forEach(function (key) {
            const it = faces && faces[key];
            if (it && !used[it.name] && put(key, it)) return;
            if (put(key, pick(byLabel[key]))) { if (faces) notes.push(labelOfKey(key) + ': seçici uygun kare görmedi, etikete göre ' + placed[key].item.name + ' kondu; kontrol edin'); return; }
            if (key === 'profile_repose' && put(key, pick(byLabel.profile_smiling))) notes.push(placed[key].item.name + ': dinlenme profili yok, gülen profil kondu');
        });
        if (faces && faces.reason) notes.push('Yüz seçimi: ' + faces.reason);
        // Yüz kutuları da şimdi okunur (onFix başında okunuyordu; yüz kırpmaları ~3 sn erken başlar, kırpma sırası erken boşalır).
        const faceEntries = FACE_KEYS.filter(function (k) { return placed[k]; }).map(function (k) { return { item: placed[k].item, slot: k }; });
        if (faceEntries.length) pre(faceBoxKey(faceEntries), function () { return window.idsfyCrop.readBoxes(faceEntries, function () {}); });
        // (1) Yüz kareleri planlama sürerken kırpılıp yuvaya yüklenir (düzeltme adımındaki 8 kırpmanın 3'ü; kuyruk erken boşalır).
        // onFix'teki placeCropped hazır sonucu kullanır; yükleme olmazsa yeniden kırpar.
        if (speedOn()) {
            crop.faceEarly = crop.faceEarly || {};
            const fbKey = faceBoxKey(faceEntries);
            faceEntries.forEach(function (e) {
                const key = e.slot;
                if (tileOf(key) || !document.querySelector('input[type="file"][id$="-' + key + '-uploader-input"]')) return;
                const p = (async function () {
                    const t0 = Date.now();
                    const b = await crop.pre[fbKey];
                    const model = b && b.byName ? (b.byName[e.item.name] || null) : null;
                    const out = await cropLock(function () { return window.idsfyCrop.cropFor(e.item, key, model, { rotate: 0, mirror: false, warning: '' }, false); });
                    const t1 = Date.now();
                    await uploadDirect(key, out.file);
                    return { out: out, crop: (t1 - t0) / 1000, upload: (Date.now() - t1) / 1000 };
                })();
                p.catch(function () {});
                crop.faceEarly[key] = p;
            });
        }
        // Bukkal ve ön: dik karede kesiciler sağda → sağ bukkal, solda → sol bukkal, yok → ön.
        const sideOf = {};
        const biteOf = {};
        intraCands.forEach(function (it, i) { const r = ups[i]; sideOf[it.name] = r ? (r.incisors || 'frontal') : null; biteOf[it.name] = biteSet[it.name] || (r ? r.bite : null); });
        // Etiket ön/bukkal dese de yön okuması (iki uyuşan okuma) 'oklüzal' diyen kare ön/bukkal adayı değildir (Ferit 0212/0213 bukkal
        // etiketlenip dik okumaya girmiş, oklüzal havuzundan düşünce alt yuvaya üst oklüzal konmuştu, 7 Kasım 2026).
        intraCands.forEach(function (it) { if (poseView[it.name] === 'occlusal') { sideOf[it.name] = null; notes.push(it.name + ': etiketi ' + labelOfKey(labels[it.name] || 'other') + ', yön okuması oklüzal dedi; ön/bukkal adayı sayılmadı'); } });
        const biteName = function (it) { return biteOf[it.name] === 'closed' ? ' kapanış' : biteOf[it.name] === 'open' ? ' ağız açık' : ''; };
        const bestWhere = function (list, test) { return bestOf(list.filter(function (it) { return !used[it.name] && test(it); })); };
        notes.push('Bukkal/ön adayları: ' + intraCands.map(function (it) { return it.name.replace(/^2Y6A/, '') + ' ' + labelOfKey(labels[it.name]) + ' → ' + (sideOf[it.name] === 'frontal' ? 'ön' : sideOf[it.name] ? 'kesiciler ' + (sideOf[it.name] === 'right' ? 'sağda' : 'solda') : 'okunamadı') + biteName(it); }).join(', '));
        // Kapanıştaki kare yeğlenir (Ferit, Demirtaş, Çakır, Salar, Balaban, Satoğlu'nda ağız açık ön kare seçilmişti, 7 Kasım 2026);
        // kapanış okunamayan kare ikinci, ağız açık kare son sırada ve notla.
        const closedFirst = function (test) { return bestWhere(intraCands, function (it) { return test(it) && biteOf[it.name] === 'closed'; }) || bestWhere(intraCands, function (it) { return test(it) && biteOf[it.name] !== 'open'; }) || bestWhere(intraCands, test); };
        // (2) Ön/bukkal kutu okumaları bukkal kümesi beklenmeden, tek kare okumalarına göre olası karelerle başlar; küme karşı yanı
        // derse anahtar tutmaz, onFix yeniden okur.
        if (speedOn()) {
            const guess = {};
            const gL = closedFirst(function (it) { return labels[it.name] === 'labial_anterior' && sideOf[it.name] !== 'left' && sideOf[it.name] !== 'right'; });
            const gR = closedFirst(function (it) { return sideOf[it.name] === 'right'; });
            const gLf = closedFirst(function (it) { return sideOf[it.name] === 'left'; });
            if (gL) guess.labial_anterior = wrap(gL);
            if (gR) guess.buccal_right = wrap(gR);
            if (gLf) guess.buccal_left = wrap(gLf);
            prefetchBoxes(guess);
        }
        // Bukkal kümesi en çok 1 sn beklenir (Opus 7-18 sn sürebiliyor); gelmezse tek kare okumaları, yuva boş kalırsa yedek aşama aynı
        // okumayı bekler (7 Kasım: 3 sn idi).
        let buccSetLate = false;
        const specBuccAns = (await Promise.race([specBuccWork, new Promise(function (resolve) { setTimeout(function () { buccSetLate = true; resolve(null); }, 1000); })])) || {};
        mark(buccSetLate ? 'bukkal kümesi beklenmedi' : 'bukkal kümesi (tahmin)');
        // Küme hem sağ hem sol bulduysa (yön okuması oklüzal demeyen karelerde) yan kararı kümeden; kapanış yeğlenir.
        const bSide = function (it) { return specBuccAns[it.name] && poseView[it.name] !== 'occlusal' ? specBuccAns[it.name].side : null; };
        const closedFirstIn = function (list, test) { return bestWhere(list, function (it) { return test(it) && biteOf[it.name] === 'closed'; }) || bestWhere(list, function (it) { return test(it) && biteOf[it.name] !== 'open'; }) || bestWhere(list, test); };
        if (specBucc.some(function (it) { return bSide(it) === 'right'; }) && specBucc.some(function (it) { return bSide(it) === 'left'; })) {
            crop.setOrient = crop.setOrient || {}; crop.setSide = crop.setSide || {};
            specBucc.forEach(function (it) { const a = specBuccAns[it.name]; if (a) { crop.setOrient[it.name] = a.upsideDown ? 'bottom' : 'top'; crop.setSide[it.name] = a.side; } });
            notes.push('Bukkal küme okuması: ' + specBucc.map(function (it) { const a = specBuccAns[it.name]; return it.name.replace(/^2Y6A/, '') + ' ' + (a ? (a.side === 'right' ? 'sağ' : 'sol') + (a.upsideDown ? ' (baş aşağı çekilmiş)' : '') : '?'); }).join(', '));
            ['buccal_right', 'buccal_left'].forEach(function (key) {
                const want = key === 'buccal_right' ? 'right' : 'left';
                if (put(key, closedFirstIn(specBucc, function (it) { return bSide(it) === want; })) && sideOf[placed[key].item.name] && sideOf[placed[key].item.name] !== want) notes.push(placed[key].item.name + ': küme okuması ' + (want === 'right' ? 'sağ' : 'sol') + ' dedi (tek kare okuması ' + (sideOf[placed[key].item.name] === 'right' ? 'sağ' : sideOf[placed[key].item.name] === 'left' ? 'sol' : 'ön') + ' demişti), ' + labelOfKey(key) + ' yuvasına kondu');
            });
            if (placed.buccal_right && placed.buccal_left) { placed.buccal_right.pairDecided = true; placed.buccal_left.pairDecided = true; }
        }
        // Küme yerleştirdiyse üzerine yazılmaz (put boş yuva denetimi yapmaz; Demirtaş 8 Kasım: kümenin koyduğu 0547 tek kare okumasıyla 0546 ile ezilmişti).
        if (!placed.buccal_right) put('buccal_right', closedFirst(function (it) { return sideOf[it.name] === 'right'; }));
        if (!placed.buccal_left) put('buccal_left', closedFirst(function (it) { return sideOf[it.name] === 'left'; }));
        if (!placed.labial_anterior) put('labial_anterior', closedFirst(function (it) { return labels[it.name] === 'labial_anterior' && sideOf[it.name] !== 'left' && sideOf[it.name] !== 'right'; }));
        ['labial_anterior', 'buccal_right', 'buccal_left'].forEach(function (key) { if (placed[key] && biteOf[placed[key].item.name] === 'open') notes.push(labelOfKey(key) + ': kapanışta kare bulunamadı, ağız açık kare ' + placed[key].item.name + ' kondu; kontrol edin'); });
        ['buccal_right', 'buccal_left'].forEach(function (key) {
            if (!placed[key] && put(key, pick(byLabel[key]))) notes.push(labelOfKey(key) + ': yön okuması yanı belirleyemedi, etikete göre ' + placed[key].item.name + ' kondu');
        });
        // Bukkal yuvası boş kaldıysa: etiketi bukkal olmayan kalan ağız içi/other karelerde (en net 4) yön okuması 'buccal' diyorsa ve
        // dik okuma yanı veriyorsa oraya konur (Ensar Budak: karanlık bukkaller etiketlenemedi, 6 Kasım 2026).
        if (!placed.buccal_right || !placed.buccal_left) {
            // Oklüzal etiketli ama yön okuması 'buccal' diyen ya da hiç okunmamış (ilk 3'e girmeyen) kareler de aday (Ezgisu Genç: bukkaller
            // 'alt oklüzal' etiketlendi; Enes Salar 7 Kasım: sol bukkal oklüzal etiketlenip ilk 3'e girmeyince yuva boş kaldı).
            // Oklüzal etiketi olmayanlar önce (Salar: okunmamış üst oklüzaller havuzu doldurup 1546'yı dışarıda bırakmıştı), en çok 12.
            const viewOf = Object.assign({}, poseView);
            const rest = crop.items.filter(function (it) { return !used[it.name] && !/^(profile|frontal)_/.test(labels[it.name] || '') && sideOf[it.name] === undefined && (!/^occlussal_/.test(labels[it.name] || '') || viewOf[it.name] !== 'occlusal'); }).sort(function (x, y) { const ox = /^occlussal_/.test(labels[x.name] || '') ? 1 : 0, oy = /^occlussal_/.test(labels[y.name] || '') ? 1 : 0; return ox - oy || byScore(x, y); }).slice(0, 12);
            if (rest.length) {
                const views = await Promise.all(rest.map(function (it) { return pre('pose|' + it.name, function () { return window.idsfyCrop.readPose(it, 'buccal', true); }).catch(function () { return null; }); }));
                const bucc = rest.filter(function (it, i) { return views[i] && views[i].view === 'buccal'; });
                const sides = await Promise.all(bucc.map(function (it) { return pre('up|thumb|' + it.name, function () { return window.idsfyCrop.readRawUpright(it, 'thumb'); }).catch(function () { return null; }); }));
                bucc.forEach(function (it, i) { sideOf[it.name] = sides[i] ? (sides[i].incisors || 'frontal') : null; });
                notes.push('Yedek bukkal adayları: ' + rest.map(function (it, i) { const v = views[i]; return it.name.replace(/^2Y6A/, '') + ' ' + labelOfKey(labels[it.name] || 'other') + ' → ' + (v ? v.view : 'okunamadı') + (sideOf[it.name] ? ', kesiciler ' + (sideOf[it.name] === 'right' ? 'sağda' : sideOf[it.name] === 'left' ? 'solda' : 'yok') : ''); }).join(', '));
                ['buccal_right', 'buccal_left'].forEach(function (key) {
                    if (placed[key]) return;
                    const want = key === 'buccal_right' ? 'right' : 'left';
                    if (put(key, bestWhere(bucc, function (it) { return sideOf[it.name] === want; }))) {
                        notes.push(placed[key].item.name + ': etiketi ' + labelOfKey(labels[placed[key].item.name] || 'other') + ' idi; yön okuması bukkal, kesiciler ' + (want === 'right' ? 'sağda' : 'solda') + ' dedi, ' + labelOfKey(key) + ' yuvasına kondu');
                        // Orta kesit okuması da şimdi başlasın (onFix bekliyordu: Salar'da yön adımı 15 sn sürdü).
                        const it0 = placed[key].item;
                        pre('up|center|' + it0.name, function () { return window.idsfyCrop.readRawUpright(it0, 'center'); });
                    }
                });
            }
        }
        // Bukkal yuvası hâlâ boşsa ve bukkal görünümlü en az iki kare varsa: kareler birlikte okunur (hangisi baş aşağı çekilmiş, hangi
        // yan). Tek kare okuması Salar'ın üç bukkalini de "kesiciler sağda" demişti; 1546 baş aşağı çekilmiş soldu (7 Kasım 2026).
        // Küme kararı onFix'te yön (0°/180°) ve yan için de esastır (crop.setOrient / crop.setSide).
        if (!placed.buccal_right || !placed.buccal_left) {
            const buccAll = crop.items.filter(function (it) { return sideOf[it.name] === 'right' || sideOf[it.name] === 'left'; }).sort(byScore).slice(0, 6);
            if (buccAll.length >= 2) {
                let setAns = {};
                // Tahmini küme aynı kareleri kapsıyorsa süren okuma beklenir; yoksa yeni okuma.
                const covered = buccAll.every(function (it) { return specBucc.indexOf(it) >= 0; });
                try { setAns = covered ? ((await specBuccWork) || {}) : await window.idsfyCrop.readBuccalSet(buccAll); } catch (error) { setAns = {}; }
                crop.setOrient = crop.setOrient || {}; crop.setSide = crop.setSide || {};
                Object.keys(setAns).forEach(function (name) { crop.setOrient[name] = setAns[name].upsideDown ? 'bottom' : 'top'; crop.setSide[name] = setAns[name].side; });
                notes.push('Bukkal küme okuması (yedek): ' + buccAll.map(function (it) { const a = setAns[it.name]; return it.name.replace(/^2Y6A/, '') + ' ' + (a ? (a.side === 'right' ? 'sağ' : 'sol') + (a.upsideDown ? ' (baş aşağı çekilmiş)' : '') : '?'); }).join(', '));
                ['buccal_right', 'buccal_left'].forEach(function (key) {
                    const p = placed[key];
                    const want = key === 'buccal_right' ? 'right' : 'left';
                    if (p && setAns[p.item.name] && setAns[p.item.name].side !== want && buccAll.some(function (it) { return !used[it.name] && setAns[it.name] && setAns[it.name].side === want; })) {
                        delete used[p.item.name]; delete placed[key];
                        notes.push(p.item.name + ': küme okuması karşı yanı gördü, ' + labelOfKey(key) + ' yuvası kümeye göre yeniden dolduruldu');
                    }
                });
                let decided = false;
                ['buccal_right', 'buccal_left'].forEach(function (key) {
                    if (placed[key]) return;
                    const want = key === 'buccal_right' ? 'right' : 'left';
                    if (put(key, bestWhere(buccAll, function (it) { return setAns[it.name] && setAns[it.name].side === want; }))) { decided = true; notes.push(placed[key].item.name + ': küme okuması ' + (want === 'right' ? 'sağ' : 'sol') + ' dedi (tek kare okuması ' + (sideOf[placed[key].item.name] === 'right' ? 'sağ' : 'sol') + ' demişti), ' + labelOfKey(key) + ' yuvasına kondu'); }
                });
                if (decided && placed.buccal_right && placed.buccal_left) { placed.buccal_right.pairDecided = true; placed.buccal_left.pairDecided = true; }
            }
        }
        intraCands.forEach(function (it) { if (labels[it.name] !== 'labial_anterior' || sideOf[it.name] === 'left' || sideOf[it.name] === 'right') { if (/^buccal_/.test(labels[it.name]) !== (sideOf[it.name] === 'left' || sideOf[it.name] === 'right') && sideOf[it.name]) notes.push(it.name + ': etiketi ' + labelOfKey(labels[it.name]) + ', dik okuma ' + (sideOf[it.name] === 'frontal' ? 'ön' : 'kesiciler ' + (sideOf[it.name] === 'right' ? 'sağda' : 'solda')) + ' dedi; okuma esas alındı'); } });
        // Oklüzal: çene okuması; yoksa etiket.
        const archOf = {};
        // Tam ark (kesiciler + iki yanın son azıları) yeğlenir: netlik puanı yüksek yarım kadraj (Balaban 1504: tek çeyrek) tam arkın
        // (1505) önüne geçmişti (7 Kasım 2026). Okuma 'tam değil' demedikçe tam sayılır.
        const completeOf = {};
        poseAll.forEach(function (it) { const p = poseOf[it.name]; archOf[it.name] = p && p.view === 'occlusal' ? p.arch : null; if (p) completeOf[it.name] = p.complete_arch !== false; });
        const bestOcc = function (list, test) { return bestWhere(list, function (it) { return test(it) && completeOf[it.name] !== false; }) || bestWhere(list, test); };
        const occNoted = poseAll.filter(function (it) { return /^occlussal_/.test(labels[it.name] || '') || poseView[it.name] === 'occlusal'; });
        notes.push('Oklüzal adayları: ' + occNoted.map(function (it) { const p = poseOf[it.name]; return it.name.replace(/^2Y6A/, '') + ' ' + labelOfKey(labels[it.name] || 'other') + ' → ' + (p ? (p.view === 'occlusal' ? (p.arch === 'upper' ? 'üst' : p.arch === 'lower' ? 'alt' : 'çene yok') + (p.behind_teeth ? ' (' + p.behind_teeth + ')' : '') + (p.complete_arch === false ? ' (ark tam değil)' : '') : p.view) : 'okunamadı'); }).join(', '));
        notes.push('Yön okumaları: ' + poseAll.map(function (it) { const v = poseView[it.name]; return it.name.replace(/^2Y6A/, '') + ' ' + (v === 'occlusal' ? 'oklüzal' : v === 'buccal' ? 'bukkal' : v === 'frontal' ? 'ön' : v || '?'); }).join(', '));
        // Önce çift karşılaştırması: oklüzal etiketli kareler ikiz gruplarına ayrılır (imza uzaklığı ≤ 10), en net iki grubun en net
        // kareleri birlikte gösterilip hangisi üst çene sorulur. Karar verilirse çene okuması ve çift denetimi atlanır.
        // Yalnız yön okuması 'oklüzal' diyen adaylar (etiket bir bukkali oklüzal sayabiliyor: Ulusoy 0165).
        const occAll = poseAll.filter(function (it) { return !used[it.name] && poseView[it.name] === 'occlusal'; }).sort(byScore);
        if (occAll.length >= 2) {
            let setAns = {};
            // Tahmini küme (oklüzal etiketli en net 6) yön okumalarıyla aynı çıktıysa hazır yanıt; değilse yeniden okunur.
            const want = occAll.slice(0, 6);
            const specHit = !!specAns && want.length === specOcc.length && want.every(function (it) { return specOcc.indexOf(it) >= 0; });
            if (specHit) setAns = specAns;
            else { try { setAns = await window.idsfyCrop.readArchSet(want); } catch (error) { setAns = {}; } notes.push('Oklüzal kümesi tahmini tutmadı (' + specOcc.map(function (it) { return it.name.replace(/^2Y6A/, ''); }).join(', ') + '); yeniden okundu'); }
            const up = bestOcc(occAll, function (it) { return setAns[it.name] === 'upper'; });
            const low = bestOcc(occAll, function (it) { return setAns[it.name] === 'lower'; });
            notes.push('Oklüzal küme karşılaştırması: ' + occAll.slice(0, 6).map(function (it) { return it.name.replace(/^2Y6A/, '') + ' ' + (setAns[it.name] === 'upper' ? 'üst' : setAns[it.name] === 'lower' ? 'alt' : '?'); }).join(', '));
            if (up && low) {
                put('occlussal_upper', up); put('occlussal_lower', low);
                placed.occlussal_upper.pairDecided = true; placed.occlussal_lower.pairDecided = true;
            }
        }
        if (!placed.occlussal_upper) put('occlussal_upper', bestOcc(occAll, function (it) { return archOf[it.name] === 'upper'; }));
        if (!placed.occlussal_lower) put('occlussal_lower', bestOcc(occAll, function (it) { return archOf[it.name] === 'lower'; }));
        // Yedek oklüzal havuzu: bir oklüzal yuva boşsa, yüz ve bukkal olmayan, henüz yön okuması yapılmamış kalan kareler (en çok 10)
        // okunur; 'oklüzal' görünenler çene okuması ve kümeyle yerleştirilir (Balaban 7 Kasım 2026: üst oklüzaller 'other' etiketlenip
        // ilk 3 dışında kaldı, bukkal etiketli 1503 etikete göre üst yuvaya konmuştu).
        const viewOf2 = Object.assign({}, poseView);
        if (!placed.occlussal_upper || !placed.occlussal_lower) {
            const pool = crop.items.filter(function (it) { return !used[it.name] && !/^(profile|frontal)_/.test(labels[it.name] || '') && sideOf[it.name] !== 'right' && sideOf[it.name] !== 'left' && !(it.name in viewOf2); }).sort(byScore).slice(0, 10);
            const poses = await Promise.all(pool.map(function (it) { return pre('pose|' + it.name, function () { return window.idsfyCrop.readPose(it, 'occlusal', true); }).catch(function () { return null; }); }));
            pool.forEach(function (it, i) { const p = poses[i]; viewOf2[it.name] = p ? p.view : null; if (p && p.view === 'occlusal') { archOf[it.name] = p.arch; completeOf[it.name] = p.complete_arch !== false; } });
            if (pool.length) notes.push('Yedek oklüzal adayları: ' + pool.map(function (it, i) { const p = poses[i]; return it.name.replace(/^2Y6A/, '') + ' ' + labelOfKey(labels[it.name] || 'other') + ' → ' + (p ? (p.view === 'occlusal' ? (p.arch === 'upper' ? 'üst' : p.arch === 'lower' ? 'alt' : 'çene yok') + (p.complete_arch === false ? ' (ark tam değil)' : '') : p.view) : 'okunamadı'); }).join(', '));
            const occAll2 = crop.items.filter(function (it) { return !used[it.name] && viewOf2[it.name] === 'occlusal'; }).sort(byScore);
            if (!placed.occlussal_upper && !placed.occlussal_lower && occAll2.length >= 2) {
                let ans2 = {};
                try { ans2 = await window.idsfyCrop.readArchSet(occAll2.slice(0, 6)); } catch (error) { ans2 = {}; }
                notes.push('Oklüzal küme karşılaştırması (yedek): ' + occAll2.slice(0, 6).map(function (it) { return it.name.replace(/^2Y6A/, '') + ' ' + (ans2[it.name] === 'upper' ? 'üst' : ans2[it.name] === 'lower' ? 'alt' : '?'); }).join(', '));
                const up2 = bestOcc(occAll2, function (it) { return ans2[it.name] === 'upper'; });
                const low2 = bestOcc(occAll2, function (it) { return ans2[it.name] === 'lower'; });
                if (up2 && low2) { put('occlussal_upper', up2); put('occlussal_lower', low2); placed.occlussal_upper.pairDecided = true; placed.occlussal_lower.pairDecided = true; }
            }
            ['occlussal_upper', 'occlussal_lower'].forEach(function (key) {
                const want = key === 'occlussal_upper' ? 'upper' : 'lower';
                if (!placed[key] && put(key, bestOcc(occAll2, function (it) { return archOf[it.name] === want; }))) notes.push(placed[key].item.name + ': etiketi ' + labelOfKey(labels[placed[key].item.name] || 'other') + ' idi; yön okuması oklüzal, çene ' + (want === 'upper' ? 'üst' : 'alt') + ' dedi, ' + labelOfKey(key) + ' yuvasına kondu');
            });
        }
        // Etiket yedeği: yön okuması bukkal/ön diyen ya da yanı okunan kareler oklüzal yuvaya konmaz.
        const notOcc = function (it) { return viewOf2[it.name] === 'buccal' || viewOf2[it.name] === 'frontal' || sideOf[it.name] === 'right' || sideOf[it.name] === 'left'; };
        ['occlussal_upper', 'occlussal_lower'].forEach(function (key) {
            if (!placed[key] && put(key, pick((byLabel[key] || []).filter(function (it) { return !notOcc(it); })))) notes.push(labelOfKey(key) + ': çene okuması belirleyemedi, etikete göre ' + placed[key].item.name + ' kondu; kontrol edin');
        });
        // Hâlâ boşsa oklüzal havuzundaki en net kalan kare (etiket üst/alt karışabiliyor; çene okuması çelişirse uyarı kalır).
        ['occlussal_upper', 'occlussal_lower'].forEach(function (key) {
            if (!placed[key] && put(key, pick(occCands.concat(byLabel.occlussal_upper || [], byLabel.occlussal_lower || []).filter(function (it) { return !notOcc(it); })))) notes.push(labelOfKey(key) + ': bu çene için kare bulunamadı, oklüzal havuzundan ' + placed[key].item.name + ' kondu; kontrol edin');
        });
        const keys = Object.keys(placed);
        if (!keys.length) return null;
        mark('plan bitti');
        if (speedOn()) prefetchBoxes(placed);
        ALL_KEYS.filter(function (k) { return !placed[k]; }).forEach(function (k) { crop.notes.push(labelOfKey(k) + ' için uygun kare bulunamadı; yuva boş bırakıldı'); });
        return placed;
    }

    // Dönüş: true = doğrudan yerleştirme yapıldı (eski akışa gerek yok); false = eski akışa (IDS'e bırakma) dönülsün.
    async function onDirect(explicit) {
        const crop = state.crop;
        if (!crop || !crop.items || !window.idsfyCrop) return false;
        setStatus('Fotoğraflar sınıflandırılıyor (IDS\'e bırakılmadan)…');
        let placed = null;
        try { placed = await planDirect(crop); } catch (error) { crop.notes.push('Doğrudan yerleştirme yapılamadı (' + error.message + '); IDS\'e bırakılıyor'); return false; }
        if (!placed) { crop.notes.push('Sınıflandırma hiçbir kareyi yuvalara ayıramadı; IDS\'e bırakılıyor'); return false; }
        const keys = Object.keys(placed);
        mark('sınıflandırma bitti, ' + keys.length + ' yuva planlandı');
        // Planlamada erken yüklenen yüz yuvaları (crop.faceEarly) dolu sayılmaz (8 Kasım 2026: yüzler dolu görülüp IDS'e bırakma yoluna düşülmüştü).
        const blocked = keys.filter(function (k) { return !(crop.faceEarly && crop.faceEarly[k]) && (tileOf(k) || !document.querySelector('input[type="file"][id$="-' + k + '-uploader-input"]')); });
        if (blocked.length) { crop.notes.push(blocked.map(labelOfKey).join(', ') + ' yuvası dolu ya da girişi yok; IDS\'e bırakılıyor'); return false; }
        crop.direct = true;
        const clean = await onFix(!explicit, { placed: placed });
        askCrop(clean);
        return true;
    }

    // Kırpılmış kareyi boş yuvaya yükler; süre kaydı replaceTimes'a.
    async function uploadDirect(key, file) {
        const t0 = Date.now();
        // Yükleme 60 sn'de bitmezse (Esma Ulusoy üst oklüzal, 6 Kasım 2026) yuva hâlâ boşsa bir kez daha denenir.
        try { await uploadToEmptySlot(key, file); } catch (error) {
            if (tileOf(key) || !/tamamlanmadı/.test(error.message)) throw error;
            await sleep(1000);
            await uploadToEmptySlot(key, file);
            replaceTimes[key] = 'ikinci deneme ';
        }
        replaceTimes[key] = 'yükleme ' + ((Date.now() - t0) / 1000).toFixed(1);
    }

    // ---------- Hızlandırma: erken okuma ----------
    // IDS kareleri yuvalara yükleme isteklerinden önce yerleştirir; yükleme sürerken (onFix'i beklemeden) yerleşen karelerin
    // etiketleri, ağız içi yön okumaları ve yüz kırpma kutuları istenir. onFix aynı okumayı take() ile alır (tek kullanımlık;
    // yuva değiştiyse anahtar tutmaz ve okuma yeniden yapılır). Model çağrıları DOM'a dokunmaz.
    function speedOn() { return !window.idsfyCrop || !window.idsfyCrop.speedOn || window.idsfyCrop.speedOn(); }

    function mark(name) {
        if (!state.dropAt) return;
        if (!state.marks) state.marks = [];
        state.marks.push(name + ' ' + Math.round((Date.now() - state.dropAt) / 1000));
    }

    function take(key, fn) {
        const crop = state.crop;
        const p = crop && crop.pre && crop.pre[key];
        if (p) { delete crop.pre[key]; crop.preUsed = (crop.preUsed || 0) + 1; return p; }
        return fn();
    }

    function faceBoxKey(entries) {
        return 'face|' + entries.map(function (e) { return e.slot + ':' + e.item.name; }).join(',');
    }

    // onFix'in seçeceği orijinal: belirgin biçimde daha net ikiz varsa o, yoksa yuvadaki (onFix'teki kuralın kısa hali).
    function likelyItem(r) {
        return r.item !== r.shown && Number(r.item.score) > 1.3 * (Number(r.shown.score) || 0) ? r.item : r.shown;
    }

    // Yüklenmekte olan karonun önizlemesi (karo, Placeholder-<yuva> sınıfından bulunur; yuva girişi henüz yokken de vardır).
    function earlyPreview(key) {
        const tile = Array.from(document.querySelectorAll('[class*="Tile-photoTile"]')).find(function (t) {
            const holder = t.querySelector('[class*="Placeholder-placeholder"]');
            const m = holder && String(holder.className).match(/Placeholder-(profile_repose|frontal_repose|frontal_smiling|occlussal_upper|occlussal_lower|buccal_right|buccal_left|labial_anterior)\b/);
            return m && m[1] === key;
        });
        const img = tile && tile.querySelector('img[class*="Preview-photo"]:not([class*="Blur"])');
        return img && img.complete && img.naturalWidth > 0 ? img : null;
    }

    function earlyCount() {
        return ALL_KEYS.filter(function (key) { return earlyPreview(key); }).length;
    }

    async function prefetch() {
        try {
            if (state.cropReady) await state.cropReady;
            const crop = state.crop;
            if (!crop || !crop.items || !window.idsfyCrop || state.busy) return;
            crop.pre = {};
            crop.preClosed = false;
            const placed = {};
            for (const key of ALL_KEYS) {
                const img = tileOf(key) ? previewOf(key) : earlyPreview(key);
                if (!img) continue;
                try {
                    const blob = await (await fetch(img.src, { credentials: 'include' })).blob();
                    const ranked = await window.idsfyCrop.matchRanked(blob, crop.items);
                    if (!ranked.length) continue;
                    const group = ranked.filter(function (r) { return r.d < ranked[0].d + 3 && r.d <= 10; }).map(function (r) { return r.item; });
                    if (!group.length) group.push(ranked[0].item);
                    placed[key] = likelyItem({ item: bestOf(group), shown: ranked[0].item });
                } catch (error) { /* onFix yeniden dener */ }
            }
            if (crop.preClosed || state.busy) return;
            const keys = Object.keys(placed);
            if (!keys.length) return;
            mark('erken okuma başladı (' + keys.length + ' yuva)');
            ensureLabels(keys.map(function (k) { return placed[k]; }), true).catch(function () {});
            warmReads(placed);
        } catch (error) {
            /* erken okuma isteğe bağlıdır; onFix her şeyi kendisi okur */
        }
    }

    // placed: { yuva: orijinal }. Yuvası bilinen karelerin yön okumalarını ve yüz kutularını başlatır (henüz başlamamışsa).
    function boxKey(slot, name, target) { return 'box|' + slot + '|' + name + '|' + ((target && target.rotate) || 0) + '|' + (target && target.mirror ? 1 : 0); }

    // Erken kutu okuması (7 Kasım 2026): yuvalar ve yön planlama sonunda bellidir (ön/bukkal: karenin kendi A/B okuması ya da bukkal
    // kümesi; oklüzal: yön okuması). Kutular onFix'in set oylamasını ve çift denetimini beklemeden okunur (5-9 sn). onFix aynı anahtarı
    // (yuva, kare, dönüş, ayna) take() ile alır; son yön farklı çıkarsa (set oylaması, çift düzeltmesi) yeniden okur.
    function prefetchBoxes(placed) {
        const crop = state.crop;
        if (!crop || !crop.pre || !window.idsfyCrop) return;
        SLOTS.forEach(function (s) {
            const r = placed[s.key];
            if (!r) return;
            const item = r.item;
            (async function () {
                let target = null;
                if (/^occlussal_/.test(s.key)) {
                    const p = await (crop.pre['pose|' + item.name] || Promise.resolve(null)).catch(function () { return null; });
                    if (!p || p.view === 'other') return;
                    target = decide(s.key, { slot: s.key, is_photo: true, upper_jaw_side: p.upper_jaw_side || 'none', incisors_side: p.incisors_side || 'none', arch: p.arch || 'none', occRaw: true, exifRotate: item.exifRotate || 0, note: '' });
                } else {
                    const votes = await Promise.all(['thumb', 'center'].map(function (m) { return (crop.pre['up|' + m + '|' + item.name] || Promise.resolve(null)).catch(function () { return null; }); }));
                    const v = votes.filter(function (x) { return x; });
                    const faces = v.filter(function (x) { return x.byFace; });
                    const faceSide = faces.length && faces.every(function (x) { return x.side === faces[0].side; }) ? faces[0].side : null;
                    const teethSide = !faceSide && v.length === 2 && v[0].side === v[1].side ? v[0].side : null;
                    const setO = crop.setOrient ? crop.setOrient[item.name] : null;
                    const side = setO || faceSide || teethSide;
                    if (!side) return;
                    target = { rotate: side === 'top' ? 0 : 180, mirror: false, raw: true, exifRotate: item.exifRotate || 0, warning: '' };
                }
                if (!target || crop.preClosed) return;
                const key = boxKey(s.key, item.name, target);
                if (crop.pre[key]) return;
                const p = (async function () {
                    const up = await window.idsfyCrop.uprightThumb(item, target);
                    const res = await window.idsfyCrop.readBoxes([{ item: item, slot: s.key, thumb: up.data, w: up.w, h: up.h }], function () {});
                    return { res: res, upright: true };
                })();
                p.catch(function () {});
                crop.pre[key] = p;
            })();
        });
    }

    function warmReads(placed) {
        const crop = state.crop;
        if (!crop || !window.idsfyCrop || crop.preClosed) return;
        if (!crop.pre) crop.pre = {};
        const put = function (key, fn) {
            if (crop.preClosed || crop.pre[key]) return;
            const p = fn();
            p.catch(function () {});
            crop.pre[key] = p;
        };
        try {
            SLOTS.forEach(function (s) {
                const item = placed[s.key];
                if (!item) return;
                if (/^occlussal_/.test(s.key)) {
                    put('pose|' + item.name, function () { return window.idsfyCrop.readPose(item, 'occlusal', true); });
                } else {
                    put('up|thumb|' + item.name, function () { return window.idsfyCrop.readRawUpright(item, 'thumb'); });
                    put('up|center|' + item.name, function () { return window.idsfyCrop.readRawUpright(item, 'center'); });
                }
            });
            const faces = FACE_KEYS.filter(function (k) { return placed[k]; }).map(function (k) { return { item: placed[k], slot: k }; });
            if (faces.length) put(faceBoxKey(faces), function () { return window.idsfyCrop.readBoxes(faces, function () {}); });
        } catch (error) {
            /* okumalar onFix'te yeniden istenir */
        }
    }

    // IDS'in boş bıraktığı yuvaları yerleşmemiş karelerin sınıflandırmasıyla doldurur (model yalnız boş yuva varsa çağrılır).
    // Dönüş: bir şey yüklendiyse true (yükleme yeniden beklenir).
    async function fillEmptySlots() {
        if (state.cropReady) await state.cropReady;
        const crop = state.crop;
        if (!crop || !crop.items || !window.idsfyCrop) return false;
        const empty = ALL_KEYS.filter(function (key) {
            return !tileOf(key) && !!document.querySelector('input[type="file"][id$="-' + key + '-uploader-input"]');
        });
        if (!empty.length) return false;
        const free = await unplacedItems();
        if (!free.length) return false;
        setStatus(empty.map(labelOfKey).join(', ') + ' boş; yerleşmeyen fotoğraflar sınıflandırılıyor…');
        const labels = await ensureLabels(free);
        // Dinlenme profili yoksa boş profil yuvası gülen profille doldurulur (fixFaceSlots bunu nota yazar).
        const hasRestProfile = free.some(function (it) { return labels[it.name] === 'profile_repose'; });
        const labelled = free.map(function (it) {
            const slot = labels[it.name] === 'profile_smiling' && !hasRestProfile ? 'profile_repose' : (labels[it.name] || 'other');
            return Object.assign({}, it, { slot: slot });
        });
        const slots = {};
        ALL_KEYS.forEach(function (key) { slots[key] = { filled: !!tileOf(key) }; });
        const plan = planSlots(ALL_KEYS, slots, labelled);
        let changed = false;
        for (const up of plan.uploads) {
            setStatus(labelOfKey(up.key) + ' yuvası boş; ' + up.item.name + ' doğrudan yükleniyor…');
            try {
                await uploadToEmptySlot(up.key, up.item.file);
                crop.notes.push(up.item.name + ': ' + labelOfKey(up.key) + ' yuvasına doğrudan yüklendi');
                changed = true;
            } catch (error) {
                crop.notes.push(up.item.name + ': ' + labelOfKey(up.key) + ' yuvasına yüklenemedi (' + error.message + ')');
            }
        }
        return changed;
    }

    // İki yuvalı bir çiftte (sağ/sol bukkal ya da üst/alt oklüzal) kareler yer değiştirmişse düzeltir. spec: { keys: [A, B],
    // kind, names: { A: 'sağ bukkal', B: 'sol bukkal' }, truth(key, item): yuvadaki karenin gerçekte ait olduğu yuva (A, B ya da null) }.
    // Yön okumaları (items) fotoğrafla birlikte taşınır: etiketleri değiştirilir. İki yuva da karşı yana ait çıkarsa yer değiştirilir;
    // yalnız biri yanlışsa ve karşı yuva boşsa kare oraya taşınır; ikisi de aynı yana aitse yanlış yuvaya, yerleşmemiş karelerden doğru
    // yanın en iyisi konur; başka durumlarda dokunulmaz (uyarı kalır). Orijinaller taşınır (kırpma sonra yapılır). Dönüş: değiştiyse true.
    async function fixPairSlots(items, spec) {
        const A = spec.keys[0];
        const B = spec.keys[1];
        const kind = spec.kind;
        const Kind = kind.charAt(0).toUpperCase() + kind.slice(1);
        const info = {};
        for (const key of spec.keys) {
            const item = items.find(function (it) { return it.slot === key; });
            if (item && item.is_photo) info[key] = { item: item, side: await spec.truth(key, item) };
        }
        const R = info[A];
        const L = info[B];
        let plan = null;
        if (R && L && R.side === B && L.side === A) {
            plan = { type: 'swap' };
        } else if (R && R.side === B && !L && (spec.direct ? !spec.placed[B] : !tileOf(B))) {
            plan = { type: 'move', from: A, to: B };
        } else if (L && L.side === A && !R && (spec.direct ? !spec.placed[A] : !tileOf(A))) {
            plan = { type: 'move', from: B, to: A };
        } else if (R && L && R.side && L.side && R.side === L.side) {
            plan = { type: 'replace', key: R.side === B ? A : B };
        }
        if (!plan) return false;
        // Doğrudan yerleştirmede çift karşılaştırmasıyla karar verilmiş yuvalar yeniden sorgulanmaz (mutlak çene okuması yanılıyor).
        if (spec.direct && spec.placed && spec.placed[A] && spec.placed[B] && spec.placed[A].pairDecided && spec.placed[B].pairDecided) return false;
        const notes = state.crop ? state.crop.notes : [];
        // Sanal takas: kırpma kaydı varsa orijinaller IDS'te yer değiştirmez (2 yükleme, ~15 sn); yalnız yuva→kare eşlemesi değişir,
        // kırpılmış kareler doğru yuvalara konur. Dönüş 'virtual': yuvalar yeniden eşlenmez.
        if (plan.type === 'swap' && spec.placed && spec.placed[A] && spec.placed[B]) {
            const pa = spec.placed[A];
            spec.placed[A] = spec.placed[B];
            spec.placed[B] = pa;
            R.item.slot = B;
            L.item.slot = A;
            notes.push(pa.item.name + ' ve ' + spec.placed[A].item.name + ': ' + kind + ' karışmıştı; kırpılmış kareler doğru yuvalara kondu');
            return 'virtual';
        }
        if (plan.type === 'move' && spec.direct && spec.placed) {
            spec.placed[plan.to] = spec.placed[plan.from];
            delete spec.placed[plan.from];
            info[plan.from].item.slot = plan.to;
            notes.push(spec.placed[plan.to].item.name + ': karşı yuvaya ait olduğundan ' + spec.names[plan.to] + ' yuvasına kondu (' + kind + ')');
            return 'virtual';
        }
        if (plan.type === 'swap') {
            const fromR = await cropItemOfSlot(A);
            const fromL = await cropItemOfSlot(B);
            if (!fromR || !fromL || fromR === fromL) {
                notes.push(Kind + ' yer değiştirmiş görünüyor ama dosyalar eşlenemedi; elle değiştirin');
                return false;
            }
            setStatus(Kind + ' yer değiştirmiş görünüyor; yuvalar değiştiriliyor…');
            let replaced = false;
            try {
                await replaceInSlot(A, fromL.file);
                replaced = true;
                await replaceInSlot(B, fromR.file);
            } catch (error) {
                if (replaced) { try { await replaceInSlot(A, fromR.file); } catch (e) { /* elle düzeltilir */ } }
                notes.push(Kind + ' yer değiştirilemedi (' + error.message + '); elle değiştirin');
                return false;
            }
            R.item.slot = B;
            L.item.slot = A;
            notes.push(fromR.name + ' ve ' + fromL.name + ': ' + kind + ' karışmıştı, yuvalar değiştirildi');
            return true;
        }
        if (plan.type === 'replace') {
            // İki yuva da aynı yana/çeneye ait okunduysa tek bir yanlış okuma yeter: kendiliğinden değiştirilmez, yalnız uyarılır
            // (B,B denemesi, 30 Ekim 2026: pose okuması bir oklüzali yanlış çene sayıp doğru kareyi değiştirmeye kalktı).
            notes.push('İki ' + kind + ' yuvası aynı yana ait görünüyor (' + spec.names[plan.key] + ' şüpheli); kendiliğinden değiştirilmedi, kontrol edin');
            spec.keys.forEach(function (k) { const it = info[k] && info[k].item; if (it) it.sameSide = true; });
            return false;
        }
        if (plan.type === 'replace-disabled') {
            const crop = state.crop;
            if (!crop || !crop.items || !window.idsfyCrop) return false;
            const side = spec.names[plan.key];
            const free = await unplacedItems();
            const labels = free.length ? await ensureLabels(free) : {};
            const candidate = bestOf(free.filter(function (it) { return labels[it.name] === plan.key; }));
            if (!candidate) {
                notes.push('İki ' + kind + ' yuvası aynı yana ait görünüyor ve ' + side + ' yuvası için başka kare bulunamadı; elle değiştirin');
                return false;
            }
            setStatus('İki ' + kind + ' aynı yana ait görünüyor; ' + side + ' yuvası ' + candidate.name + ' ile değiştiriliyor…');
            try {
                await replaceInSlot(plan.key, candidate.file);
                // Yeni karenin yönü yeniden okunur (eski okuma eski fotoğrafa aitti).
                const reread = await askOrientation([{ slot: plan.key, media_type: 'image/jpeg', data: candidate.thumb }]);
                const at = items.findIndex(function (it) { return it.slot === plan.key; });
                if (reread && reread[0] && at >= 0) { reread[0].slot = plan.key; items[at] = reread[0]; }
            } catch (error) {
                notes.push(side + ' yuvası değiştirilemedi (' + error.message + '); elle değiştirin');
                return false;
            }
            notes.push(candidate.name + ': iki ' + kind + ' aynı yana ait göründüğünden ' + side + ' yuvasına alındı');
            return true;
        }
        const found = await cropItemOfSlot(plan.from);
        if (!found) {
            notes.push(Kind + ' karşı yuvaya ait görünüyor ama dosyası eşlenemedi; elle taşıyın');
            return false;
        }
        setStatus(Kind + ' karşı yuvaya ait görünüyor; taşınıyor…');
        try {
            await uploadToEmptySlot(plan.to, found.file);
            await deleteSlot(tileOf(plan.from), plan.from);
        } catch (error) {
            notes.push(found.name + ': karşı yuvaya taşınamadı (' + error.message + '); elle taşıyın');
            return false;
        }
        info[plan.from].item.slot = plan.to;
        notes.push(found.name + ': karşı yuvaya ait olduğundan ' + spec.names[plan.to] + ' yuvasına taşındı (' + kind + ')');
        return true;
    }

    const FACE_KEYS = ['profile_repose', 'frontal_repose', 'frontal_smiling'];

    // Yüz yuvaları: yerleşen yüz kareleri sınıflandırılır (tek çağrı). Etiketi yuvasına uymayan kare: etiketinin yuvasındaki kare de
    // ters uyuyorsa takas, değilse yerleşmemiş karelerden (ya da yanlış yerleşmiş bir yüz karesinden) doğru etiketli en net kare konur.
    // Dönüş: bir şey değiştiyse true.
    async function fixFaceSlots(placed) {
        const crop = state.crop;
        if (!crop || !window.idsfyCrop) return false;
        const keys = FACE_KEYS.filter(function (k) { return placed[k]; });
        if (!keys.length) return false;
        setStatus('Yüz yuvaları denetleniyor…');
        // Tüm yerleşen kareler tek çağrıda etiketlenir (ağız içi etiketler yön okumasındaki tür çelişkisinde doğrulama için kullanılır).
        const labels = await ensureLabels(ALL_KEYS.filter(function (k) { return placed[k]; }).map(function (k) { return placed[k].item; }));
        const wrong = keys.filter(function (k) { return labels[placed[k].item.name] && labels[placed[k].item.name] !== k; });
        if (!wrong.length) return false;
        let changed = false;
        const done = {};
        for (const key of wrong) {
            if (done[key]) continue;
            const want = labels[placed[key].item.name];
            const partner = wrong.find(function (k) { return k !== key && !done[k] && labels[placed[k].item.name] === key && want === k; });
            try {
                if (partner) {
                    setStatus(labelOfKey(key) + ' ve ' + labelOfKey(partner) + ' yuvaları yer değiştiriyor…');
                    await replaceInSlot(key, placed[partner].item.file);
                    await replaceInSlot(partner, placed[key].item.file);
                    crop.notes.push(placed[key].item.name + ' ve ' + placed[partner].item.name + ': ' + labelOfKey(key) + '/' + labelOfKey(partner) + ' karışmıştı, yuvalar değiştirildi');
                    done[key] = done[partner] = true;
                    changed = true;
                    continue;
                }
                // Adaylar yuvalarda kullanılmayan tüm kareler: gülen ve dinlenme profili imzada ikiz sayıldığından unplacedItems yetmez.
                const used = {};
                ALL_KEYS.forEach(function (k) { if (placed[k]) used[placed[k].item.name] = true; });
                const free = crop.items.filter(function (it) { return !used[it.name]; });
                const freeLabels = free.length ? await ensureLabels(free) : {};
                const candidate = bestOf(free.filter(function (it) { return freeLabels[it.name] === key; }));
                if (!candidate) {
                    crop.notes.push(placed[key].item.name + ': ' + labelOfKey(key) + ' yuvasında ' + (KEY_LABELS[want] || want) + ' karesi var, uygun kare bulunamadı; elle değiştirin');
                    done[key] = true;
                    continue;
                }
                setStatus(labelOfKey(key) + ' yuvasına ' + candidate.name + ' konuyor…');
                await replaceInSlot(key, candidate.file);
                crop.notes.push(placed[key].item.name + ' yerine ' + candidate.name + ' (' + labelOfKey(key) + '; IDS yanlış yüz karesi koymuştu)');
                done[key] = true;
                changed = true;
            } catch (error) {
                crop.notes.push(labelOfKey(key) + ' yuvası düzeltilemedi (' + error.message + ')');
                done[key] = true;
            }
        }
        return changed;
    }

    // Sağ/sol bukkal: gerçek yan ÇEKİM SIRASINDAN (klinik kuralı: önce sağ bukkal çekilir; küçük dosya numarası = sağ). İki bukkal da
    // yerleşmiş ve numaraları farklıysa sıra geçerlidir; değilse eski yol (yön okumasından; kuralla dikleştirilen karede null → dokunulmaz).
    // Sağ/sol bukkal: gerçek yan, DİK karedeki kesicilerin yanından (sağda → sağ bukkal). Çekim sırası kuralı Damla'da bozuldu
    // (0547 küçük numara ama sol bukkal), kullanılmıyor. Okuma yoksa dokunulmaz.
    function fixBuccalSides(items, placed, direct) {
        return fixPairSlots(items, {
            keys: ['buccal_right', 'buccal_left'], kind: 'sağ/sol bukkal', names: { buccal_right: 'sağ bukkal', buccal_left: 'sol bukkal' }, placed: placed, direct: direct,
            truth: function (key, item) {
                if (item.viaRule) return item.rawIncisors === 'right' ? 'buccal_right' : item.rawIncisors === 'left' ? 'buccal_left' : null;
                return buccalSideOf(item);
            }
        });
    }

    // Üst/alt oklüzal: gerçek çene, yön okumasındaki arch alanından (damak = üst, dil = alt).
    // Üst/alt oklüzal: gerçek çene, yön okumasındaki arch alanından (damak = üst, dil = alt). Çekim sırası burada kullanılmaz: üst/alt
    // sırası setten sete değişiyor (Damla'da alt önce çekilmiş).
    // Yön okumasının çenesi sınıflandırma etiketiyle çelişirse bilinmez sayılır (tek okuma "iki yuva aynı çene" yanlış alarmı üretiyordu).
    function fixOcclusalArches(items, placed, direct) {
        const labels = state.crop && state.crop.labelOf ? state.crop.labelOf : {};
        return fixPairSlots(items, {
            keys: ['occlussal_upper', 'occlussal_lower'], kind: 'üst/alt oklüzal', names: { occlussal_upper: 'üst oklüzal', occlussal_lower: 'alt oklüzal' }, placed: placed, direct: direct,
            truth: function (key, item) {
                const fromArch = item.arch === 'upper' ? 'occlussal_upper' : item.arch === 'lower' ? 'occlussal_lower' : null;
                const label = item.name ? labels[item.name] : null;
                // Doğrudan yerleştirmede etiket yalnız başlangıç dizilimidir; çene okuması (damak/dil, kararlı okuyucu) esastır
                // (Elif Kır: 1943 alt oklüzal 'üst' etiketlendi, okuma 'alt' dedi; etiket çelişkisi takası engelliyordu).
                if (!direct && fromArch && /^occlussal_/.test(label || '') && label !== fromArch) return null;
                return fromArch;
            }
        });
    }

    // Yükleme bitince (ya da "Yönleri düzelt" ile): dolu yuvalar orijinallere eşlenir (en net ikiz seçilir), ağız içi yuvaların yönü
    // orijinalin küçük karesinden okunur, aynı anda yuvası bilinen karelerin kırpma kutuları alınır; sağ/sol ve üst/alt karışıklığı
    // düzeltilir; sonra her yuva için kare tuvalde kırpılıp döndürülür (oklüzalde aynalanır) ve "Değiştir" ile yuvaya konur. Kırpma
    // kaydı olmayan yuvalarda (elle yüklenmiş, eşlenemeyen) yön eski yolla, IDS'in menüsüyle düzeltilir.
    // Sonuç: tüm yuvalar uyarısız düzeltildiyse true. auto: kendiliğinden çağrıldı ("Durdur" basılırsa kalan yuvalar bırakılır).
    async function onFix(auto, direct) {
        if (state.cropReady) await state.cropReady;
        // Doğrudan yerleştirmede yuvalar henüz boştur: "yuva var mı" planlanan kareye bakar.
        const has = function (key) { return direct ? !!direct.placed[key] : !!tileOf(key); };
        let clean = false;
        let halted = false;
        state.busy = true;
        state.results = {};
        render();
        const crop = state.crop;
        const notes = crop ? crop.notes : [];
        const began = Date.now();
        // Süre dağılımı (hızlandırma için, notlara yazılır): adım + düğmeye basıştan beri geçen sn.
        const laps = [];
        const lap = function (name) { laps.push(name + ' ' + Math.round((Date.now() - began) / 1000)); };
        try {
            // 1) Dolu yuvalar hangi orijinal? Benzer çekimler arasından belirgin biçimde (en az %30) daha net olan varsa o kullanılır.
            const placed = {};
            if (direct) Object.assign(placed, direct.placed);
            if (crop && !direct) {
                setStatus('Yuvalardaki fotoğraflar klasördeki orijinallerle eşleştiriliyor…');
                for (const key of ALL_KEYS) {
                    if (!tileOf(key)) continue;
                    let r = null;
                    try { r = await resolveSlot(key); } catch (error) { r = null; }
                    if (r && !r.ours && r.item !== r.shown) {
                        const usedElsewhere = Object.keys(placed).some(function (k) { return placed[k] && placed[k].item === r.item; });
                        if (!usedElsewhere && Number(r.item.score) > 1.3 * (Number(r.shown.score) || 0)) {
                            notes.push(r.shown.name + ' yerine daha net ' + r.item.name + ' kullanıldı (' + labelOfKey(key) + ')');
                        } else {
                            r.item = r.shown;
                        }
                    }
                    if (r) placed[key] = r;
                    else notes.push(labelOfKey(key) + ' yuvasındaki kare klasördeki orijinallerle eşlenemedi; dokunulmadı');
                }
            }
            // Hızlandırma: yön okumaları ve yüz kutuları yüz yuvası denetimini (etiketleme, 5-10 sn) beklemeden başlar.
            if (crop && speedOn()) {
                crop.preClosed = false;
                const warm = {};
                Object.keys(placed).forEach(function (k) { warm[k] = placed[k].item; });
                warmReads(warm);
            }
            // 1b) Yüz yuvaları: IDS gülümsemeyi profile koyabiliyor; yerleşen yüz kareleri sınıflandırılır, yanlış yuvalar düzeltilir.
            if (crop && !direct) {
                try {
                    if (await fixFaceSlots(placed)) {
                        for (const key of FACE_KEYS) {
                            if (!tileOf(key)) { delete placed[key]; continue; }
                            // Yuvadaki kare esastır: "daha net ikiz" kuralı seçilen dinlenme profilini gülen ikiziyle geri değiştirmesin.
                            try { const r = await resolveSlot(key); if (r) { r.item = r.shown; placed[key] = r; } } catch (error) { /* eski eşleme kalır */ }
                        }
                    }
                } catch (error) { notes.push('Yüz yuvaları denetlenemedi (' + error.message + ')'); }
            }
            // 2) Yön okuması (orijinal küçük kareden) ve 3) kırpma kutuları (yuva bilinerek), aynı anda.
            const images = [];
            for (const slot of SLOTS) {
                if (!has(slot.key)) continue;
                const r = placed[slot.key];
                if (r) { images.push({ slot: slot.key, media_type: 'image/jpeg', data: r.item.thumb, original: r.item.name }); continue; }
                const image = await previewImage(slot.key);
                if (image) images.push(image);
            }
            if (!images.length && !Object.keys(placed).length) throw new Error('Ağız içi yuvalarda fotoğraf yok.');
            setStatus('Yapay zeka ' + images.length + ' fotoğrafın yönüne bakıyor' + (crop ? ', kırpma kutuları okunuyor' : '') + '…');
            const entriesOf = function (keys) {
                return keys.filter(function (k) { return placed[k]; }).map(function (k) { return { item: placed[k].item, slot: k }; });
            };
            const boxFail = function (error) { return { byName: {}, notes: ['kırpma kutuları alınamadı (' + error.message + ')'] }; };
            const faceEntries = entriesOf(FACE_KEYS);
            const boxWork = crop
                ? take(faceBoxKey(faceEntries), function () { return window.idsfyCrop.readBoxes(faceEntries, function () {}); }).catch(boxFail)
                : Promise.resolve({ byName: {}, notes: [] });
            let failed = 0;
            let croppedCount = 0;
            const done = {};
            // Kareyi kırpar, döndürür (oklüzalde aynalar) ve "Değiştir" ile yuvaya koyar; sonucu satıra yazar. Değiştirme olmazsa orijinal
            // yerinde kalır ve ağız içi yuvada yön IDS'in menüsüyle düzeltilir.
            const placeCropped = async function (key, r, model, target, intra, upright) {
                const label = labelOfKey(key);
                const orient = target || { rotate: 0, mirror: false, warning: '' };
                setStatus(label + ' kırpılıyor' + (orient.rotate || orient.mirror ? ' ve döndürülüyor' : '') + '…');
                try {
                    const c0 = Date.now();
                    // Planlamada kırpılıp yüklenmiş yüz karesi varsa o kullanılır.
                    let early = null;
                    if (crop && crop.faceEarly && crop.faceEarly[key]) {
                        try { early = await crop.faceEarly[key]; } catch (error) { early = null; notes.push(label + ': planlamadaki erken yükleme olmadı (' + error.message + '); yeniden kırpıldı'); }
                    }
                    const out = early && early.out ? early.out : await cropLock(function () { return window.idsfyCrop.cropFor(r.item, key, model, orient, upright); });
                    out.notes.forEach(function (n) { notes.push(n); });
                    const c1 = Date.now();
                    if (!(early && early.out)) { if (direct) await uploadDirect(key, out.file); else await replaceInSlot(key, out.file); }
                    laps.push(early && early.out
                        ? label + ' planlamada kırpıldı ' + early.crop.toFixed(1) + ' + yüklendi ' + early.upload.toFixed(1) + ' (' + (out.file.size / 1048576).toFixed(1) + ' MB, ' + out.width + 'x' + out.height + ')'
                        : label + ' kırpma ' + ((c1 - c0) / 1000).toFixed(1) + (direct ? ' + yükleme ' : ' + Değiştir ') + ((Date.now() - c1) / 1000).toFixed(1) + ' [' + (replaceTimes[key] || '') + '] (' + (out.file.size / 1048576).toFixed(1) + ' MB, ' + out.width + 'x' + out.height + ')');
                    const img = previewOf(key);
                    crop.placed[key] = { item: r.item, cropped: out, src: img ? img.src : '', orient: { rotate: orient.rotate, mirror: orient.mirror, raw: !!orient.raw, exifRotate: orient.exifRotate || 0 } };
                    markProcessed(key, true);
                    if (out.cropped) croppedCount++;
                    const parts = [out.cropped ? 'kırpıldı' : 'kırpılamadı'];
                    if (orient.rotate) parts.push(orient.rotate + '° döndürüldü');
                    if (orient.mirror) parts.push('ayna görüntüsü alındı');
                    if (intra && !target) {
                        failed++;
                        state.results[key] = { ok: false, text: parts.join(', ') + '; yön okunamadı, elle düzeltin' };
                    } else {
                        state.results[key] = { ok: out.cropped, text: parts.join(', '), warning: orient.warning || '' };
                    }
                } catch (error) {
                    notes.push(r.item.name + ': kırpılmış kare yuvaya konamadı (' + error.message + ')');
                    if (intra && target && !direct) {
                        try {
                            await applyOrientation(key, target);
                            state.results[key] = { ok: true, text: describe(target) + ' (kırpılamadı)', warning: target.warning };
                        } catch (e) { failed++; state.results[key] = { ok: false, text: e.message }; }
                    } else {
                        failed++;
                        state.results[key] = { ok: false, text: 'kırpılamadı: ' + error.message };
                    }
                }
                done[key] = true;
            };
            // Yüz kareleri, ağız içi yön okumaları sürerken kırpılıp yuvaya konur (model çağrıları DOM'a dokunmaz; örtüşme güvenli).
            const faceWork = (async function () {
                if (!crop) return;
                const b = await boxWork;
                await Promise.all(FACE_KEYS.filter(function (key) { return has(key) && placed[key]; }).map(async function (key) {
                    await placeCropped(key, placed[key], b.byName[placed[key].item.name] || null, { rotate: 0, mirror: false, warning: '' }, false, false);
                    render();
                }));
            })();
            // Yuvası bilinen kareler: kararlı okuyucu (bağımsız tek görüntülük okumalar, tutarlılık, hakem); diğerleri eski grup okuması.
            const legacyImages = images.filter(function (im) { return !im.original; });
            const legacyWork = legacyImages.length ? askOrientation(legacyImages) : Promise.resolve([]);
            // Ön ve bukkal kareler: ham (EXIF'siz) kare kliniğin kamerasında hep diktir → kural (0°), model okuması yok; sağ/sol çekim
            // sırasından (fixBuccalSides). Oklüzal kareler: ham yön ve üst/alt sırası setten sete değişiyor (Damla'da alt oklüzal önce, ön
            // dişler üstte; Esra'da üst önce) → kararlı okuyucu (EXIF uygulanmış küçük kareden, eski yol). Tek çağrılık model doğrulaması
            // denendi ve kaldırıldı (2 Kasım 2026: dik kareleri "dik değil", çeneyi ters okudu).
            const poseItemFor = async function (s) {
                const kind = /^labial_/.test(s.key) ? 'frontal' : /^buccal_/.test(s.key) ? 'buccal' : 'occlusal';
                const item0 = placed[s.key].item;
                const it = { slot: s.key, name: item0.name, seq: item0.seq, is_photo: true, upper_jaw_side: 'none', incisors_side: 'none', arch: 'none', note: '' };
                if (kind !== 'occlusal') {
                    it.viaRule = true;
                    it.orient = window.idsfyCrop.ruleOrient(s.key);
                    it.exifRotate = item0.exifRotate || 0;
                    // Ham kare yatay durur ama baş aşağı olabilir (Altan 1.Refinement, 3 Kasım 2026): üst çenenin yanı HAM kareden kararlı
                    // okuyucuyla okunur; yalnız üst/alt kabul edilir. Setin ön/yan kareleri aşağıda birlikte oylanır.
                    // Mutlak okuma (upper_jaw_side) baş aşağı karede güvenilmez çıktı (sentetik 180° sette üçü de "üstte" dedi); A/B
                    // karşılaştırması (ham ↔ 180°) kullanılır.
                    // İki ölçekte okuma (orta kesit + tam küçük kare); oylar aşağıda birleştirilir.
                    // Tam kare (yüz ipucu: burun/çene) + orta kesit (diş ipucu). Oy: yüz ipuçlu okuma 3, diş 1 (ön yuvada ×2).
                    const votes = await Promise.all([take('up|thumb|' + item0.name, function () { return window.idsfyCrop.readRawUpright(item0, 'thumb'); }), take('up|center|' + item0.name, function () { return window.idsfyCrop.readRawUpright(item0, 'center'); })]);
                    it.rawVotes = votes.filter(function (v) { return v; });
                    it.rawUpper = it.rawVotes.length ? (it.rawVotes.length === 2 && votes[0].side !== votes[1].side ? (votes[0].byFace ? votes[0].side : votes[1].byFace ? votes[1].side : null) : it.rawVotes[0].side) : null;
                    // Dik karede kesicilerin yanı (bukkal): okumalar çelişmiyorsa.
                    const incs = it.rawVotes.map(function (v) { return v.incisors; }).filter(function (x) { return x; });
                    it.rawIncisors = incs.length && incs.every(function (x) { return x === incs[0]; }) ? incs[0] : null;
                    it.item0 = item0;
                    return it;
                }
                // Oklüzal: HAM kareden okunur. Ayna çekiminde kamera yukarı/aşağı baktığı için EXIF rastgele (Altan Başlangıç: aynı tutuşta
                // 6 ve 1); yan dönmüş küçük karede model doğrudan görünen karşı çene şeridini kesici sandı (0661/0665 hep "sol", gerçek
                // "sağ") ve üst oklüzal baş aşağı kaldı. Ham karede aynı kareler 8/8 doğru okundu (3 Kasım 2026).
                it.occRaw = true;
                it.exifRotate = item0.exifRotate || 0;
                const p = await take('pose|' + item0.name, function () { return window.idsfyCrop.readPose(item0, kind, true); });
                if (!p) { it.note = 'yön okuması kararsız kaldı'; return it; }
                if (p.view === 'other') { it.is_photo = false; return it; }
                it.upper_jaw_side = p.upper_jaw_side || 'none';
                it.incisors_side = p.incisors_side || 'none';
                it.arch = p.arch || 'none';
                // Yan duran ön/yan kareler modelce birbirine karışabiliyor (üst çene yönü yine doğru); yalnız oklüzal ↔ diğer çelişkisi not edilir.
                if ((p.view === 'occlusal') !== (kind === 'occlusal')) {
                    const lab = crop && crop.labelOf ? crop.labelOf[placed[s.key].item.name] : null;
                    if (lab && /^occlussal_/.test(lab) === (kind === 'occlusal')) notes.push(labelOfKey(s.key) + ': yön okuması türü farklı gördü (' + p.view + '), sınıflandırma yuvayı doğruladı');
                    else it.note = 'kare bu yuvanın türünde görünmüyor (' + p.view + '), yuvayı kontrol edin';
                }
                return it;
            };
            const poseWork = Promise.all(SLOTS.filter(function (s) { return placed[s.key]; }).map(poseItemFor));
            let posed = await poseWork;
            lap('yön okumaları bitti');
            // Bukkal kümesi (Opus) planlamada 1 sn içinde gelmediyse burada en çok 2,5 sn daha beklenir: küme yerleşen bukkali karşı
            // yana koyuyorsa yuvalar takas edilir ya da kümenin o yan dediği aday konur (Demirtaş 8 Kasım 2026: tek kare okumaları
            // 0546'yı sağ dedi, küme sol). Küme yönü (crop.setOrient/setSide) aşağıdaki oylamada esastır.
            if (direct && crop && crop.buccSetWork && !(placed.buccal_right && placed.buccal_left && placed.buccal_right.pairDecided && placed.buccal_left.pairDecided)) {
                let ans = null;
                try { ans = await Promise.race([crop.buccSetWork, new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2500); })]); } catch (error) { ans = null; }
                if (ans && Object.keys(ans).length) {
                    crop.setOrient = crop.setOrient || {}; crop.setSide = crop.setSide || {};
                    Object.keys(ans).forEach(function (name) { crop.setOrient[name] = ans[name].upsideDown ? 'bottom' : 'top'; crop.setSide[name] = ans[name].side; });
                    const sideOfSlot = function (key) { const p = placed[key]; return p && ans[p.item.name] ? ans[p.item.name].side : null; };
                    const usedNames = function () { return Object.keys(placed).map(function (k) { return placed[k].item.name; }); };
                    const changed = [];
                    const sR = sideOfSlot('buccal_right'), sL = sideOfSlot('buccal_left');
                    if (sR === 'left' && sL === 'right') {
                        const t = placed.buccal_right; placed.buccal_right = placed.buccal_left; placed.buccal_left = t;
                        changed.push('buccal_right', 'buccal_left');
                        notes.push('Bukkal küme okuması (geç geldi): ' + placed.buccal_right.item.name + ' sağ, ' + placed.buccal_left.item.name + ' sol; yuvalar takas edildi');
                    } else {
                        ['buccal_right', 'buccal_left'].forEach(function (key) {
                            const want = key === 'buccal_right' ? 'right' : 'left';
                            const s = sideOfSlot(key);
                            if (s && s !== want) {
                                const cand = (crop.specBucc || []).filter(function (it) { return ans[it.name] && ans[it.name].side === want && usedNames().indexOf(it.name) < 0; }).sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0); })[0];
                                if (cand) {
                                    notes.push('Bukkal küme okuması (geç geldi): ' + placed[key].item.name + ' ' + (s === 'right' ? 'sağ' : 'sol') + ' çıktı; ' + labelOfKey(key) + ' yuvasına kümenin ' + (want === 'right' ? 'sağ' : 'sol') + ' dediği ' + cand.name + ' kondu');
                                    placed[key] = { item: cand, shown: cand, group: [cand], ours: true };
                                    changed.push(key);
                                } else notes.push(labelOfKey(key) + ': bukkal küme okuması karşı yanı gördü, uygun başka kare yok; kontrol edin');
                            }
                        });
                    }
                    if (changed.length) {
                        const redo = await Promise.all(SLOTS.filter(function (s) { return changed.indexOf(s.key) >= 0; }).map(poseItemFor));
                        posed = posed.filter(function (it) { return changed.indexOf(it.slot) < 0; }).concat(redo);
                        if (placed.buccal_right && placed.buccal_left) { placed.buccal_right.pairDecided = true; placed.buccal_left.pairDecided = true; }
                        lap('bukkal yuvaları kümeyle düzeltildi');
                    }
                }
            }
            // Ön/yan kareler 0° mi 180° mi: set aynı tutuşla çekilir; kendi okuması yoksa ya da diğer iki kare birlikte aksini söylüyorsa
            // çoğunluk uygulanır. Hiç okuma yoksa ham kare 0° konur ve uyarılır (↻ düğmeleri).
            // Ham karenin yönü setten sete değişiyor (Damla dik; Adem/Altan/Bera baş aşağı): setin ön/yan yuvaları aynı tutuşla
            // çekildiğinden A/B okumaları birlikte oylanır. Ön (labial) okuması ağırlık 2 (orta kesitte kesiciler net: 6/6 doğru),
            // bukkaller 1 (yan karede okuma zayıf: 1697 hep yanlış). Eşitlik/okuma yoksa daha sık görülen 180° + uyarı.
            const ruled = posed.filter(function (it) { return it.viaRule; });
            const weightOf = function (o) { return /^labial_/.test(o.slot) ? 2 : 1; };
            let tops = 0, bottoms = 0, readCount = 0;
            ruled.forEach(function (o) { (o.rawVotes || []).forEach(function (v) { readCount++; const w = weightOf(o) * (v.byFace ? 3 : 1); if (v.side === 'top') tops += w; else bottoms += w; }); });
            let setUpright = tops > bottoms ? 'top' : bottoms > tops ? 'bottom' : null;
            if (!setUpright && ruled.length) {
                // Eşitlik: Opus (yüksek) ön karenin (yoksa ilk yan karenin) orta kesitinde hakem.
                const lab = ruled.filter(function (o) { return /^labial_/.test(o.slot); })[0] || ruled[0];
                setStatus('Ön/yan karelerin yönü için hakem okuması…');
                try { const h = await window.idsfyCrop.readRawUpright(lab.item0, 'thumb', true); setUpright = h ? h.side : null; } catch (error) { setUpright = null; }
                if (setUpright) notes.push('Ön/yan ham kareler: oylar eşitti (dik ' + tops + ' / baş aşağı ' + bottoms + '), hakem "' + (setUpright === 'top' ? 'dik' : 'baş aşağı') + '" dedi');
            }
            // Aynı set içinde bile tutuş değişebiliyor (Damla: 0544/0545 dik, 0546-0549 baş aşağı) → karenin KENDİ yüz ipuçlu okuması
            // varsa o geçerli; yoksa set oylaması; o da yoksa 180° + uyarı.
            // Kendi yüz okuması setin diğer yüz okumalarının çoğunluğuyla çelişirse (karanlık 1697'de yüz okuması yanlıştı) Opus (yüksek)
            // hakem o kareye bakar: hakem kendi okumasını doğrularsa o, yoksa set oylaması.
            const faceSideOf = function (o) { const f = (o.rawVotes || []).filter(function (v) { return v.byFace; }); return f.length && f.every(function (v) { return v.side === f[0].side; }) ? f[0].side : null; };
            for (const it of ruled) {
                // Karenin kendi yüz okuması KESİNDİR (Altan 1.Ref: 1696 baş aşağı, 1697 dik çekilmiş; set oylaması/hakem 1697'yi yanlış
                // çevirdi). Set oylaması yalnız yüz okuması olmayan kare için.
                // Yüz okuması yoksa iki ölçeğin diş okumaları uyuşuyorsa o da kendi okumasıdır (ön karede burun/çene çoğu kez kadraj dışı).
                const allVotes = it.rawVotes || [];
                const teethSide = !faceSideOf(it) && allVotes.length === 2 && allVotes[0].side === allVotes[1].side ? allVotes[0].side : null;
                const ownSide = faceSideOf(it) || teethSide;
                const otherFaces = ruled.filter(function (o) { return o !== it && faceSideOf(o); }).map(faceSideOf);
                if (ownSide && otherFaces.some(function (s) { return s !== ownSide; })) notes.push(labelOfKey(it.slot) + ': kendi okuması (' + (ownSide === 'top' ? 'dik' : 'baş aşağı') + ') setin diğer karelerinden farklı; kendi okuması uygulandı');
                it.ownSide = ownSide;
                it.selfConsistent = allVotes.length === 2 && allVotes[0].side === allVotes[1].side;
                // Bukkal küme okuması (planDirect) varsa yön ve yan için o esastır.
                const setO = crop && crop.setOrient ? crop.setOrient[it.name] : null;
                if (setO && ownSide && setO !== ownSide) notes.push(labelOfKey(it.slot) + ': bukkal küme okuması ' + (setO === 'top' ? 'dik' : 'baş aşağı') + ' dedi, tek kare okuması (' + (ownSide === 'top' ? 'dik' : 'baş aşağı') + ') yerine o uygulandı');
                const side = setO || ownSide || setUpright;
                if (side === 'top') it.orient = { rotate: 0, mirror: false, raw: true, warning: '' };
                // Kesicilerin yanı her okumada o okumanın "dik" saydığı sürüme göredir; son karar o sürümden farklıysa yan ters çevrilir
                // (1697: okuma yanlış "dik" dedi, set 180° uyguladı → kesiciler aslında karşı yanda).
                if (side) {
                    const incs = (it.rawVotes || []).map(function (v) { return v.incisors ? (v.side === side ? v.incisors : (v.incisors === 'left' ? 'right' : 'left')) : null; }).filter(function (x) { return x; });
                    it.rawIncisors = incs.length && incs.every(function (x) { return x === incs[0]; }) ? incs[0] : null;
                    if (setO && crop.setSide && crop.setSide[it.name]) it.rawIncisors = crop.setSide[it.name];
                }
                if (!side) it.note = 'ham karenin yönü okunamadı (dik ' + tops + ' / baş aşağı ' + bottoms + ' oy); 180° varsayıldı, kontrol edin';
                else if (!ownSide) notes.push(labelOfKey(it.slot) + ': kendi okuması yok, set oylaması uygulandı (' + (side === 'top' ? '0°' : '180°') + ')');
            }
            // Çift kısıtı: iki bukkal dik durunca kesiciler karşı yanlarda olmalı. İkisi de aynı yanı veriyorsa biri ters duruyor demektir;
            // iki ölçeği birbiriyle çelişen (yüz ≠ diş) kare ters çevrilir (Altan 1.Ref 1696: "dik (yüz), baş aşağı (diş)" yanlış dikti).
            // İkisi de tutarlıysa dokunulmaz (fixBuccalSides uyarır).
            const bR = ruled.find(function (o) { return o.slot === 'buccal_right'; }), bL = ruled.find(function (o) { return o.slot === 'buccal_left'; });
            if (bR && bL && bR.rawIncisors && bL.rawIncisors && bR.rawIncisors === bL.rawIncisors) {
                const weak = [bR, bL].filter(function (o) { return !o.selfConsistent; });
                if (weak.length === 1) {
                    const o = weak[0];
                    const was = o.orient && o.orient.rotate === 0 ? 0 : 180;
                    o.orient = { rotate: was === 0 ? 180 : 0, mirror: false, raw: true, warning: '' };
                    o.rawIncisors = o.rawIncisors === 'left' ? 'right' : 'left';
                    notes.push(labelOfKey(o.slot) + ': iki bukkalda kesiciler aynı yandaydı; okumaları çelişen bu kare ' + (was === 0 ? '180°' : '0°') + ' olarak düzeltildi');
                }
            }
            ruled.forEach(function (o) { notes.push(labelOfKey(o.slot) + ' = ' + (o.item0 ? o.item0.name : '?') + ': ' + ((o.rawVotes || []).map(function (v) { return (v.side === 'top' ? 'dik' : 'baş aşağı') + (v.byFace ? ' (yüz)' : ' (diş)'); }).join(', ') || 'okuma yok') + (o.rawIncisors ? '; kesiciler ' + (o.rawIncisors === 'right' ? 'sağda' : 'solda') : '')); });
            const sideName = { top: 'üstte', bottom: 'altta', left: 'solda', right: 'sağda' };
            posed.filter(function (o) { return o.occRaw; }).forEach(function (o) { notes.push(labelOfKey(o.slot) + ' = ' + o.name + ': ham karede kesiciler ' + (sideName[o.incisors_side] || 'okunamadı') + ', çene okuması ' + (o.arch === 'upper' ? 'üst' : o.arch === 'lower' ? 'alt' : 'yok') + ', EXIF ' + (o.exifRotate || 0) + '°'); });
            if (ruled.length) notes.push('Ön/yan ham kareler: ' + readCount + ' okuma / ' + ruled.length + ' yuva (dik ' + tops + ' / baş aşağı ' + bottoms + ' oy) → ' + (setUpright === 'top' ? '0°' : '180°'));
            const items = (await legacyWork).concat(posed);
            // 4) Sağ/sol bukkal ve üst/alt oklüzal karışıklığı (orijinaller yer değiştirir).
            let pairChanged = false;
            try {
                const rb = await fixBuccalSides(items, placed, !!direct);
                if (rb) { if (rb !== 'virtual') pairChanged = true; setStatus('Sağ/sol bukkal düzeltildi…'); }
                const ro = await fixOcclusalArches(items, placed, !!direct);
                if (ro) { if (ro !== 'virtual') pairChanged = true; setStatus('Üst/alt oklüzal düzeltildi…'); }
            } catch (error) {
                notes.push('Yuva denetimi yapılamadı (' + error.message + ')');
            }
            const boxes = await boxWork;
            boxes.notes.forEach(function (n) { notes.push(n); });
            // Ağız içi kutular: yer değiştirmeler bitti, yön biliniyor → kare dikleştirilip modele öyle gösterilir (yan duran karede
            // ölçümler şaşıyordu); çerçeve ve kırpma dikleştirilmiş karede. Yönü bilinmeyen kare ham haliyle ölçülür.
            const uprightOf = {};
            // Kutular yuva yuva (her kare ayrı çağrı): planlamada erken okunan kutu varsa o alınır; kutusu gelen yuva ötekileri
            // (özellikle oklüzal şerit okumalarını) beklemeden kırpılıp yüklenir.
            const boxOf = {};
            if (crop) {
                if (pairChanged) {
                    for (const slot of SLOTS) {
                        if (!tileOf(slot.key)) { delete placed[slot.key]; continue; }
                        try { const r = await resolveSlot(slot.key); if (r) placed[slot.key] = r; } catch (error) { /* eski eşleme kalır */ }
                    }
                }
                setStatus('Ağız içi kırpma kutuları okunuyor…');
                for (const slot of SLOTS) {
                    const r = placed[slot.key];
                    if (!r) continue;
                    const it = items.find(function (x) { return x.slot === slot.key; });
                    const target = it && it.is_photo ? decide(slot.key, it) : null;
                    const key = slot.key, item = r.item;
                    const preKey = target ? boxKey(key, item.name, target) : 'box|' + key + '|' + item.name + '|ham';
                    boxOf[key] = take(preKey, async function () {
                        let thumb = null, w = item.w, h = item.h, upright = false;
                        if (target) {
                            try {
                                const up = await window.idsfyCrop.uprightThumb(item, target);
                                thumb = up.data; w = up.w; h = up.h; upright = true;
                            } catch (error) { notes.push(item.name + ': kare dikleştirilemedi (' + error.message + '), ham haliyle ölçüldü'); }
                        }
                        const res = await window.idsfyCrop.readBoxes([{ item: item, slot: key, thumb: thumb, w: w, h: h }], function () {}).catch(boxFail);
                        return { res: res, upright: upright };
                    }).then(function (b) {
                        if (b.upright) uprightOf[item.name] = true;
                        Object.assign(boxes.byName, b.res.byName);
                        b.res.notes.forEach(function (n) { notes.push(n); });
                        return b;
                    }, function (error) { return { res: boxFail(error), upright: false }; });
                }
                Promise.all(Object.keys(boxOf).map(function (k) { return boxOf[k]; })).then(function () { lap('ağız içi kutular okundu'); });
            }
            // 5) Her yuva: kırp + döndür (+ ayna) + "Değiştir" (yüzler yön okumaları sürerken yapıldı).
            const pending = [];
            for (const key of ALL_KEYS) {
                if (auto && state.stopped) { halted = true; break; }
                if (!has(key) || done[key]) continue;
                if (crop && FACE_KEYS.indexOf(key) >= 0 && placed[key]) continue;
                const intra = isIntraoral(key);
                const item = intra ? items.find(function (it) { return it.slot === key; }) : null;
                if (intra && item && !item.is_photo) {
                    state.results[key] = { ok: true, text: 'tarama görüntüsü, dokunulmadı' };
                    render();
                    continue;
                }
                const target = intra ? (item ? decide(key, item) : null) : { rotate: 0, mirror: false, warning: '' };
                // İki yuva aynı yana okunduysa okuma şüphelidir, yuva değil: uyarı yerine not (IDS'in yerleşimi genelde doğru).
                if (target && item && item.sameSide && /sağ\/sol şüpheli/.test(target.warning)) {
                    notes.push(labelOfKey(key) + ': sağ/sol okuması çelişkili (iki bukkal aynı yana okundu); IDS\'in yerleşimi korundu');
                    target.warning = target.warning.split('; ').filter(function (w) { return !/sağ\/sol şüpheli/.test(w); }).join('; ');
                }
                // Tek bukkalde sağ/sol okuması yuvayla çelişiyorsa ya da dönüş yalnız ön dişlerden (yuva varsayımıyla) çıktıysa sınıflandırma
                // hakemdir: etiket yuvayı doğruluyorsa (IDS + sınıflandırma 2'ye 1) uyarı değil not; etiket de karşı yuvayı söylüyorsa uyarı kalır.
                if (target && placed[key] && /sağ\/sol şüpheli|üst çenenin yönü okunamadı/.test(target.warning) && crop && crop.labelOf && crop.labelOf[placed[key].item.name] === key) {
                    notes.push(labelOfKey(key) + ': ' + (/sağ\/sol şüpheli/.test(target.warning) ? 'yön okuması karşı yanı gördü' : 'üst çenenin yönü okunamadı, dönüş ön dişlerden') + '; sınıflandırma ve IDS yuvayı doğruladı');
                    target.warning = target.warning.split('; ').filter(function (w) { return !/sağ\/sol şüpheli|üst çenenin yönü okunamadı/.test(w); }).join('; ');
                }
                // Ön dişlerin yönü okunamadıysa dönüş yine üst çeneden (güvenilir) ve yerleşim IDS'in: uyarı değil not.
                if (target && /ön dişlerin yönü okunamadı/.test(target.warning)) {
                    notes.push(labelOfKey(key) + ': ön dişlerin yönü okunamadı; dönüş üst çeneden, yuva IDS\'in yerleşimi');
                    target.warning = target.warning.split('; ').filter(function (w) { return !/ön dişlerin yönü okunamadı/.test(w); }).join('; ');
                }
                const r = placed[key];
                const label = labelOfKey(key);
                if (!r) {
                    // Klasör kaydı var ama kare orijinallerle eşlenmedi (ör. sayfa yenilenince IDS'in geri getirdiği, daha önce kırpıp
                    // aynaladığımız kare): dokunulmaz; yoksa ikinci kez döndürülüp aynalanır. Klasör kaydı hiç yoksa (elle yükleme) eski yol.
                    if (!intra) continue;
                    if (crop) { state.results[key] = { ok: true, text: 'orijinallerle eşlenemedi, dokunulmadı', warning: 'yönü ve kırpmayı elle kontrol edin' }; render(); continue; }
                    if (processedSlots().indexOf(key) >= 0) {
                        state.results[key] = { ok: true, text: 'daha önce bu eklentiyle düzeltilmişti, dokunulmadı', warning: 'gerekirse ↻ düğmeleriyle düzeltin' };
                        render();
                        continue;
                    }
                    if (!target) { failed++; state.results[key] = { ok: false, text: 'yön okunamadı, elle düzeltin' }; render(); continue; }
                    setStatus(label + ' düzeltiliyor…');
                    try {
                        await applyOrientation(key, target);
                        state.results[key] = { ok: true, text: describe(target) + (crop ? ' (eşlenemedi, kırpılmadı)' : ''), warning: target.warning };
                    } catch (error) {
                        failed++;
                        state.results[key] = { ok: false, text: error.message };
                    }
                    render();
                    continue;
                }
                const boxWait = intra && boxOf[key] ? boxOf[key] : Promise.resolve(null);
                pending.push(boxWait.then(function () { return placeCropped(key, r, boxes.byName[r.item.name] || null, target, intra, !!uprightOf[r.item.name]); }).then(render));
            }
            await Promise.all(pending);
            lap('ağız içi yuvalar bitti');
            await faceWork;
            lap('bitti');
            mark('düzeltme bitti');
            if (crop) { crop.preClosed = true; crop.pre = {}; }
            notes.push('Süre dağılımı (sn): ' + laps.join(', '));
            if (state.marks && state.marks.length) notes.push((direct ? 'Başlangıçtan beri (sn): ' : 'Bırakmadan beri (sn): ') + state.marks.join(', ') + (crop && crop.preUsed ? '; erken okumalardan ' + crop.preUsed + ' tanesi kullanıldı' : ''));
            // Hızlandırma ölçümü: model çağrıları türe göre (adet, ortanca, en uzun), hız sınırı kalanları; dik okuma işleri.
            try {
                const st = await window.idsfyCrop.stats();
                const by = {};
                st.forEach(function (s) { const k = s.kind + ' ' + (/opus/.test(s.model) ? 'opus' : 'sonnet'); (by[k] = by[k] || []).push(s); });
                const q = function (a, f) { const b = a.slice().sort(function (x, y) { return x - y; }); return (b[Math.floor(b.length * f)] / 1000).toFixed(1); };
                const minOf = function (key) { const v = st.map(function (s) { return Number(s[key]); }).filter(function (x) { return x >= 0 && isFinite(x) && !isNaN(x); }); return v.length ? Math.min.apply(null, v) : '?'; };
                notes.push('Model çağrıları (' + st.length + '): ' + Object.keys(by).map(function (k) { const a = by[k].map(function (s) { return s.ms; }); return k + ' ×' + a.length + ' ortanca ' + q(a, 0.5) + ' en uzun ' + q(a, 0.999) + ' sn' + (by[k].some(function (s) { return s.err; }) ? ' (HATA: ' + by[k].filter(function (s) { return s.err; }).map(function (s) { return s.err; }).join(' | ') + ')' : ''); }).join('; ') + '; kalan: istek ' + minOf('reqLeft') + ', giriş jetonu ' + minOf('tokLeft') + ', çıkış jetonu ' + minOf('outLeft'));
                // Jeton toplamı ve liste fiyatıyla yaklaşık maliyet (Sonnet 2/10, Opus 4/20 $ per milyon; önbellek sayılmaz).
                const tot = { sIn: 0, sOut: 0, oIn: 0, oOut: 0 };
                st.forEach(function (s) { const o = /opus/.test(s.model); tot[o ? 'oIn' : 'sIn'] += Number(s.inTok) || 0; tot[o ? 'oOut' : 'sOut'] += Number(s.outTok) || 0; });
                const usd = (tot.sIn * 2 + tot.sOut * 10 + tot.oIn * 4 + tot.oOut * 20) / 1e6;
                notes.push('Jeton toplamı: Sonnet giriş ' + Math.round(tot.sIn / 1000) + ' bin / çıkış ' + Math.round(tot.sOut / 1000) + ' bin; Opus giriş ' + Math.round(tot.oIn / 1000) + ' bin / çıkış ' + Math.round(tot.oOut / 1000) + ' bin; liste fiyatıyla ~' + usd.toFixed(2) + ' $');
                const ut = window.idsfyCrop.upTimes.splice(0);
                if (ut.length) notes.push('Dik okuma işleri (kuyruk/hazırlık/toplam sn): ' + ut.map(function (r) { return r.name + ' ' + r.mode + ' ' + (r.queue / 1000).toFixed(1) + '/' + (r.prep / 1000).toFixed(1) + '/' + (r.total / 1000).toFixed(1) + (r.arb ? ' hakem' : ''); }).join(', '));
            } catch (error) { notes.push('İstatistik alınamadı (' + error.message + ')'); }
            if (crop) {
                crop.timing.fix = Math.round((Date.now() - began) / 1000);
                crop.timing.cropped = croppedCount;
                crop.timing.slots = Object.keys(placed).length;
            }
            setStatus(halted ? 'Durduruldu; kalan yuvalar düzeltilmedi.' : failed
                ? failed + ' yuva düzeltilemedi; elle kontrol edin.'
                : 'Yönler düzeltildi' + (crop ? ' ve fotoğraflar kırpıldı' : '') + '. Yuvaları gözden geçirin.', failed > 0);
            // IDS yuvada çözünürlük ünlemi (kırmızı !) verdiyse satıra uyarı olarak yazılır; kırpılmış dosya boyutu da eklenir.
            try {
                for (const key of idsResolutionWarnings()) {
                    const p = crop && crop.placed[key] && crop.placed[key].cropped;
                    const size = p && p.width ? ' (yüklenen kırpma ' + p.width + 'x' + p.height + ' px)' : '';
                    const text = 'IDS çözünürlük ünlemi verdi' + size + '; fotoğraf IDS gereksinimini karşılamıyor olabilir';
                    const row = state.results[key] || { ok: true, text: 'IDS ünlemi' };
                    row.warning = row.warning ? row.warning + '; ' + text : text;
                    state.results[key] = row;
                }
                render();
            } catch (error) { /* ünlem denetimi başarısızsa sessiz geçilir */ }
            const warned = Object.keys(state.results).filter(function (key) {
                return state.results[key].warning;
            }).length;
            clean = !failed && !warned && !halted;
        } catch (error) {
            setStatus('Hata: ' + error.message, true);
        }
        if (crop) setNotes(crop.notes);
        state.busy = false;
        render();
        return clean;
    }

    // "Kırpılmamış hallerine dön": kırptığımız her yuvaya orijinalin yönü düzeltilmiş ama kırpılmamış hali konur.
    async function uncropAll(clean) {
        const crop = state.crop;
        if (!crop) return;
        state.busy = true;
        render();
        try {
            for (const key of ALL_KEYS) {
                const p = crop.placed[key];
                if (!p || !p.cropped || !tileOf(key)) continue;
                setStatus(labelOfKey(key) + ' kırpılmamış haline döndürülüyor…');
                try {
                    const out = await window.idsfyCrop.fullFor(p.item, p.orient);
                    await replaceInSlot(key, out.file);
                    const img = previewOf(key);
                    p.cropped = null;
                    p.src = img ? img.src : '';
                    state.results[key] = { ok: true, text: 'kırpılmamış hali (yön düzeltilmiş)' };
                } catch (error) {
                    state.results[key] = { ok: false, text: 'geri alınamadı: ' + error.message };
                }
                render();
            }
            setStatus('Kırpma geri alındı; yönler korundu.');
        } finally {
            state.busy = false;
            render();
        }
        showActions([{ text: 'Devam et', run: function () { showActions([]); announce(clean); } }]);
    }

    // Yükleme ve düzeltme kendiliğinden yapıldıysa sonucu duyurur: reçete akışı (rx.js)
    // bunu dinleyip ilerler; hasta sihirbazında "İleri"ye burada basılır. Uyarı ya da
    // hata varsa ilerlenmez.
    // Bir yuvadaki fotoğrafı siler: kalem menüsü > son düğme "Sil" > onay penceresinde "Sil".
    async function deleteSlot(tile, slotName) {
        const pencil = tile.querySelector('[class*="UploadedPhoto-editButton"]');
        if (!pencil) throw new Error('düzenle düğmesi bulunamadı');
        if (visibleDialog()) throw new Error('açık bir pencere var');
        closeMenus();
        await sleep(200);
        pencil.click();
        if (!(await waitFor(function () { return !!menuButtons(); }, 3000))) throw new Error('düzenleme menüsü açılmadı');
        const buttons = menuButtons();
        const remove = buttons[buttons.length - 1];
        if (!/sil|delete|remove|löschen/i.test(remove.textContent)) throw new Error('menüde "Sil" bulunamadı');
        remove.click();
        const confirmButton = function () {
            const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(function (d) { return d.offsetWidth > 0; });
            if (!dialog) return null;
            const list = Array.from(dialog.querySelectorAll('button'));
            return list.find(function (b) { return /^\s*(sil|delete|remove|evet|yes)\s*$/i.test(b.textContent); }) || list[list.length - 1] || null;
        };
        if (!(await waitFor(function () { return !!confirmButton(); }, 3000))) throw new Error('silme onayı açılmadı');
        confirmButton().click();
        // Silme sunucuya gider; sihirbazda birkaç saniye sürebilir. Yuva boş girişe dönünce biter.
        const emptied = function () {
            const stillFilled = document.querySelector('input[type="file"][id$="-' + slotName + '-uploaded-photo-input"]');
            const empty = document.querySelector('input[type="file"][id$="-' + slotName + '-uploader-input"]');
            return !stillFilled || !!empty;
        };
        if (!(await waitFor(emptied, 25000))) throw new Error('IDS fotoğrafı silmedi');
        await waitFor(function () { return !visibleDialog(); }, 5000);
        await sleep(600);
    }

    function visibleDialog() {
        return Array.from(document.querySelectorAll('[role="dialog"]')).find(function (d) { return d.offsetWidth > 0; }) || null;
    }

    // Tüm dolu yuvaları sırayla boşaltır (hasta sihirbazı ve reçete). Kullanıcı düğmesiyle çalışır.
    async function deleteAll() {
        state.busy = true;
        state.results = {};
        render();
        let removed = 0;
        const failed = [];
        try {
            // Dolu yuvaların adları baştan alınır; her yuva en çok iki kez denenir, başarısız
            // olan atlanıp kalanlara geçilir.
            const names = Array.from(document.querySelectorAll('input[type="file"][id$="-uploaded-photo-input"]'))
                .map(function (input) { return input.id.replace(/^.*-next-/, '').replace('-uploaded-photo-input', ''); });
            for (const slotName of names) {
                let done = false;
                let lastError = null;
                for (let attempt = 0; attempt < 2 && !done; attempt++) {
                    const filled = document.querySelector('input[type="file"][id$="-' + slotName + '-uploaded-photo-input"]');
                    if (!filled) { done = true; break; }
                    setStatus('Siliniyor: ' + slotName + (attempt ? ' (yeniden)' : '') + '…');
                    try {
                        await deleteSlot(filled.parentElement, slotName);
                        removed++;
                        done = true;
                    } catch (error) {
                        lastError = error.message;
                        closeMenus();
                        await sleep(1500);
                    }
                }
                if (!done) failed.push(slotName + ' (' + lastError + ')');
            }
            closeMenus();
            try { localStorage.removeItem(processedKey()); } catch (error) { /* yok */ }
            setStatus(failed.length
                ? removed + ' fotoğraf silindi; silinemeyen: ' + failed.join(', ') + '. Bunları elle silin.'
                : removed + ' fotoğraf silindi.', failed.length > 0);
        } finally {
            state.busy = false;
            render();
        }
    }

    // Düzeltmeden sonra ilerlemeden önce kullanıcı yuvaları gözden geçirir. Kırpma kaydı varsa kırpma geri alınabilir
    // ("Kırpılmamış hallerine dön": yön korunur); yoksa (kırpma kapalı ya da elle yükleme) IDS'te elle kırpması beklenir.
    function askCrop(clean) {
        if (state.stopped) return;
        const crop = state.crop;
        if (crop) {
            const t = crop.timing || {};
            setStatus((clean ? 'Yönler düzeltildi' : 'Düzeltme uyarılarla bitti') + '; fotoğraflar yerleştirildikten sonra kırpıldı (' +
                (t.cropped || 0) + '/' + (t.slots || 0) + (t.fix ? ', ' + t.fix + ' sn' : '') + '). Yuvaları kontrol edin.' +
                (crop.notes.length ? ' Ayrıntılar için ⓘ Notlar.' : ''));
            setNotes(crop.notes);
            showActions([
                { text: 'Devam et', run: function () { showActions([]); announce(clean); } },
                { text: 'Kırpılmamış hallerine dön', run: function () { showActions([]); uncropAll(clean); } }
            ]);
            return;
        }
        setStatus((clean ? 'Yönler düzeltildi. ' : 'Yön düzeltmesi uyarılarla bitti. ') +
            'Fotoğrafları kırpmanız bekleniyor (yuvada kalem > Kırp). Bitince seçin:');
        showActions([
            { text: 'Kırptım, devam et', run: function () { showActions([]); announce(clean); } },
            { text: 'Kırpmadan devam et', run: function () { showActions([]); announce(clean); } }
        ]);
    }

    function showActions(list) {
        const area = panel.querySelector('.idsfy-actions');
        if (!area) return;
        area.textContent = '';
        list.forEach(function (action) {
            const button = el('button', 'idsfy-button', action.text);
            button.type = 'button';
            button.addEventListener('click', function () { action.run(); });
            area.appendChild(button);
        });
    }

    // Hasta birden fazla refinement görmüşse birden fazla refinement klasörü olabilir; hangisinin
    // kullanılacağı sorulur ve bu reçete için hatırlanır (CBCT yüklemesi de aynı seçimi kullanır).
    function refinementChoiceKey() {
        const params = new URLSearchParams(location.search);
        return 'idsfy-refinement-folder-' + (params.get('formId') || params.get('patientId') || '');
    }

    function askRefinementFolder(handle, choices, bridge, explicit) {
        setStatus('Birden fazla refinement klasörü var; fotoğrafları hangisinden alalım?');
        showActions(choices.map(function (name) {
            return {
                text: name,
                run: async function () {
                    sessionStorage.setItem(refinementChoiceKey(), name);
                    showActions([]);
                    setStatus('"' + name + '" klasörü okunuyor…');
                    try {
                        const files = await window.idsfyFolder.images(handle, 'refinement', name);
                        if (!files.length) { setStatus('"' + name + '" içinde fotoğraf yok.', true); return; }
                        onFolder(files, bridge, explicit);
                    } catch (error) {
                        setStatus('Klasör okunamadı: ' + error.message, true);
                    }
                }
            };
        }));
    }

    // Hangi fotoğraf kümesi: refinement reçetesinde hasta klasörünün "Refinement" alt klasörü,
    // yeni hastada "Başlangıç" alt klasörü ya da klasörün kendisi.
    function photoKind() {
        return /\/rx\/secondary\/additionalAligners\.action$/.test(location.pathname) ? 'refinement' : 'new';
    }

    function announce(clean) {
        document.documentElement.dataset.idsfyPhotos = clean ? 'ok' : 'check';
        document.dispatchEvent(new CustomEvent('idsfy-photos-done'));
        if (!clean || state.stopped || !/\/patient\/editPatient\.action$/.test(location.pathname)) return;
        const next = document.getElementById('uploadButton') || document.querySelector('.next-button');
        if (next && !next.disabled) {
            setStatus('Yönler düzeltildi. Sonraki adıma geçiliyor…');
            setTimeout(function () { if (!state.stopped) next.click(); }, 1500);
        }
    }

    function buildPanel() {
        panel = el('div', 'idsfy-panel');
        const head = el('div', 'idsfy-head');
        head.appendChild(el('span', '', 'IDS Foto Yükleyici'));
        const toggle = el('button', 'idsfy-toggle', '–');
        toggle.type = 'button';
        toggle.addEventListener('click', function () {
            toggle.textContent = panel.classList.toggle('idsfy-collapsed') ? '+' : '–';
        });
        head.appendChild(toggle);
        panel.appendChild(head);

        const body = el('div', 'idsfy-body');
        panel.appendChild(body);

        // Sayfa dünyasındaki köprü (page.js) dosyaları bu girişten okur.
        const bridge = el('input', 'idsfy-picker');
        bridge.type = 'file';
        bridge.multiple = true;
        bridge.id = 'idsfy-bridge';
        body.appendChild(bridge);

        const picker = el('input', 'idsfy-picker');
        picker.type = 'file';
        picker.multiple = true;
        picker.webkitdirectory = true;
        picker.setAttribute('aria-label', 'Hasta klasörü');
        picker.addEventListener('change', function () {
            if (picker.files.length) onFolder(picker.files, bridge, true);
            picker.value = '';
        });
        body.appendChild(picker);

        // Hastanın klasörü ana klasörde adından bulunup IDS'e bırakılır (gerekirse izin istenir);
        // bulunamazsa klasör seçme penceresi açılır. "Durdur" açıkken de çalışır.
        const choose = el('button', 'idsfy-button', 'Hasta klasörünü otomatik yükle');
        choose.type = 'button';
        choose.addEventListener('click', async function () {
            if (!(await dropRemembered(bridge, true, true))) picker.click();
        });
        body.appendChild(choose);

        const manual = el('button', 'idsfy-button', 'Klasörü elle seç');
        manual.type = 'button';
        manual.addEventListener('click', function () { picker.click(); });
        body.appendChild(manual);

        const fix = el('button', 'idsfy-button', 'Yönleri düzelt');
        fix.type = 'button';
        fix.addEventListener('click', function () { onFix(); });
        body.appendChild(fix);

        const remove = el('button', 'idsfy-button idsfy-danger', 'Tüm fotoları sil');
        remove.type = 'button';
        remove.addEventListener('click', function () {
            const count = document.querySelectorAll('input[type="file"][id$="-uploaded-photo-input"]').length;
            if (!count) { setStatus('Silinecek fotoğraf yok.'); return; }
            if (!window.confirm(count + ' fotoğraf IDS\'ten silinecek. Emin misiniz?')) return;
            deleteAll();
        });
        body.appendChild(remove);

        // Durdur / Devam et: durdurulunca kullanıcı fotoğrafları elle yükleyip İleri'ye kendisi
        // basar; "Devam et" bekleyen yüklemeyi izleyip yönleri düzeltir ve ilerler.
        const stopButton = el('button', 'idsfy-button idsfy-stop', 'Durdur');
        stopButton.type = 'button';
        stopButton.addEventListener('click', function () {
            state.stopped = !state.stopped;
            if (state.stopped) {
                sessionStorage.setItem(stopKey(), '1');
                render();
                setStatus('Durduruldu. Fotoğrafları elle yükleyip "İleri"ye siz basın; isterseniz ' +
                    '"2. Yönleri düzelt"i kullanın. Kendiliğinden sürmesi için "Devam et".');
            } else {
                sessionStorage.removeItem(stopKey());
                render();
                setStatus('Sürdürülüyor; yükleme bitince yönler düzeltilecek…');
                fixWhenUploaded(0);
            }
        });
        body.appendChild(stopButton);

        body.appendChild(el('div', 'idsfy-status', 'Hastanın fotoğraf klasörünü seçin.'));
        // Notlar: varsayılan kapalı; "ⓘ Notlar" düğmesiyle açılır (notlar yoksa düğme görünmez).
        const noteBar = el('div', 'idsfy-notebar');
        noteBar.style.display = 'none';
        const noteButton = el('button', 'idsfy-mini', 'ⓘ Notlar');
        noteButton.type = 'button';
        noteButton.setAttribute('aria-expanded', 'false');
        const noteBox = el('div', 'idsfy-notes');
        noteButton.addEventListener('click', function () {
            const open = noteBox.classList.toggle('open');
            noteButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        noteBar.appendChild(noteButton);
        noteBar.appendChild(noteBox);
        body.appendChild(noteBar);
        body.appendChild(el('div', 'idsfy-actions'));
        body.appendChild(el('div', 'idsfy-list'));

        document.body.appendChild(panel);
        render();
        // Ortak ana klasörün izni köprü kutusundan verilince klasör kendiliğinden bırakılır.
        document.addEventListener('idsfy-folder-ready', function () {
            if (state.stopped || state.busy) return;
            if (document.querySelector('input[type="file"][id$="-uploaded-photo-input"]')) return;
            dropRemembered(bridge, false);
        });
        rxStopped().then(function (stopped) {
            if (stopped || sessionStorage.getItem(stopKey())) {
                state.stopped = true;
                render();
                setStatus(stopped
                    ? 'Form doldurucu durduruldu; fotoğraflar size bırakıldı ("1. Hasta klasörünü yükle" ile yine yüklenebilir).'
                    : 'Bu hastada fotoğraf adımı durdurulmuştu; klasör kendiliğinden bırakılmaz. "Devam et" ile sürdürün.');
                return;
            }
            dropRemembered(bridge, false);
        });
    }

    // Hastanın klasörü ana klasörde adından bulunabiliyorsa (ya da bu hasta için elle
    // seçilmişse) sorulmadan IDS'e bırakılır. Bulunamazsa false döner.
    async function dropRemembered(bridge, mayAskPermission, explicit) {
        try {
            let found = await window.idsfyFolder.resolve();
            if (found.status === 'needs-permission' && mayAskPermission && await window.idsfyFolder.grant()) {
                found = await window.idsfyFolder.resolve();
            }
            if (found.status === 'needs-permission') {
                setStatus(found.shared
                    ? 'Klasör izni gerekiyor: sağ üstteki kutuda "İzin ver"e basın.'
                    : 'Klasör izni gerekiyor: "Hasta klasörünü otomatik yükle"ye basın.');
                return false;
            }
            if (found.status === 'no-root') {
                if (!explicit) {
                    setStatus('Ana klasör bu bilgisayarda seçilmemiş; "Hasta klasörünü otomatik yükle"ye basın.');
                    return false;
                }
                // Ana klasör (hasta klasörlerinin durduğu üst klasör) bir kez seçilir, sonra hasta aranır.
                setStatus('Ana klasör henüz seçilmedi: hasta klasörlerinin durduğu üst klasörü seçin.');
                await window.idsfyFolder.pickRoot();
                return dropRemembered(bridge, true, true);
            }
            if (found.status === 'not-found') {
                setStatus('"' + found.root + '" içinde "' + window.idsfyFolder.patientName() + '" adına uyan klasör yok' +
                    (explicit ? '; hastanın klasörünü elle seçin.' : '.'), true);
                return false;
            }
            if (found.status === 'ambiguous') {
                setStatus('Birden çok klasör uyuyor: ' + found.names.join(', ') +
                    (explicit ? '; hastanın klasörünü elle seçin.' : '.'), true);
                return false;
            }
            if (found.status !== 'ok') return false;
            const kind = photoKind();
            setStatus('"' + found.handle.name + '" klasörü okunuyor…');
            const choice = kind === 'refinement' ? sessionStorage.getItem(refinementChoiceKey()) : null;
            const files = await window.idsfyFolder.images(found.handle, kind, choice);
            if (files.choices && files.choices.length) {
                askRefinementFolder(found.handle, files.choices, bridge, explicit);
                return true;
            }
            if (!files.length) {
                setStatus(kind === 'refinement'
                    ? '"' + found.handle.name + '" içinde "Refinement" alt klasörü ya da içinde fotoğraf bulunamadı.'
                    : '"' + found.handle.name + '" içinde (ya da "Başlangıç" alt klasöründe) fotoğraf bulunamadı.', true);
                return true;
            }
            onFolder(files, bridge, explicit);
            return true;
        } catch (error) {
            setStatus('Hasta klasörü okunamadı; klasörü elle seçin.', true);
            return false;
        }
    }

    // IDS adımlar arasında sayfayı yeniden çizdiği için panel, Fotoğraflar adımının
    // yükleme girişleri göründükçe gösterilir.
    setInterval(function () {
        const show = onPhotosStep();
        if (show && !panel) buildPanel();
        if (panel) panel.style.display = show ? '' : 'none';
    }, 1000);
})();
