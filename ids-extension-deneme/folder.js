// IDS Yardımcısı - hasta klasörü.
// Hasta klasörlerinin durduğu ana klasör bir kez seçilir; her hastada, adı IDS'teki hasta
// adını taşıyan alt klasör kendiliğinden bulunur. Bulunamazsa hastanın klasörü elle
// seçilebilir ve o hasta için hatırlanır. Klasör tanıtıcıları tarayıcıda (IndexedDB)
// saklanır; Chrome okuma iznini ayrıca sorar. content.js ve portrait.js bu nesneyi kullanır.
window.idsfyFolder = (function () {
    'use strict';

    const DB_NAME = 'idsfy';
    const STORE = 'kv';
    const ROOT_KEY = 'root';
    const PATIENT_KEY = 'folder';
    const PATIENT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    const IMAGE = /\.(jpe?g|png)$/i;

    // Hasta klasörünün alt klasörleri: "Başlangıç" (ya da doğrudan klasördeki fotoğraflar) yeni hasta
    // girişinde, "Refinement" refinement reçetesinde, "CBCT" klasörü CBCT olarak kullanılır. Adlarda
    // yazım hatası ya da ek sözcük olabilir ("Fırat CBCT 06092026", "rifaynıt"); sözcükler Türkçe
    // karakterden bağımsız ve yakın yazımlara (düzenleme uzaklığı) göre eşlenir.
    const KIND_WORDS = {
        cbct: ['cbct', 'cbtc', 'tomografi', 'tomo', 'dicom', 'dcm', 'volumetrik', 'konik'],
        refinement: ['refinement', 'refinman', 'rifaynmint', 'rafinman', 'additional', 'ekhizalayici', 'refine'],
        start: ['baslangic', 'ilk', 'initial', 'start', 'yenihasta', 'ilkkayit', 'ilkgiris']
    };

    function distance(a, b) {
        const rows = [];
        for (let i = 0; i <= a.length; i++) rows.push([i]);
        for (let j = 1; j <= b.length; j++) rows[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
                    rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return rows[a.length][b.length];
    }

    function like(token, word) {
        if (token === word) return true;
        if (word.length < 4) return false;
        return distance(token, word) <= Math.floor(word.length / 4);
    }

    function kindOf(name) {
        const toks = tokens(name);
        const joined = toks.join('');
        const kinds = ['cbct', 'refinement', 'start'];
        for (const kind of kinds) {
            for (const word of KIND_WORDS[kind]) {
                if (toks.some(function (t) { return like(t, word); })) return kind;
                if (word.length >= 6 && like(joined, word)) return kind;
            }
        }
        // "rifaynıt", "refinmınt" gibi sesli yazımlar: r?f?n ile başlayan sözcük.
        if (toks.some(function (t) { return /^r[aeiuo]?f[aeiuo]?[iy]n/.test(t); })) return 'refinement';
        return 'other';
    }

    async function listDir(handle) {
        const dirs = [];
        const files = [];
        for await (const entry of handle.values()) {
            (entry.kind === 'directory' ? dirs : files).push(entry);
        }
        return { dirs: dirs, files: files };
    }

    function byName(a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true });
    }

    function store(mode, action) {
        return new Promise(function (resolve, reject) {
            const open = indexedDB.open(DB_NAME, 1);
            open.onupgradeneeded = function () { open.result.createObjectStore(STORE); };
            open.onerror = function () { reject(open.error); };
            open.onsuccess = function () {
                const tx = open.result.transaction(STORE, mode);
                const request = action(tx.objectStore(STORE));
                tx.oncomplete = function () { resolve(request.result); };
                tx.onerror = function () { reject(tx.error); };
            };
        });
    }

    function load(key) {
        return store('readonly', function (s) { return s.get(key); }).catch(function () { return null; });
    }

    function patientId() {
        return new URLSearchParams(location.search).get('patientId') || '';
    }

    function patientName() {
        const header = document.querySelector('.patientName');
        return header ? header.textContent.trim().split('\n')[0].trim() : '';
    }

    function tokens(text) {
        return (text || '').toLocaleLowerCase('tr')
            .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o')
            .replace(/ş/g, 's').replace(/ü/g, 'u')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9]+/).filter(Boolean);
    }

    // Ana klasörü seçtirir; kullanıcı tıklamasıyla çağrılmalıdır.
    async function pickRoot() {
        const handle = await window.showDirectoryPicker({ id: 'idsfy-ana', mode: 'read' });
        await store('readwrite', function (s) { return s.put({ handle: handle }, ROOT_KEY); });
        return handle;
    }

    // Yalnızca bu hastanın klasörünü seçtirir (ana klasörde bulunamadığında).
    async function pickPatient() {
        const handle = await window.showDirectoryPicker({ id: 'idsfy-hasta', mode: 'read' });
        await store('readwrite', function (s) {
            return s.put({ patientId: patientId(), handle: handle, at: Date.now() }, PATIENT_KEY);
        });
        return handle;
    }

    // Ana klasör için okuma iznini ister; kullanıcı tıklamasıyla çağrılmalıdır.
    async function grantLocal() {
        const root = await load(ROOT_KEY);
        return !!root && (await root.handle.requestPermission({ mode: 'read' })) === 'granted';
    }

    // Klasördeki görüntüler. İndirilen klasörlerde fotoğraflar çoğu kez bir alt klasörde
    // durur; bu yüzden iki düzey aşağıya bakılır ve en çok görüntü içeren klasör alınır.
    async function imagesIn(handle, depth) {
        const files = [];
        let best = [];
        for await (const entry of handle.values()) {
            if (entry.kind === 'file' && IMAGE.test(entry.name)) {
                files.push(await entry.getFile());
            } else if (entry.kind === 'directory' && (depth || 0) < 2) {
                const inner = await imagesIn(entry, (depth || 0) + 1);
                if (inner.length > best.length) best = inner;
            }
        }
        const chosen = files.length >= best.length ? files : best;
        chosen.sort(byName);
        return chosen;
    }

    // kind: 'new' (yeni hasta: Başlangıç klasörü ya da klasörün kendisi) | 'refinement' (Refinement
    // klasörü; yoksa boş döner). CBCT ve refinement klasörleri yeni hasta fotoğraflarına karışmaz.
    async function imagesLocal(handle, kind, choice) {
        const listing = await listDir(handle);
        const groups = {};
        listing.dirs.forEach(function (d) {
            const k = kindOf(d.name);
            (groups[k] = groups[k] || []).push(d);
        });
        const fullest = async function (dirs) {
            let best = [];
            for (const d of (dirs || []).slice().sort(byName).reverse()) {
                const inner = await imagesIn(d, 0);
                if (inner.length > best.length) best = inner;
            }
            return best;
        };
        if (kind === 'refinement') {
            // Birden fazla refinement klasörü olabilir (hasta birkaç kez refinement görmüş olabilir):
            // tek klasör varsa o, seçim verilmişse o; aksi halde seçenekler döner (kullanıcıya sorulur).
            const dirs = (groups.refinement || []).slice().sort(byName);
            if (!dirs.length) return [];
            let dir = choice ? dirs.filter(function (d) { return d.name === choice; })[0] || null : null;
            if (!dir && dirs.length === 1) dir = dirs[0];
            if (!dir) {
                const empty = [];
                empty.choices = dirs.map(function (d) { return d.name; });
                return empty;
            }
            return imagesIn(dir, 0);
        }
        const fromStart = await fullest(groups.start);
        if (fromStart.length) return fromStart;
        const direct = [];
        for (const entry of listing.files) {
            if (IMAGE.test(entry.name)) direct.push(await entry.getFile());
        }
        if (direct.length) {
            direct.sort(byName);
            return direct;
        }
        return fullest(groups.other);
    }

    // Ana klasörde, adında hasta adının sözcüklerini en çok taşıyan alt klasör(ler).
    async function matches(root, name) {
        const wanted = tokens(name);
        const need = Math.min(2, wanted.length);
        let top = 0;
        let found = [];
        for await (const entry of root.values()) {
            if (entry.kind !== 'directory') continue;
            const have = tokens(entry.name);
            const score = wanted.filter(function (w) { return have.indexOf(w) >= 0; }).length;
            if (score < need || score < top) continue;
            if (score > top) { top = score; found = []; }
            found.push(entry);
        }
        return found;
    }

    // Bu hastanın klasörünü bulur. Sonuç: { status, handle?, names? }
    //   ok               klasör bulundu
    //   no-root          ana klasör henüz seçilmemiş
    //   needs-permission ana klasör seçili ama Chrome izni yeniden istiyor (bir tıklama gerekir)
    //   not-found        ana klasörde bu adla klasör yok
    //   ambiguous        birden fazla klasör aynı ölçüde uyuyor
    async function resolve() {
        const id = patientId();
        const manual = await load(PATIENT_KEY);
        if (manual && id && manual.patientId === id && Date.now() - manual.at < PATIENT_MAX_AGE_MS &&
                (await manual.handle.queryPermission({ mode: 'read' })) === 'granted') {
            return { status: 'ok', handle: manual.handle };
        }
        const shared = await sharedResolve(patientName());
        if (shared) return shared;
        const root = await load(ROOT_KEY);
        if (!root) return { status: 'no-root' };
        if ((await root.handle.queryPermission({ mode: 'read' })) !== 'granted') return { status: 'needs-permission' };
        const name = patientName();
        const found = name ? await matches(root.handle, name) : [];
        if (!found.length) return { status: 'not-found', root: root.handle.name };
        if (found.length > 1) {
            return { status: 'ambiguous', names: found.map(function (f) { return f.name; }) };
        }
        return { status: 'ok', handle: found[0] };
    }

    // Verilen ada göre hasta klasörü (CBCT portalı gibi hasta adının sayfada olmadığı yerler için).
    async function resolveByName(name) {
        const shared = await sharedResolve(name);
        if (shared) return shared;
        const root = await load(ROOT_KEY);
        if (!root) return { status: 'no-root' };
        if ((await root.handle.queryPermission({ mode: 'read' })) !== 'granted') return { status: 'needs-permission' };
        const found = name ? await matches(root.handle, name) : [];
        if (!found.length) return { status: 'not-found', root: root.handle.name };
        if (found.length > 1) return { status: 'ambiguous', names: found.map(function (f) { return f.name; }) };
        return { status: 'ok', handle: found[0] };
    }

    // Hasta klasöründe (6 düzeye kadar; CD kopyalarında derin durur) en çok .dcm dosyası içeren klasör.
    const DICOM = /\.dcm$/i;

    async function dicomDir(handle, depth) {
        let count = 0;
        let best = { handle: handle, count: 0 };
        for await (const entry of handle.values()) {
            if (entry.kind === 'file' && DICOM.test(entry.name)) {
                count++;
            } else if (entry.kind === 'directory' && (depth || 0) < 6) {
                const inner = await dicomDir(entry, (depth || 0) + 1);
                if (inner.count > best.count) best = inner;
            }
        }
        return count >= best.count ? { handle: handle, count: count } : best;
    }

    // CBCT dosyaları: { folder, files } (dosyalar ada göre, sayısal sıralı).
    // parent içindeki CBCT adlı alt klasörlerden en çok .dcm içereni.
    async function bestCbctIn(parent) {
        const listing = await listDir(parent);
        let best = null;
        for (const d of listing.dirs) {
            if (kindOf(d.name) !== 'cbct') continue;
            const found = await dicomDir(d, 0);
            if (found.count && (!best || found.count > best.count)) best = found;
        }
        return best;
    }

    // kind 'refinement': önce (seçilen) refinement klasörünün içindeki CBCT; sonra hasta klasöründeki
    // CBCT klasörü; o da yoksa tüm klasörde en çok .dcm içeren yer.
    async function dicomLocal(handle, kind, choice) {
        let dir = null;
        if (kind === 'refinement') {
            const listing = await listDir(handle);
            const refs = listing.dirs.filter(function (d) {
                return kindOf(d.name) === 'refinement' && (!choice || d.name === choice);
            });
            for (const r of refs) {
                const found = await bestCbctIn(r);
                if (found && (!dir || found.count > dir.count)) dir = found;
            }
        }
        if (!dir) dir = await bestCbctIn(handle);
        if (!dir) dir = await dicomDir(handle, 0);
        const entries = [];
        for await (const entry of dir.handle.values()) {
            if (entry.kind === 'file' && DICOM.test(entry.name)) entries.push(entry);
        }
        entries.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        const files = [];
        for (const entry of entries) files.push(await entry.getFile());
        return { folder: dir.handle.name, files: files };
    }

    // Bu kökende seçili ana klasör ve izin durumu (ayar sayfası ve köprü için).
    async function rootStatus() {
        const root = await load(ROOT_KEY);
        if (!root) return { root: null, permission: 'none' };
        return { root: root.handle.name, permission: await root.handle.queryPermission({ mode: 'read' }) };
    }

    // ---------- Ortak ana klasör (eklenti ayar sayfasında seçilen) ----------
    // Klasör tanıtıcıları kökene bağlıdır: ayar sayfasında (chrome-extension kökeni) seçilen klasör
    // sitelerden doğrudan okunamaz. Eklentinin kendi sayfası (bridge.html) gizli bir iframe olarak
    // yüklenir; klasörü o okur, dosyaları postMessage ile (File nesneleri) aktarır. İzin yenileme
    // tıklaması iframe'in içinde olmalıdır; o zaman iframe görünür kılınır. Ortak kök yoksa bu
    // sitede seçilen yerel kök kullanılır (eski yöntem).
    const IN_EXTENSION = location.protocol === 'chrome-extension:';
    const BRIDGE_TIMEOUT_MS = 10 * 60000;
    let frame = null;
    let frameReady = null;
    let seq = 0;
    const waiting = {};

    function bridgeAvailable() {
        return !IN_EXTENSION && typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id &&
            typeof chrome.runtime.getURL === 'function';
    }

    function extensionOrigin() {
        return chrome.runtime.getURL('').replace(/[/]$/, '');
    }

    function showFrame(visible) {
        if (!frame) return;
        frame.style.display = visible ? 'block' : 'none';
        frame.style.height = visible ? '88px' : '0';
    }

    function onBridgeMessage(event) {
        if (!frame || event.source !== frame.contentWindow || !event.data || !event.data.idsfy) return;
        const msg = event.data;
        if (msg.type === 'ready') {
            if (waiting.ready) { waiting.ready(); waiting.ready = null; }
            return;
        }
        if (msg.type === 'permission') {
            showFrame(false);
            if (waiting.permission) { waiting.permission(!!msg.granted); waiting.permission = null; }
            if (msg.granted) document.dispatchEvent(new CustomEvent('idsfy-folder-ready'));
            return;
        }
        if (msg.id && waiting[msg.id]) {
            waiting[msg.id](msg);
            delete waiting[msg.id];
        }
    }

    function ensureFrame() {
        if (frameReady) return frameReady;
        frameReady = new Promise(function (resolve) {
            frame = document.createElement('iframe');
            frame.id = 'idsfy-bridge-frame';
            frame.src = chrome.runtime.getURL('bridge.html');
            frame.style.cssText = 'position:fixed;right:16px;top:72px;width:340px;height:0;border:0;' +
                'z-index:2147483646;display:none;background:transparent;';
            window.addEventListener('message', onBridgeMessage);
            const timer = setTimeout(function () { waiting.ready = null; resolve(false); }, 8000);
            waiting.ready = function () { clearTimeout(timer); resolve(true); };
            (document.body || document.documentElement).appendChild(frame);
        });
        return frameReady;
    }

    async function bridgeCall(type, payload) {
        if (!bridgeAvailable()) return null;
        if (!(await ensureFrame())) return null;
        return new Promise(function (resolve) {
            const id = 'm' + (++seq);
            const timer = setTimeout(function () { delete waiting[id]; resolve(null); }, BRIDGE_TIMEOUT_MS);
            waiting[id] = function (msg) { clearTimeout(timer); resolve(msg); };
            frame.contentWindow.postMessage(Object.assign({ idsfy: true, id: id, type: type }, payload || {}), extensionOrigin());
        });
    }

    // Ortak kökten hasta klasörü. null: ortak kök yok (yerel yönteme düşülür). Dönen "handle" sahte
    // bir nesnedir ({ shared, name, patientName }); images() ve dicom() onu köprüden okur.
    async function sharedResolve(name) {
        const status = await bridgeCall('status');
        sharedKnown = !!(status && status.root);
        if (!status || !status.root) return null;
        if (status.permission !== 'granted') {
            showFrame(true);
            return { status: 'needs-permission', shared: true, root: status.root };
        }
        const found = await bridgeCall('resolve', { name: name });
        if (!found) return null;
        if (found.status !== 'ok') return Object.assign({ shared: true }, found);
        return { status: 'ok', shared: true, handle: { shared: true, name: found.folder, patientName: name } };
    }

    // Ortak kök için izin: iframe'deki düğme gösterilir, kullanıcı basınca sonuç döner.
    // null: ortak kök yok.
    async function sharedGrant() {
        const status = await bridgeCall('status');
        sharedKnown = !!(status && status.root);
        if (!status || !status.root) return null;
        if (status.permission === 'granted') return true;
        showFrame(true);
        return new Promise(function (resolve) {
            const timer = setTimeout(function () { waiting.permission = null; resolve(false); }, 2 * 60000);
            waiting.permission = function (granted) { clearTimeout(timer); resolve(granted); };
        });
    }

    let sharedKnown = null; // son köprü durumu: true ortak kök var, false yok, null bilinmiyor

    async function grant() {
        if (sharedKnown === false) return grantLocal();
        const shared = await sharedGrant();
        if (shared !== null) return shared;
        return grantLocal();
    }

    // Ayar sayfasında "Okuma iznini yenile" ile izin verilince (idsfyRootGrantedAt) bekleyen
    // paneller sürer.
    if (!IN_EXTENSION && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
            if (area !== 'local' || !changes.idsfyRootGrantedAt) return;
            showFrame(false);
            if (waiting.permission) { waiting.permission(true); waiting.permission = null; }
            document.dispatchEvent(new CustomEvent('idsfy-folder-ready'));
        });
    }

    // Sonuç dizi; refinement'ta birden fazla klasör varsa boş dizi + choices (klasör adları).
    async function images(handle, kind, choice) {
        if (handle && handle.shared) {
            const reply = await bridgeCall('images', { name: handle.patientName, kind: kind || 'new', choice: choice || null });
            const files = reply && reply.files ? reply.files : [];
            if (reply && reply.choices) files.choices = reply.choices;
            return files;
        }
        return imagesLocal(handle, kind || 'new', choice || null);
    }

    async function dicom(handle, kind, choice) {
        if (handle && handle.shared) {
            const reply = await bridgeCall('dicom', { name: handle.patientName, kind: kind || 'new', choice: choice || null });
            return reply && reply.files ? { folder: reply.folder, files: reply.files } : { folder: handle.name, files: [] };
        }
        return dicomLocal(handle, kind || 'new', choice || null);
    }

    return {
        pickRoot: pickRoot, pickPatient: pickPatient, grant: grant, resolve: resolve, resolveByName: resolveByName,
        images: images, dicom: dicom, patientName: patientName, rootStatus: rootStatus
    };
})();
