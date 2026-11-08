// Fotoğraf kırpma ve yön yardımcıları (yerleştirme SONRASI akış, 0.32.0, 30 Ekim 2026).
// Kullanıcının gözlemi: kırpılmamış fotoğraflarla IDS'in yerleştirmesi ve yön okuması çok daha iyi çalışıyordu; kırpma IDS'ten
// önce yapılınca sınıflandırıcı ve yön okuması yüz, ekartör, çene gibi ipuçlarını kaybediyordu. Bu yüzden:
//   1) Orijinaller IDS'e olduğu gibi bırakılır (IDS yerleştirir),
//   2) yön, yuvası bilinen orijinalin küçük karesinden okunur (content.js),
//   3) yuvası ve yönü bilinen kare için kırpma kutusu/ölçümleri modelden alınır (readBoxes, yuva etiketi verilir),
//   4) kare tuvalde kırpılır, döndürülür (oklüzalde aynalanır) ve IDS'teki yuvaya "Değiştir" ile konur (content.js).
// Çerçeve kuralları (intraoralFrame, occlusalBox, relaxBox, yüz 2:3) kullanıcıyla ayarlandı; dosyalar klasörde değişmez.
(function () {
    'use strict';

    const SETTINGS = {
        maxSide: 1024,        // modele giden karenin uzun kenarı (piksel)
        margin: 0,            // ağız içi pay (%): çerçeveyi ekartör kolları belirlediği için pay yok (kullanıcı, 29 Ekim 2026)
        retractorKeep: 0.3,   // ekartör kolunun karede kalan payı (0.3 = kolun %30'u içeride)
        balance: 1.4,         // oklüzal düzlemin üstü/altı bu orandan dengesizse uzun tarafta dudak kıvrımı esas alınır
        teethPad: 0.015,      // diş sınırı emniyeti, dikey (görüntü yüksekliğinin kesri)
        teethPadX: 0.01,      // diş sınırı emniyeti, yatay (görüntü genişliğinin kesri)
        maxAspect: 2.0,       // ağız içi önden/yan kırpmada en/boy en çok bu kadar (dişleri saran yatay şerit olmasın)
        minOutW: 1000,        // çıkış kırpmasının asgari genişliği/yüksekliği (piksel); IDS 1000x392'yi kabul etti, 800x314'e ünlem verdi
        minOutH: 500,
        minOutArea: 1200000, // çıkış kırpmasının asgari alanı (piksel); IDS 1000x505'e (0.5 MP) ünlem verdi (2 Kasım 2026, 2400x1600 kaynak)
        roomH: 1.5,           // ağız içi önden/yan karede çerçeve yüksekliği en az diş yüksekliğinin bu katı
        roomW: 1.15,          // yalnız önden karede genişlik en az diş genişliğinin bu katı
        frontRoomX: 0.06,     // yan kare: ön dişlerle çerçeve kenarı arasındaki asgari boşluk (görüntü genişliğinin kesri)
        frontRoomMax: 0.12,   // yan kare: bu boşluktan fazla açılmaz (Anastasiya: karşı ekartör karenin dörtte birini kaplıyordu)
        frontFarNear: 0.15,   // yan kare: karşı ekartör diş sınırına bundan yakınsa ön diş sınırı ekartörden alınır
        buccalAspect: 1.7,    // yan kare: ön diş yanı en/boy bu orana gelene kadar açılır (IDS yuvası ~1,73; dar kalınca yanları bulanık dolduruyor)
        cropEffort: 'medium', // kırpma kutusu çağrısının effort değeri (low | medium | high)
        archEffort: 'medium', // oklüzal diş sırası kutusu okuması
        archModel: 'sonnet',  // opus | sonnet (Sonnet 2-4 sn, kutu kalitesi aynı)
        poseModel: 'sonnet',  // yön okuması: bağımsız tek fotoğraflık çağrılar; iki okuma uyuşmazsa Opus hakem
        poseEffort: 'medium',
        poseArbiterEffort: 'high',
        poseParallel: 12,     // aynı anda yürüyen yön okuması işi (8 yuvalık sette hepsi birden; 6 iken 2 iş sıra bekliyordu)
        uprightFrac: 0.5,     // 180° denetimi için ham karenin orta kesiti (kenar oranı)
        hedgeMs: 20000,       // >0: bu kadar ms içinde yanıtlanmayan model çağrısına ikinci istek açılır (0 = kapalı)
        minTilt: 0.3,         // bunun altındaki oklüzal düzlem eğimi düzeltilmez (derece)
        maxTilt: 20,          // oklüzal düzlem düzeltmesi en çok bu kadar derece
        maxOccTilt: 12,       // oklüzal simetri ekseni düzeltmesi en çok bu kadar derece (fazlası ölçüm hatası sayılır)
        archSplit: false,     // oklüzal ölçümde her kare ayrı çağrıda mı (true: daha kısa yanıt). Ayrı okumada ayşe ceren alt oklüzalinde
                              // doğrudan görünen üst dişler diş sırasına katıldı (6 Kasım 2026); iki kare birlikte okunur.
        archReads: 3,         // oklüzal diş sırası/şerit/eksen okuması kaç bağımsız çağrıyla (aynı anda) yapılır
        archAxisAgree: 5,     // iki okumanın ekseni bu dereceden fazla ayrışırsa döndürülmez
        occlusalMargin: 10,   // oklüzal: diş sınırının her kenarına eklenen pay (%)
        occlusalFrontMargin: 3, // oklüzal: ön dişler yanındaki pay (%)
        faceMargin: 10,       // yüz payı (%)
        faceRatio: 2 / 3,     // yüz en-boy (genişlik / yükseklik)
        groupSize: 6,         // sınıflandırmada model her istekte en çok bu kadar kareye bakar; gruplar aynı anda sorulur
        boxGroupSize: 1,      // kırpma kutusu ve oklüzal ölçüm çağrısı başına kare (yuvası bilinen kare tek başına okunur; çağrılar aynı anda,
                              // yanıt kısalır: 5 karelik tek çağrı ~9 sn sürüyordu, 6 Kasım 2026)
        prepareParallel: 3,   // aynı anda çözülen tam boyutlu kare sayısı
        minConfidence: 0.4,   // sınıflandırmada altı "other" sayılır
        quality: 0.92,        // kırpılmış JPEG kalitesi
        outMaxSide: 3000      // kırpılmış karenin uzun kenarı en çok (piksel; 0 = sınırsız). IDS'in "Değiştir" işlemesi dosya boyutuyla uzuyor
                              // (yüz kırpımları 4480x6720, 2,7-3 MB: 18-32 sn; ağız içi 0,7-1,3 MB: 7-16 sn; 6 Kasım 2026)
    };
    const FACE = /^(profile|frontal)_/;
    const INTRAORAL = /^(labial|buccal)_/;
    const OCCLUSAL = /^occlussal_/;

    // Hızlandırmalar (küçük çıkış, erken okuma, örtüşen hazırlık) açık mı; deneme karşılaştırması için sayfada idsfyNoSpeed=1 kapatır.
    function speedOn() { try { return localStorage.getItem('idsfyNoSpeed') !== '1'; } catch (error) { return true; } }

    function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

    // Model çağrısı: hedgeMs > 0 ise bu süre içinde yanıtlanmayan çağrıya ikinci istek açılır ve ilk başarılı yanıt alınır
    // (aynı iş bazen 9 sn, bazen 50 sn sürüyor; kuyruk gecikmesini keser, yalnız yavaş çağrılarda ek maliyet).
    function sendHedged(message) {
        if (!(SETTINGS.hedgeMs > 0)) return send(message);
        return new Promise(function (resolve, reject) {
            let done = false, failures = 0, started = 1;
            const finish = function (ok, value) {
                if (done) return;
                if (ok) { done = true; clearTimeout(timer); resolve(value); return; }
                failures++;
                if (failures >= started) { done = true; clearTimeout(timer); reject(value); }
            };
            const run = function () { send(message).then(function (r) { finish(true, r); }, function (e) { finish(false, e); }); };
            const timer = setTimeout(function () { if (!done) { started++; run(); } }, SETTINGS.hedgeMs);
            run();
        });
    }

    function send(message) {
        return new Promise(function (resolve, reject) {
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

    // EXIF yönü uygulanmış kare (Chrome'da 'none' artık EXIF'i uygulamıyor değil; ham kare ters EXIF dönüşüyle elde edilir).
    function bitmapOf(file) {
        return createImageBitmap(file, { imageOrientation: 'from-image' });
    }

    // Ham kare isteyen yön (orient.raw): kural dönüşü EXIF uygulanmış kaynağa uygulanırken EXIF dönüşü geri alınır.
    function effectiveOrient(orient) {
        if (!orient) return orient;
        if (!orient.raw) return orient;
        return { rotate: turn360((orient.rotate || 0) - (orient.exifRotate || 0)), mirror: !!orient.mirror };
    }

    // Dosyanın EXIF yön etiketi (ham kareyi görüntülenen hale getiren saat yönünde dönüş: 0/90/180/270).
    async function exifRotationOf(file) {
        try {
            const head = await file.slice(0, 131072).arrayBuffer();
            return window.idsfyExif ? window.idsfyExif.exifRotation(new Uint8Array(head)) : 0;
        } catch (error) { return 0; }
    }

    // Aynı görünümün tekrar çekimlerini karşılaştırmak için: 256 piksellik gri kareden ortalama parlaklık (0-255)
    // ve netlik (Laplace varyansı). Kıyas yalnızca aynı görünümün kareleri arasında anlamlıdır.
    function qualityOf(source) {
        const w = 256;
        const h = Math.max(8, Math.round(w * source.height / source.width));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(source, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        let sum = 0;
        for (let i = 0; i < gray.length; i++) {
            gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
            sum += gray[i];
        }
        let lap = 0, lap2 = 0, n = 0;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
                lap += v;
                lap2 += v * v;
                n++;
            }
        }
        const mean = lap / n;
        return { bright: sum / gray.length, sharp: lap2 / n - mean * mean };
    }

    // Aday sıralaması: pozlaması dengeli (ne karanlık ne patlamış) ve net olan önde.
    function qualityScore(it) {
        const exposure = Math.max(0.05, 1 - Math.abs((Number(it.bright) || 0) - 125) / 125);
        return (Number(it.sharp) || 0) * exposure;
    }

    // Küçük kare (modele gider) + imza (IDS önizlemesiyle eşleştirme için) + kalite ölçüleri. EXIF yönü uygulanmış.
    // Tam kare bir kez HAM çözülür; EXIF uygulanmış küçük kare ham küçük kareden döndürülerek üretilir (ikinci çözüm yok).
    // Dönüş: w/h ve data/sig EXIF uygulanmış (yüz, sınıflandırma, eşleştirme); rw/rh ve raw ham (ağız içi); exifRotate: etiket.
    async function thumbnail(file) {
        const exifRotate = await exifRotationOf(file);
        const bitmap = await bitmapOf(file);
        try {
            const scale = Math.min(1, SETTINGS.maxSide / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const q = qualityOf(canvas);
            // canvas: EXIF uygulanmış (görüntülenen) kare; ham kare ters dönüşle.
            const raw = exifRotate ? orientCanvas(canvas, canvas.width, canvas.height, { rotate: turn360(-exifRotate), mirror: false }) : canvas;
            const swap = exifRotate % 180 !== 0;
            return { w: bitmap.width, h: bitmap.height, rw: swap ? bitmap.height : bitmap.width, rh: swap ? bitmap.width : bitmap.height,
                data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], raw: raw.toDataURL('image/jpeg', 0.85).split(',')[1],
                sig: signatureOf(canvas, canvas.width, canvas.height), bright: q.bright, sharp: q.sharp, exifRotate: exifRotate };
        } finally {
            bitmap.close();
        }
    }

    // En çok `limit` iş aynı anda çalışır (tam boyutlu kareler bellekte büyüktür).
    function limiter(limit) {
        let active = 0;
        const queue = [];
        const next = function () {
            if (active >= limit || !queue.length) return;
            active++;
            const job = queue.shift();
            job.fn().then(job.resolve, job.reject).then(function () { active--; next(); });
        };
        return function (fn) {
            return new Promise(function (resolve, reject) { queue.push({ fn: fn, resolve: resolve, reject: reject }); next(); });
        };
    }

    // Klasördeki orijinalleri modele ve eşleştirmeye hazırlar: {name, file, w, h, thumb, sig, bright, sharp, score}. Dosyalar değişmez.
    async function prepare(files, progress) {
        const say = progress || function () {};
        const limit = limiter(SETTINGS.prepareParallel);
        let done = 0;
        return Promise.all(files.map(function (file) {
            return limit(async function () {
                const info = await thumbnail(file);
                done++;
                say('Fotoğraflar hazırlanıyor… (' + done + '/' + files.length + ')');
                return { name: file.name, file: file, w: info.w, h: info.h, rw: info.rw, rh: info.rh, thumb: info.data, raw: info.raw,
                    exifRotate: info.exifRotate, seq: window.idsfyExif ? window.idsfyExif.seqOf(file.name) : null, sig: info.sig,
                    bright: info.bright, sharp: info.sharp, score: qualityScore(info) };
            });
        }));
    }

    // Kutu çok yatay ise (en/boy > maxAspect) boyu merkez etrafında genişletilir, çok küçükse (piksel) merkez etrafında büyütülür;
    // görüntü sınırında kaydırılır. Kutu kesirlerle, w/h ham kare pikselleridir.
    function relaxBox(box, w, h, maxAspect, minW, minH, minArea) {
        let x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
        const grow = function (lo, hi, want) {
            let a = lo, b = hi;
            if (b - a >= want) return [a, b];
            const c = (a + b) / 2;
            a = c - want / 2; b = c + want / 2;
            if (a < 0) { b -= a; a = 0; }
            if (b > 1) { a -= b - 1; b = 1; }
            return [Math.max(0, a), Math.min(1, b)];
        };
        if (maxAspect > 0 && (x1 - x0) * w / ((y1 - y0) * h) > maxAspect) {
            const r = grow(y0, y1, (x1 - x0) * w / maxAspect / h);
            y0 = r[0]; y1 = r[1];
        }
        if (minW > 0 && (x1 - x0) * w < minW) { const r = grow(x0, x1, minW / w); x0 = r[0]; x1 = r[1]; }
        if (minH > 0 && (y1 - y0) * h < minH) { const r = grow(y0, y1, minH / h); y0 = r[0]; y1 = r[1]; }
        // Alan küçükse oran korunarak büyütülür (görüntü sınırında durur).
        if (minArea > 0) {
            const area = (x1 - x0) * w * (y1 - y0) * h;
            if (area > 0 && area < minArea) {
                const k = Math.sqrt(minArea / area);
                const rx = grow(x0, x1, Math.min(1, (x1 - x0) * k));
                const ry = grow(y0, y1, Math.min(1, (y1 - y0) * k));
                x0 = rx[0]; x1 = rx[1]; y0 = ry[0]; y1 = ry[1];
            }
        }
        return [x0, y0, x1, y1];
    }

    // Pay ve en-boy uygulanmış son kutu (kesirler). Görüntü dışına taşarsa kaydırılır, sığmazsa kırpılır.
    function finalBox(box, marginPct, ratio, w, h) {
        let x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
        [x0, y0, x1, y1] = [x0, y0, x1, y1].map(function (v) { return Math.min(1, Math.max(0, Number(v) || 0)); });
        if (x1 <= x0 || y1 <= y0) return null;
        const m = marginPct / 100;
        const bw = x1 - x0, bh = y1 - y0;
        x0 -= bw * m; x1 += bw * m; y0 -= bh * m; y1 += bh * m;
        if (ratio) {
            const pw = (x1 - x0) * w, ph = (y1 - y0) * h;
            if (pw / ph < ratio) {
                const nw = ph * ratio, cx = (x0 + x1) / 2 * w;
                x0 = (cx - nw / 2) / w; x1 = (cx + nw / 2) / w;
            } else {
                const nh = pw / ratio, cy = (y0 + y1) / 2 * h;
                y0 = (cy - nh / 2) / h; y1 = (cy + nh / 2) / h;
            }
        }
        if (x0 < 0) { x1 -= x0; x0 = 0; }
        if (y0 < 0) { y1 -= y0; y0 = 0; }
        if (x1 > 1) { x0 -= x1 - 1; x1 = 1; }
        if (y1 > 1) { y0 -= y1 - 1; y1 = 1; }
        return [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)];
    }

    // Ön ve yan ağız içi kare: çerçeve modelin kutusundan değil ölçümlerinden hesaplanır (kullanıcı ince
    // ayarı, 29 Ekim 2026: model "kolun yarısı içeride" kutusunu tutturamıyordu; ölçüm + hesap daha güvenilir).
    //   plane_x0..plane_y1 : oklüzal düzlemin iki ucu → eğim (sağa doğru aşağı = pozitif); görüntü kutu
    //                        merkezi (pivot) etrafında -eğim kadar döndürülür, düzlem yere paralel olur.
    //   arms[]             : ekartör kolu {x, top, bottom}; üst/alt kol düzleme göre ayrılır (kare ters
    //                        olsa da çalışır); kesme noktası kolun dişe bakan kenarından retractorKeep
    //                        oranında dışarıda; döndürülmüş karede y alınır, üst/alt kenar ortalamadır.
    //   lip_upper_y/lower  : dudak-dişeti kıvrımı; düzlemin üstü/altı çok dengesizse (balance) uzun tarafta
    //                        ekartör yerine bu kıvrım kenar olur (kullanıcı, 29 Ekim 2026).
    //   c_left/right_x     : C ekartörün iç bükey ucu → o yanın kenarı (C'nin sırtı ve yanak dışarıda).
    //   far_left/right_x   : karşı ekartörün dişe bakan kenarı → o yan dişe yaklaşır, karşı ekartör dışarıda.
    //   teeth_*            : diş tacı sınırı → emniyet, hiçbir diş kesilmez.
    // Döndürme köşeleri görüntü dışına taşırırsa o yan içeri çekilir (siyah köşe kalmasın).
    // Düzlem 45°'den eğikse (kare yan duruyor) ölçümlere güvenilmez, modelin kutusu olduğu gibi kalır.
    // w, h: görüntü boyutu (piksel). Dönüş: box döndürülmüş karede kesirler; tilt derece; pivot kesir.
    function intraoralFrame(item, w, h) {
        const box = [num(item.x0), num(item.y0), num(item.x1), num(item.y1)];
        const pivot = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        let p0 = [num(item.plane_x0), num(item.plane_y0)], p1 = [num(item.plane_x1), num(item.plane_y1)];
        if (p0[0] > p1[0]) { const t = p0; p0 = p1; p1 = t; }
        const dx = (p1[0] - p0[0]) * w, dy = (p1[1] - p0[1]) * h;
        const hasPlane = Math.hypot(dx, dy) > 0.05 * Math.min(w, h);
        const angle = hasPlane ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
        const sideways = Math.abs(angle) > 45;
        let tilt = sideways ? 0 : angle;
        if (Math.abs(tilt) < SETTINGS.minTilt || Math.abs(tilt) > SETTINGS.maxTilt) tilt = 0;
        const rad = -tilt * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const px = pivot[0] * w, py = pivot[1] * h;
        // Noktanın döndürülmüş karedeki x'i / y'si (kesir) ve döndürülmüş karedeki noktanın orijinalde içeride olup olmadığı.
        const rotX = function (x, y) { const X = x * w - px, Y = y * h - py; return (X * cos - Y * sin + px) / w; };
        const rotY = function (x, y) { const X = x * w - px, Y = y * h - py; return (X * sin + Y * cos + py) / h; };
        const inside = function (x, y) {
            const X = x * w - px, Y = y * h - py;
            const ox = (px + X * cos + Y * sin) / w, oy = (py - X * sin + Y * cos) / h;
            return ox >= 0 && ox <= 1 && oy >= 0 && oy <= 1;
        };
        const planeY = function (x) {
            return hasPlane ? p0[1] + (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) : pivot[1];
        };
        let x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
        const arms = [];
        const used = { lip: '', sides: [] };
        let teeth = null, lips = null, sides = null;
        if (!sideways) {
            // Üst/alt kenar: ekartör kollarının kesme noktaları (döndürülmüş karede, ortalama).
            (Array.isArray(item.arms) ? item.arms : []).forEach(function (arm) {
                const x = num(arm.x), top = num(arm.top), bottom = num(arm.bottom), keep = SETTINGS.retractorKeep;
                if (!(bottom > top) || bottom - top > 0.25) return;
                const upper = (top + bottom) / 2 < planeY(x);
                const cut = upper ? bottom - keep * (bottom - top) : top + keep * (bottom - top);
                arms.push({ x: x, top: top, bottom: bottom, cut: cut, upper: upper, y: rotY(x, cut) });
            });
            const mean = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
            const ups = arms.filter(function (a) { return a.upper; }).map(function (a) { return a.y; });
            const lows = arms.filter(function (a) { return !a.upper; }).map(function (a) { return a.y; });
            if (ups.length) y0 = mean(ups);
            if (lows.length) y1 = mean(lows);
            // Denge: düzlemin üstü ile altı çok dengesizse uzun tarafta ekartör yerine dudak-dişeti kıvrımı.
            const lu = num(item.lip_upper_y), ll = num(item.lip_lower_y);
            lips = [lu, ll];
            if (hasPlane) {
                const cx = (p0[0] + p1[0]) / 2;
                const pc = rotY(cx, planeY(cx));
                const up = pc - y0, down = y1 - pc;
                if (up > 0 && down > 0) {
                    if (up > down * SETTINGS.balance && lu > 0) {
                        const yl = rotY(cx, lu);
                        if (yl > y0 && yl < pc) { y0 = yl; used.lip = 'üst'; }
                    } else if (down > up * SETTINGS.balance && ll > 0) {
                        const yl = rotY(cx, ll);
                        if (yl < y1 && yl > pc) { y1 = yl; used.lip = 'alt'; }
                    }
                }
            }
            // Yanlar: C'nin iç bükey ucu (C'nin sırtı dışarıda), karşı ekartörün dişe bakan kenarı (karşı ekartör dışarıda).
            sides = { cl: num(item.c_left_x), fl: num(item.far_left_x), cr: num(item.c_right_x), fr: num(item.far_right_x) };
            [[sides.cl, 'sol C'], [sides.fl, 'sol karşı ekartör']].forEach(function (c) {
                if (c[0] > 0 && c[0] < 1) { const r = rotX(c[0], pivot[1]); if (r > x0) { x0 = r; used.sides.push(c[1]); } }
            });
            [[sides.cr, 'sağ C'], [sides.fr, 'sağ karşı ekartör']].forEach(function (c) {
                if (c[0] > 0 && c[0] < 1) { const r = rotX(c[0], pivot[1]); if (r < x1) { x1 = r; used.sides.push(c[1]); } }
            });
            // Diş emniyeti: hiçbir diş kesilmez.
            const tt = num(item.teeth_top), tb = num(item.teeth_bottom), tl = num(item.teeth_left), tr = num(item.teeth_right);
            if (tb > tt) {
                teeth = [tt, tb];
                y0 = Math.min(y0, rotY(pivot[0], tt) - SETTINGS.teethPad);
                y1 = Math.max(y1, rotY(pivot[0], tb) + SETTINGS.teethPad);
            }
            if (tr > tl) {
                x0 = Math.min(x0, rotX(tl, pivot[1]) - SETTINGS.teethPadX);
                x1 = Math.max(x1, rotX(tr, pivot[1]) + SETTINGS.teethPadX);
            }
            // Önden ağız içi: orta hat (üst orta kesiciler arası; ölçülemezse diş sınırının ortası) ortada, dişlerle çerçeve
            // arasında sağ ve solda eşit mesafe. Çerçeve orta hat etrafında simetrik yapılır (geniş olan yan esas alınır, diş
            // kesilmez); orta hat görüntü kenarına yakınsa ya da diş sığmıyorsa simetri uygulanmaz.
            let symmetric = false;
            if (/^labial_/.test(item.slot || '')) {
                const midRaw = num(item.midline_x);
                const c = midRaw > 0 && midRaw < 1 ? rotX(midRaw, pivot[1]) : (tr > tl ? rotX((tl + tr) / 2, pivot[1]) : (x0 + x1) / 2);
                let hw = Math.max(c - x0, x1 - c);
                const fits = Math.min(c, 1 - c);
                const need = tr > tl ? Math.max(c - rotX(tl, pivot[1]), rotX(tr, pivot[1]) - c) + SETTINGS.teethPadX : 0;
                if (c > 0 && c < 1 && fits >= need && fits > 0.1) {
                    hw = Math.min(hw, fits);
                    x0 = c - hw;
                    x1 = c + hw;
                    symmetric = true;
                }
            }
            // Yan kare, ön diş yanı (kullanıcı, 3 Kasım 2026, "çok dar"): karşı ekartör kuralı kenarı dişlere dayıyordu. Bu yan dişlerden
            // frontRoomX kadar uzakta ve en/boy buccalAspect olana kadar açılır (en çok frontRoomMax); karşı ekartör gerekirse kısmen kadraja
            // girer. Yan: dik karede yuvadan (sağ bukkalde kesiciler sağda; model karşı ekartörü bazen yanlış yana okuyor, Asiye 1109); dik
            // değilse karşı ekartörün göründüğü taraf. Azı dişi yanı değişmez.
            if (/^buccal_/.test(item.slot || '')) {
                const fromSlot = item.upright && !num(item.view_rotation) ? (item.slot === 'buccal_right' ? 'right' : 'left') : '';
                const front = fromSlot || (sides.fr > 0 && !(sides.fl > 0) ? 'right' : sides.fl > 0 && !(sides.fr > 0) ? 'left' : '');
                const wantW = (y1 - y0) * h * SETTINGS.buccalAspect / w;
                if (front === 'right') {
                    let want = x0 + wantW;
                    if (tr > tl) {
                        // Model diş sınırını çalıştırmadan çalıştırmaya 0,1 oynatabiliyor (alis: 0,24 / 0,36), karşı ekartör ölçümü daha kararlı:
                        // ekartör dişe yakınsa kesiciler onu geçemez, sınır ondan alınır.
                        const edge = sides.fr > tr && sides.fr - tr < SETTINGS.frontFarNear ? rotX(sides.fr, pivot[1]) : rotX(tr, pivot[1]);
                        want = Math.max(edge + SETTINGS.frontRoomX, Math.min(want, edge + SETTINGS.frontRoomMax));
                    }
                    x1 = Math.min(1, Math.max(x1, want));
                } else if (front === 'left') {
                    let want = x1 - wantW;
                    if (tr > tl) {
                        const edge = sides.fl > 0 && sides.fl < tl && tl - sides.fl < SETTINGS.frontFarNear ? rotX(sides.fl, pivot[1]) : rotX(tl, pivot[1]);
                        want = Math.min(edge - SETTINGS.frontRoomX, Math.max(want, edge - SETTINGS.frontRoomMax));
                    }
                    x0 = Math.max(0, Math.min(x0, want));
                }
            }
            // Döndürme köşeleri görüntü dışına taşırırsa yanlar içeri çekilir (siyah köşe kalmasın; en çok %25); simetrik
            // çerçevede iki yan birlikte çekilir.
            if (tilt) {
                const limit0 = x0 + (x1 - x0) * 0.25, limit1 = x1 - (x1 - x0) * 0.25;
                if (symmetric) {
                    while (x0 < limit0 && !(inside(x0, y0) && inside(x0, y1) && inside(x1, y0) && inside(x1, y1))) { x0 += 0.003; x1 -= 0.003; }
                } else {
                    while (x0 < limit0 && !(inside(x0, y0) && inside(x0, y1))) x0 += 0.003;
                    while (x1 > limit1 && !(inside(x1, y0) && inside(x1, y1))) x1 -= 0.003;
                }
            }
        }
        if (!(y1 - y0 > 0.1) || !(x1 - x0 > 0.2)) { x0 = box[0]; y0 = box[1]; x1 = box[2]; y1 = box[3]; }
        // Emniyet: ölçümler (kol, C ucu, dudak kıvrımı) yanlış yere düştüyse çerçeve dişleri neredeyse tam sarar. Diş sınırı geçerliyse
        // çerçeve diş boyunun/enininin en az roomH/roomW katı olmalı: önce modelin kutusu denenir, o da dar ise diş kutusu merkez alınarak
        // genişletilir (görüntü sınırında kaydırılır).
        if (!sideways) {
            const ttop = num(item.teeth_top), tbot = num(item.teeth_bottom), tlef = num(item.teeth_left), trig = num(item.teeth_right);
            if (tbot > ttop && trig > tlef) {
                const minH = (tbot - ttop) * SETTINGS.roomH, minW = /^labial_/.test(item.slot || '') ? (trig - tlef) * SETTINGS.roomW : 0;
                if (y1 - y0 < minH || x1 - x0 < minW) {
                    const big = box[3] - box[1] >= minH && box[2] - box[0] >= minW;
                    // Yan karede emniyet yalnız yüksekliği diş boyuna göre büyütür: yan kenarlar (C ucu, ön diş boşluğu) korunur, model kutusuna
                    // atlanmaz (Alina Akyol 1306: x1 0,94 → 0,90; alis 0,38-0,73 → 0,14-0,78, kare dar ve uzun kalıyordu).
                    if (/^buccal_/.test(item.slot || '')) {
                        const cy = (ttop + tbot) / 2;
                        y0 = Math.min(y0, cy - minH / 2); y1 = Math.max(y1, cy + minH / 2);
                        used.room = 'diş boyuna göre';
                    } else if (big) {
                        x0 = Math.min(box[0], tlef - 0.01); y0 = Math.min(box[1], ttop - 0.015);
                        x1 = Math.max(box[2], trig + 0.01); y1 = Math.max(box[3], tbot + 0.015);
                        used.room = 'model kutusu';
                    } else {
                        const cx = (tlef + trig) / 2, cy = (ttop + tbot) / 2;
                        const hw = Math.max(minW, (trig - tlef) + 0.02) / 2, hh = Math.max(minH, (tbot - ttop) + 0.03) / 2;
                        x0 = cx - hw; x1 = cx + hw; y0 = cy - hh; y1 = cy + hh;
                        if (x0 < 0) { x1 -= x0; x0 = 0; }
                        if (x1 > 1) { x0 -= x1 - 1; x1 = 1; }
                        if (y0 < 0) { y1 -= y0; y0 = 0; }
                        if (y1 > 1) { y0 -= y1 - 1; y1 = 1; }
                        used.room = 'diş kutusu genişletildi';
                    }
                    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
                }
            }
        }
        return {
            box: [x0, y0, x1, y1], tilt: tilt, angle: angle, pivot: pivot,
            plane: hasPlane ? [p0[0], p0[1], p1[0], p1[1]] : null, teeth: teeth, lips: lips, sides: sides, arms: arms, used: used,
            upper: arms.filter(function (a) { return a.upper; }).length,
            lower: arms.filter(function (a) { return !a.upper; }).length
        };
    }

    // Oklüzal: modelin kutusu gevşek kalıyordu (yüz, çene, ekartör kadrajda); çerçeve ölçülen diş sınırından kurulur.
    // Ölçüm yoksa ya da anlamsızsa null (modelin kutusu kullanılır).
    function occlusalBox(item) {
        const l = num(item.teeth_left), r = num(item.teeth_right), t = num(item.teeth_top), b = num(item.teeth_bottom);
        if (!(r - l > 0.1 && b - t > 0.1) || l < 0 || t < 0 || r > 1 || b > 1) return null;
        return [l, t, r, b];
    }

    // Oklüzal: aynanın dışında doğrudan görünen dişler (çoğu kez karşı çenenin ön dişleri, azı ucunun ötesinde bir şerit) pay ve asgari
    // boyut büyütmesiyle kadraja giriyordu (kullanıcı, 6 Kasım 2026). Kutu o yanda şeridin kenarında biter. Kaybedilen boy karşı yana
    // aktarılmaz: aktarılınca ön dişlerle kenar arası çok açılıyordu (kullanıcı, 6 Kasım 2026). Kenar diş sırasının içine düşüyorsa
    // ölçüm güvenilmez, dokunulmaz. Dönüş: yeni kutu ya da null.
    function excludeDirect(box, item, teeth) {
        const side = item.direct_side, e = num(item.direct_edge), gap = 0.03;
        if (!(e > 0 && e < 1)) return null;
        let [x0, y0, x1, y1] = box;
        if (side === 'bottom' && e > teeth[3]) {
            const lim = Math.max(e - gap, teeth[3] + 0.005);
            if (y1 <= lim) return null;
            y1 = lim;
        } else if (side === 'top' && e < teeth[1]) {
            const lim = Math.min(e + gap, teeth[1] - 0.005);
            if (y0 >= lim) return null;
            y0 = lim;
        } else if (side === 'right' && e > teeth[2]) {
            const lim = Math.max(e - gap, teeth[2] + 0.005);
            if (x1 <= lim) return null;
            x1 = lim;
        } else if (side === 'left' && e < teeth[0]) {
            const lim = Math.min(e + gap, teeth[0] - 0.005);
            if (x0 >= lim) return null;
            x0 = lim;
        } else return null;
        return [x0, y0, x1, y1];
    }

    // Model doğrudan görünen dişleri bildirse de çoğu kez diş sırası kutusuna da katıyor (Asiye 1112: şerit 0,85'te, kutunun alt
    // sınırı 0,91). Şerit kenarı kutunun o yandaki dış beşte birine düşüyorsa kutu o kenarda biter; daha içerideyse ölçüm
    // güvenilmez sayılır (azı dişleri kesilmesin). Dönüş: düzeltilmiş diş kutusu ya da null.
    function trimDirect(item, teeth) {
        const side = item.direct_side, e = num(item.direct_edge), gap = 0.01, part = 0.2;
        if (!(e > 0 && e < 1)) return null;
        const [l, t, r, b] = teeth, h = b - t, w = r - l;
        if (side === 'bottom' && e <= b && e > b - part * h) return [l, t, r, Math.max(t + 0.5 * h, e - gap)];
        if (side === 'top' && e >= t && e < t + part * h) return [l, Math.min(b - 0.5 * h, e + gap), r, b];
        if (side === 'right' && e <= r && e > r - part * w) return [l, t, Math.max(l + 0.5 * w, e - gap), b];
        if (side === 'left' && e >= l && e < l + part * w) return [Math.min(r - 0.5 * w, e + gap), t, r, b];
        return null;
    }

    // Yan duran (dik tutulmuş) kare: model ölçümleri ve kutuyu düzlemi yatay yapan döndürülmüş karede verir (view_rotation 90/270);
    // çerçeve orada hesaplanır, sonuç ham kareye geri çevrilir. Çıkan kutu ham kare eksenlerindedir; eğim (tilt) aynı yönde ve
    // pivot ham karede olduğundan cropOne değişmez. Ham kareye ait olmayan ayrıntılar (düzlem, kollar vb.) boşaltılır.
    function intraoralFrameAny(item, w, h) {
        const rot = Number(item.view_rotation) || 0;
        if (rot !== 90 && rot !== 270) return intraoralFrame(item, w, h);
        const f = intraoralFrame(item, h, w);
        const back = function (x, y) { return rot === 90 ? [y, 1 - x] : [1 - y, x]; };
        const a = back(f.box[0], f.box[1]);
        const b = back(f.box[2], f.box[3]);
        f.box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        f.pivot = back(f.pivot[0], f.pivot[1]);
        f.plane = null; f.teeth = null; f.lips = null; f.sides = null; f.arms = [];
        f.rotated = rot;
        return f;
    }

    function toBlob(canvas) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', SETTINGS.quality); });
    }

    // 16×16 gri imza: IDS yuvasındaki önizlemenin hangi kırpılmış dosya olduğunu bulmak için.
    const SIG = 16;
    function signatureOf(source, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = SIG;
        canvas.height = SIG;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, w, h, 0, 0, SIG, SIG);
        const px = ctx.getImageData(0, 0, SIG, SIG).data;
        const out = new Array(SIG * SIG);
        for (let i = 0; i < out.length; i++) out[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
        return out;
    }

    function distance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
        return sum / a.length;
    }

    // İmzanın saat yönünde 90° döndürülmüş hali (16×16 ızgara döndürülür; görüntüyü döndürüp imza almakla aynı sonuç).
    function rotateSig(sig) {
        const out = new Array(SIG * SIG);
        for (let y = 0; y < SIG; y++) for (let x = 0; x < SIG; x++) out[x * SIG + (SIG - 1 - y)] = sig[y * SIG + x];
        return out;
    }

    // İmzanın dört yönü (IDS önizlemesi EXIF'i uygulamış ya da uygulamamış, ya da kare bizce döndürülmüş olabilir).
    function sigVariants(sig) {
        const list = [sig];
        for (let i = 0; i < 3; i++) list.push(rotateSig(list[i]));
        return list;
    }

    function bestDistance(sig, itemSig) {
        let best = Infinity;
        sigVariants(itemSig).forEach(function (v) { const d = distance(sig, v); if (d < best) best = d; });
        return best;
    }

    // Önizleme (IDS'in küçülttüğü yüklenmiş kare) hangi dosyaya ait? En iyi eşleşmeye yakın (+8) olanların hepsi döner: benzer çekimler
    // (ikizler) imzayla ayırt edilemez; hangisi olduğu önemsizdir, en netleri seçilir. Hiçbiri yeterince yakın değilse boş dizi.
    // Sıralı eşleşme: [{ item, d }] (uzaklık artan). En yakın bile 20'den uzaksa boş.
    async function matchRanked(blob, items) {
        if (!items || !items.length) return [];
        // Büyük kare (yükleme sırasındaki yerel önizleme tam boydur) küçültülerek çözülür: imza zaten küçük tuvalde alınır, bellek az.
        const bitmap = blob.size > 400000 ? await createImageBitmap(blob, { resizeWidth: 512, resizeQuality: 'medium' }) : await createImageBitmap(blob);
        try {
            const sig = signatureOf(bitmap, bitmap.width, bitmap.height);
            const ranked = items.filter(function (it) { return it.sig; })
                .map(function (it) { return { item: it, d: bestDistance(sig, it.sig) }; })
                .sort(function (a, b) { return a.d - b.d; });
            if (!ranked.length || ranked[0].d > 20) return [];
            return ranked;
        } finally {
            bitmap.close();
        }
    }

    // İkizler: en yakın eşleşmenin +3 komşuluğundaki ve 10'dan yakın kareler (aynı anın tekrar çekimi). Daha gevşek eşik aynı kişinin
    // sakin/gülümseyen yüzlerini ya da profil/üç çeyrek karelerini ikiz sayıyordu.
    async function matchGroup(blob, items) {
        const ranked = await matchRanked(blob, items);
        if (!ranked.length) return [];
        const twins = ranked.filter(function (r) { return r.d < ranked[0].d + 3 && r.d <= 10; }).map(function (r) { return r.item; });
        return twins.length ? twins : [ranked[0].item];
    }

    // Belirsizse (benzer çekimler) null.
    async function matchOriginal(blob, items) {
        const group = await matchGroup(blob, items);
        return group.length === 1 ? group[0] : null;
    }

    // Ham karede üst çenenin ve ön dişlerin yönünden ağız içi yan karenin yanı: üst çene yukarı gelecek şekilde
    // döndürülünce ön dişler sağdaysa sağ bukkal, soldaysa sol bukkal (kliniğin kuralı; fotoğraflar aynasız çekilir).
    // Belirsizse null.
    const SIDE_DEG = { top: 0, right: 90, bottom: 180, left: 270 };
    function buccalSide(upper, incisors) {
        const u = SIDE_DEG[upper];
        const n = SIDE_DEG[incisors];
        if (u === undefined || n === undefined) return null;
        const after = (((n - u) % 360) + 360) % 360;
        return after === 90 ? 'buccal_right' : after === 270 ? 'buccal_left' : null;
    }

    // ---------- Yön okuması (yuvası bilinen kare) ----------
    const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    function axisOf(side) { return side === 'top' || side === 'bottom' ? 'v' : side === 'left' || side === 'right' ? 'h' : null; }
    function turn360(d) { return ((d % 360) + 360) % 360; }

    // Okuma kendi içinde tutarlı mı? Görünüme göre gerekli alanlar dolu; ön diş ve azı dişi karşı uçlarda; yan karede üst çene dişlerin
    // sırasına dik eksendedir (diş sırası yatayken üst çene üstte/altta).
    function poseValid(r) {
        if (!r) return false;
        const known = function (s) { return SIDE_DEG[s] !== undefined; };
        if (r.view === 'frontal') return known(r.upper_jaw_side);
        if (r.view === 'buccal') {
            if (!known(r.upper_jaw_side) || !known(r.incisors_side)) return false;
            if (axisOf(r.upper_jaw_side) === axisOf(r.incisors_side)) return false;
            return !known(r.molars_side) || r.molars_side === OPPOSITE[r.incisors_side];
        }
        if (r.view === 'occlusal') {
            if (!known(r.incisors_side) || (r.arch !== 'upper' && r.arch !== 'lower')) return false;
            // Damak/dil ipucu çeneyle çelişemez (damak = üst, dil = alt).
            if ((r.behind_teeth === 'palate' && r.arch !== 'upper') || (r.behind_teeth === 'tongue' && r.arch !== 'lower')) return false;
            return !known(r.molars_side) || r.molars_side === OPPOSITE[r.incisors_side];
        }
        return false;
    }

    // İki okuma gerekli alanlarda aynı mı?
    function poseAgree(a, b) {
        if (!a || !b || a.view !== b.view) return false;
        if (a.view === 'frontal') return a.upper_jaw_side === b.upper_jaw_side;
        if (a.view === 'buccal') return a.upper_jaw_side === b.upper_jaw_side && a.incisors_side === b.incisors_side;
        if (a.view === 'occlusal') return a.incisors_side === b.incisors_side && a.arch === b.arch;
        return false;
    }

    // Okumalar (geçerli olanlar) arasından en az ikisi uyuşuyorsa onu döndürür, yoksa null.
    function poseVote(reads) {
        const valid = reads.filter(poseValid);
        for (let a = 0; a < valid.length; a++) {
            for (let b = a + 1; b < valid.length; b++) if (poseAgree(valid[a], valid[b])) return valid[a];
        }
        return null;
    }

    // Yuvası bilinen karenin yönü: Sonnet ile iki bağımsız tek görüntülük okuma; tutarsız ya da uyuşmayan okumada Opus hakem; en az iki
    // uyuşan okuma yoksa null. kind: 'frontal' | 'buccal' | 'occlusal' (beklenen görünüm; farklıysa sonuç yine döner, view alanı söyler).
    const poseLimit = limiter(SETTINGS.poseParallel);
    // useRaw: ham (EXIF uygulanmamış) küçük kare gösterilir (ön/bukkal 180° denetimi).
    function readPose(item, kind, useRaw) {
        const data = useRaw && item.raw ? item.raw : item.thumb;
        return poseLimit(async function () {
            const read = function (model, effort) {
                return sendHedged({ type: 'ids-pose', model: model, effort: effort, images: [{ index: 1, data: data }] })
                    .then(function (reply) { return (reply.items || [])[0] || null; })
                    .catch(function () { return null; });
            };
            // İki bağımsız okuma aynı anda (sırayla yapılınca yön adımı iki kat sürüyordu).
            const both = speedOn()
                ? await Promise.all([read(SETTINGS.poseModel, SETTINGS.poseEffort), read(SETTINGS.poseModel, SETTINGS.poseEffort)])
                : null;
            const r1 = both ? both[0] : await read(SETTINGS.poseModel, SETTINGS.poseEffort);
            if (r1 && r1.view === 'other') return r1;
            const r2 = both ? (poseValid(r1) ? both[1] : null) : (poseValid(r1) ? await read(SETTINGS.poseModel, SETTINGS.poseEffort) : null);
            if (poseValid(r1) && poseValid(r2) && poseAgree(r1, r2)) return r1;
            const r3 = await read('opus', SETTINGS.poseArbiterEffort);
            return poseVote([r1, r2, r3]);
        });
    }

    // Ham ön/bukkal kare dik mi? A/B karşılaştırması: ham kare ve 180° döndürülmüşü birlikte gösterilir. İki Sonnet okuması (ikincisinde
    // A/B yer değiştirir: konum yanlılığı sönsün), uyuşmazsa Opus hakem; en az iki uyuşan okuma yoksa null. Dönüş: 'top' (ham dik,
    // üst çene üstte) | 'bottom' (ham baş aşağı) | null.
    // Ham karenin orta kesiti (frac × frac), tam çözünürlükten; ≤ maxSide px. Dişler küçük resimde ~100 px kalıyor, 180° kararı için
    // örtüşme/genişlik ipuçları büyük görünmeli. rotate: kesit sonrası döndürme (0/180).
    async function centerThumb(item, frac, rotate, both) {
        const bitmap = await bitmapOf(item.file);
        try {
            const ex = item.exifRotate || 0;
            const rawCanvas = ex ? orientCanvas(bitmap, bitmap.width, bitmap.height, { rotate: turn360(-ex), mirror: false }) : bitmap;
            const rw = ex % 180 ? bitmap.height : bitmap.width, rh = ex % 180 ? bitmap.width : bitmap.height;
            const cw = Math.round(rw * frac), ch = Math.round(rh * frac);
            const scale = Math.min(1, SETTINGS.maxSide / Math.max(cw, ch));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(cw * scale)); c.height = Math.max(1, Math.round(ch * scale));
            c.getContext('2d').drawImage(rawCanvas, Math.round((rw - cw) / 2), Math.round((rh - ch) / 2), cw, ch, 0, 0, c.width, c.height);
            if (both) {
                const turned = orientCanvas(c, c.width, c.height, { rotate: 180, mirror: false });
                return [c.toDataURL('image/jpeg', 0.85).split(',')[1], turned.toDataURL('image/jpeg', 0.85).split(',')[1]];
            }
            const fin = rotate ? orientCanvas(c, c.width, c.height, { rotate: rotate, mirror: false }) : c;
            return fin.toDataURL('image/jpeg', 0.85).split(',')[1];
        } finally {
            bitmap.close();
        }
    }

    // mode: 'center' (orta kesit) | 'thumb' (tam ham küçük kare). arbiter: yalnız Opus (yüksek) ile iki okuma (A/B sırası ters), uyuşursa sonuç.
    function readRawUpright(item, mode, arbiter) {
        return poseLimit(async function () {
            const center = mode !== 'thumb';
            let raw, flipped;
            if (center && speedOn()) {
                const pair = await centerThumb(item, SETTINGS.uprightFrac, 0, true);
                raw = pair[0]; flipped = pair[1];
            } else {
                raw = center ? await centerThumb(item, SETTINGS.uprightFrac, 0) : (item.raw || item.thumb);
                flipped = center ? await centerThumb(item, SETTINGS.uprightFrac, 180) : (await uprightThumb(item, { rotate: 180, mirror: false, raw: true })).data;
            }
            // swapped: A = döndürülmüş, B = ham. Dönüş: { side: 'top'|'bottom' (ham dik ise 'top'), byFace, detail } | null.
            // Yüz ipucu (burun/çene; face_cue) verilmişse o kullanılır, yoksa modelin son yanıtı (diş ipucu).
            const detail = [];
            const read = function (model, effort, swapped) {
                return sendHedged({ type: 'ids-upright', model: model, effort: effort, a: swapped ? flipped : raw, b: swapped ? raw : flipped })
                    .then(function (reply) {
                        const r = reply.result || {};
                        detail.push({ model: model, swapped: swapped, face: r.face_cue, teeth: r.teeth_cue, upright: r.upright, incisors: r.incisors_side_upright, reason: r.reason });
                        const byFace = r.face_cue === 'A' || r.face_cue === 'B';
                        const u = byFace ? r.face_cue : r.upright;
                        if (u !== 'A' && u !== 'B') return null;
                        // incisors: dik sürümde kesicilerin yanı (A/B sırasından bağımsız).
                        const inc = r.incisors_side_upright === 'left' || r.incisors_side_upright === 'right' ? r.incisors_side_upright : null;
                        return { side: (u === 'A') !== swapped ? 'top' : 'bottom', byFace: byFace, incisors: inc };
                    })
                    .catch(function () { return null; });
            };
            const same = function (x, y) { return !!(x && y && x.side === y.side); };
            const pick = function (x, y) { return { side: x.side, byFace: !!(x.byFace || (y && y.byFace)), incisors: x.incisors && y && y.incisors && x.incisors !== y.incisors ? null : (x.incisors || (y && y.incisors) || null), detail: detail }; };
            if (arbiter) {
                const pairA = speedOn() ? await Promise.all([read('opus', 'high', false), read('opus', 'high', true)]) : null;
                const a1 = pairA ? pairA[0] : await read('opus', 'high', false);
                const a2 = pairA ? pairA[1] : await read('opus', 'high', true);
                return same(a1, a2) ? pick(a1, a2) : null;
            }
            const both = speedOn()
                ? await Promise.all([read(SETTINGS.poseModel, SETTINGS.poseEffort, false), read(SETTINGS.poseModel, SETTINGS.poseEffort, true)])
                : null;
            const r1 = both ? both[0] : await read(SETTINGS.poseModel, SETTINGS.poseEffort, false);
            const r2 = both ? both[1] : await read(SETTINGS.poseModel, SETTINGS.poseEffort, true);
            if (same(r1, r2)) return pick(r1, r2);
            const r3 = await read('opus', SETTINGS.poseArbiterEffort, false);
            if (same(r3, r1)) return pick(r3, r1);
            if (same(r3, r2)) return pick(r3, r2);
            return null;
        });
    }

    // box: kesirler (eğim varsa döndürülmüş karede); tilt: oklüzal düzlemin eğimi (derece, sağa doğru aşağı = pozitif); pivot: döndürme
    // merkezi (kesir). Görüntü pivot etrafında -tilt döndürülüp kutu o karede kesilir (oklüzal düzlem yere paralel olur). orient:
    // {rotate, mirror}: kesilen kare önce saat yönünde rotate kadar döndürülür, sonra mirror ise sağ-sol aynalanır (IDS menüsündeki sıra).
    // Kaynağı (bitmap ya da tuval, sw×sh) önce saat yönünde orient.rotate kadar döndürür, sonra orient.mirror ise sağ-sol aynalar
    // (IDS menüsündeki sıra). Dönüş: yeni tuval (90/270'te boyutlar yer değiştirir).
    function orientCanvas(source, sw, sh, orient) {
        const rot = (orient && orient.rotate) || 0;
        const fin = document.createElement('canvas');
        fin.width = rot % 180 ? sh : sw;
        fin.height = rot % 180 ? sw : sh;
        const g = fin.getContext('2d');
        g.translate(fin.width / 2, fin.height / 2);
        if (orient && orient.mirror) g.scale(-1, 1);
        g.rotate(rot * Math.PI / 180);
        g.drawImage(source, -sw / 2, -sh / 2);
        return fin;
    }

    // Küçük karenin dikleştirilmiş hali (modele gitmek için): { data, w, h } — w/h dikleştirilmiş TAM karenin piksel boyutu.
    // orient.raw: ham küçük kareden (EXIF uygulanmadan).
    async function uprightThumb(item, orient) {
        const useRaw = !!(orient && orient.raw && item.raw);
        const bw = useRaw ? item.rw : item.w, bh = useRaw ? item.rh : item.h;
        const bin = atob(useRaw ? item.raw : item.thumb);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        try {
            const fin = orientCanvas(bitmap, bitmap.width, bitmap.height, orient);
            const swap = ((orient && orient.rotate) || 0) % 180 !== 0;
            return { data: fin.toDataURL('image/jpeg', 0.85).split(',')[1], w: swap ? bh : bw, h: swap ? bw : bh };
        } finally {
            bitmap.close();
        }
    }

    // upright: box/pivot dikleştirilmiş kare eksenlerinde; tam kare önce dikleştirilir, sonra kesilir (sonradan döndürme yok).
    async function cropOne(file, box, tilt, pivot, orient, upright) {
        const bitmap = await bitmapOf(file);
        const eff = effectiveOrient(orient);
        let source = bitmap;
        let full = null;
        try {
            if (upright && eff && (eff.rotate || eff.mirror)) {
                full = orientCanvas(bitmap, bitmap.width, bitmap.height, eff);
                source = full;
            }
            const W = source.width, H = source.height;
            const sx = Math.round(box[0] * W), sy = Math.round(box[1] * H);
            const sw = Math.max(1, Math.round((box[2] - box[0]) * W));
            const sh = Math.max(1, Math.round((box[3] - box[1]) * H));
            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            if (tilt) {
                const px = (pivot ? pivot[0] : (box[0] + box[2]) / 2) * W;
                const py = (pivot ? pivot[1] : (box[1] + box[3]) / 2) * H;
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, sw, sh);
                ctx.translate(px - sx, py - sy);
                ctx.rotate(-tilt * Math.PI / 180);
                ctx.translate(-px, -py);
                ctx.drawImage(source, 0, 0);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            } else {
                ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
            }
            // Yön: önce saat yönünde orient.rotate kadar döndürülür, sonra orient.mirror ise sağ-sol aynalanır (IDS menüsündeki sıra).
            let fin = canvas;
            if (!full && eff && (eff.rotate || eff.mirror)) fin = orientCanvas(canvas, sw, sh, eff);
            const cap = speedOn() ? SETTINGS.outMaxSide : 0;
            if (cap > 0 && Math.max(fin.width, fin.height) > cap) {
                const k = cap / Math.max(fin.width, fin.height);
                const small = document.createElement('canvas');
                small.width = Math.max(1, Math.round(fin.width * k));
                small.height = Math.max(1, Math.round(fin.height * k));
                const sctx = small.getContext('2d');
                sctx.imageSmoothingQuality = 'high';
                sctx.drawImage(fin, 0, 0, small.width, small.height);
                if (fin !== canvas) { fin.width = 1; fin.height = 1; }
                canvas.width = 1; canvas.height = 1;
                fin = small;
            }
            const sig = signatureOf(fin, fin.width, fin.height);
            const blob = await toBlob(fin);
            if (!blob) throw new Error('kırpılmış görüntü üretilemedi');
            const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
            return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), width: fin.width, height: fin.height, sig: sig };
        } finally {
            bitmap.close();
            if (full) { full.width = 1; full.height = 1; }
        }
    }

    // Yuvası bilinen karelerin kırpma kutusu ve ölçümleri: entries = [{ item, slot }]. Tek çağrı (6'lık gruplar aynı anda); oklüzal
    // kareler için diş sırası kutusu ayrıca odaklı okumayla (ids-arch) alınır ve geçerliyse ölçümlerin yerine konur.
    // Dönüş: { byName: { ad: modelÇıktısı }, notes: [] }.
    async function readBoxes(entries, progress) {
        const say = progress || function () {};
        const byName = {};
        const notes = [];
        const groups = [];
        const per = speedOn() ? SETTINGS.boxGroupSize : SETTINGS.groupSize;
        for (let i = 0; i < entries.length; i += per) groups.push(entries.slice(i, i + per));
        let answered = 0;
        const cropWork = groups.map(async function (group) {
            try {
                const reply = await sendHedged({
                    type: 'ids-crop', effort: SETTINGS.cropEffort, known: true,
                    images: group.map(function (e, k) { return { index: k + 1, slot: e.slot, data: e.thumb || e.item.thumb }; })
                });
                (reply.items || []).forEach(function (r) {
                    const e = group[Number(r.index) - 1];
                    if (!e) return;
                    r.slot = e.slot;
                    byName[e.item.name] = r;
                });
            } catch (error) {
                group.forEach(function (e) { notes.push(e.item.name + ': kırpma kutusu alınamadı (' + error.message + ')'); });
            }
            answered++;
            say('Kırpma kutuları okunuyor… (' + answered + '/' + groups.length + ')');
        });
        const occl = entries.filter(function (e) { return OCCLUSAL.test(e.slot); });
        // Oklüzal ölçümü iki bağımsız okumayla, aynı anda: aynı karede diş sınırı ve simetri ekseni okumadan okumaya oynuyor (Anastasiya
        // 5085: 6,3° / 2,2°), karşıya düşen diş şeridi bir okumada görülüp ötekinde görülmüyor (Mutigulina 2074). Kutu ve eksen ortalanır,
        // eksenler archAxisAgree dereceden fazla ayrışırsa döndürülmez; şerit okumalardan biri bile görürse kesilir (dişe yakın olan kenar).
        const archWork = (async function () {
            if (!occl.length) return;
            const ask = function (list) {
                return sendHedged({
                    type: 'ids-arch', effort: SETTINGS.archEffort, model: SETTINGS.archModel,
                    images: list.map(function (e, k) { return { index: k + 1, data: e.thumb || e.item.thumb }; })
                }).then(function (reply) { return reply.items || []; }, function (error) { return error; });
            };
            // Hızlandırma: her kare ayrı çağrıda (yanıt kısa, çağrılar aynı anda). readsOf[k]: k. karenin okumaları (index 1'e göre).
            const split = speedOn() && SETTINGS.archSplit;
            const lists = split ? occl.map(function (e) { return [e]; }) : [occl];
            const replySets = await Promise.all(lists.map(function (list) { return Promise.all(Array.from({ length: SETTINGS.archReads }, function () { return ask(list); })); }));
            await Promise.all(cropWork);
            const firstError = replySets.reduce(function (acc, set) { return acc || set.find(function (x) { return !Array.isArray(x); }); }, null);
            if (!replySets.some(function (set) { return set.some(function (x) { return Array.isArray(x); }); })) {
                occl.forEach(function (e) { notes.push(e.item.name + ': oklüzal diş sırası okuması alınamadı (' + (firstError && firstError.message) + ')'); });
                return;
            }
            occl.forEach(function (e, k) {
                const set = split ? replySets[k] : replySets[0];
                const idx = split ? 1 : k + 1;
                const reads = set.filter(function (x) { return Array.isArray(x); }).map(function (items) { return items.find(function (r) { return Number(r.index) === idx; }); }).filter(function (r) {
                    if (!r) return false;
                    const l = num(r.teeth_left), rt = num(r.teeth_right), t = num(r.teeth_top), b = num(r.teeth_bottom);
                    return rt - l > 0.1 && b - t > 0.1 && l >= 0 && t >= 0 && rt <= 1 && b <= 1 && (rt - l) * (b - t) < 0.92;
                });
                const m = byName[e.item.name] || (byName[e.item.name] = { slot: e.slot, x0: 0, y0: 0, x1: 1, y1: 1, note: '' });
                if (!reads.length) { notes.push(e.item.name + ': oklüzal diş sırası kutusu güvenilir ölçülemedi, ilk ölçüm kullanıldı'); return; }
                const avg = function (key) { return reads.reduce(function (s, r) { return s + num(r[key]); }, 0) / reads.length; };
                m.teeth_left = avg('teeth_left'); m.teeth_right = avg('teeth_right'); m.teeth_top = avg('teeth_top'); m.teeth_bottom = avg('teeth_bottom');
                m.arch_checked = true;
                // Şerit: gören okumalar; aynı yanı görenlerden dişe en yakın kenar (en çok dışlayan).
                const seen = reads.filter(function (r) { return r.direct_teeth_side && r.direct_teeth_side !== 'none' && num(r.direct_teeth_edge) > 0 && num(r.direct_teeth_edge) < 1; });
                if (seen.length) {
                    const side = seen[0].direct_teeth_side;
                    const edges = seen.filter(function (r) { return r.direct_teeth_side === side; }).map(function (r) { return num(r.direct_teeth_edge); });
                    m.direct_side = side;
                    m.direct_edge = side === 'bottom' || side === 'right' ? Math.min.apply(null, edges) : Math.max.apply(null, edges);
                } else m.direct_side = 'none';
                // Eksen: geçerli okumaların açıları uyuşuyorsa ortalama.
                const axes = reads.map(function (r) { return [num(r.incisor_x), num(r.incisor_y), num(r.molar_mid_x), num(r.molar_mid_y)]; })
                    .filter(function (a) { return a.every(function (v) { return v > 0 && v < 1; }); });
                const ew = e.w || e.item.w || 1, eh = e.h || e.item.h || 1;
                const angleOf = function (a) { return Math.atan2((a[3] - a[1]) * eh, (a[2] - a[0]) * ew) * 180 / Math.PI; };
                if (axes.length >= 2 && Math.abs(angleOf(axes[0]) - angleOf(axes[1])) > SETTINGS.archAxisAgree) {
                    notes.push(e.item.name + ': iki okumanın simetri ekseni ' + Math.abs(angleOf(axes[0]) - angleOf(axes[1])).toFixed(1) + '° ayrıştı, döndürülmedi');
                } else if (axes.length) {
                    m.axis = [0, 1, 2, 3].map(function (i) { return axes.reduce(function (s, a) { return s + a[i]; }, 0) / axes.length; });
                }
            });
        })();
        await Promise.all(cropWork.concat([archWork]));
        return { byName: byName, notes: notes };
    }

    // Yuvası bilinmeyen kareleri etiketler (IDS'in boş bıraktığı yuvaları doldurmak için): { ad: yuva } (düşük güven → 'other').
    async function classify(items, progress) {
        const say = progress || function () {};
        const labels = {};
        const groups = [];
        for (let i = 0; i < items.length; i += SETTINGS.groupSize) groups.push(items.slice(i, i + SETTINGS.groupSize));
        let answered = 0;
        await Promise.all(groups.map(async function (group) {
            try {
                const reply = await sendHedged({
                    type: 'ids-crop', effort: SETTINGS.cropEffort, classify: true,
                    images: group.map(function (it, k) { return { index: k + 1, data: it.thumb }; })
                });
                (reply.items || []).forEach(function (r) {
                    const it = group[Number(r.index) - 1];
                    if (!it) return;
                    labels[it.name] = Number(r.confidence) >= SETTINGS.minConfidence ? r.slot : 'other';
                });
            } catch (error) {
                group.forEach(function (it) { labels[it.name] = 'other'; });
            }
            answered++;
            say('Yerleşmeyen fotoğraflar sınıflandırılıyor… (' + answered + '/' + groups.length + ')');
        }));
        return labels;
    }

    // Kutu merkezi (pivot, kesir) etrafında -tilt derece döndürme: to = noktanın döndürülmüş karedeki yeri, inside = döndürülmüş
    // karedeki nokta orijinal görüntünün içinde mi (dışındaysa kırpmada siyah köşe kalır). cropOne ile aynı dönüş.
    function rotator(tilt, pivot, w, h) {
        const rad = -tilt * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const px = pivot[0] * w, py = pivot[1] * h;
        return {
            to: function (x, y) { const X = x * w - px, Y = y * h - py; return [(X * cos - Y * sin + px) / w, (X * sin + Y * cos + py) / h]; },
            inside: function (x, y) {
                const X = x * w - px, Y = y * h - py;
                const ox = (px + X * cos + Y * sin) / w, oy = (py - X * sin + Y * cos) / h;
                return ox >= -0.001 && ox <= 1.001 && oy >= -0.001 && oy <= 1.001;
            }
        };
    }

    // Oklüzal simetri ekseni (orta kesicilerin teması → en arka iki azının ortası) dik dursun diye gereken eğim (derece; kullanıcı,
    // 6 Kasım 2026). Eksen yatay ya da ölçüm kısaysa 0; maxOccTilt'ten büyük açı ölçüm hatası sayılır (0).
    function occlusalTilt(item, w, h) {
        const a = item.axis;
        if (!a || !a.every(function (v) { return v > 0 && v < 1; })) return 0;
        const dx = (a[2] - a[0]) * w, dy = (a[3] - a[1]) * h;
        if (Math.hypot(dx, dy) < 0.15 * Math.min(w, h)) return 0;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const tilt = Math.abs(angle - 90) <= 45 ? angle - 90 : Math.abs(angle + 90) <= 45 ? angle + 90 : 0;
        if (Math.abs(tilt) < SETTINGS.minTilt || Math.abs(tilt) > SETTINGS.maxOccTilt) return 0;
        return tilt;
    }

    // Oklüzal karede ön dişlerin yanı: simetri ekseninden (kesici noktası azıların ortasının hangi yanında), yoksa doğrudan görünen
    // dişlerin karşı yanı (şerit azı ucunun ötesinde durur). Bilinmiyorsa null.
    function incisorSide(item) {
        const a = item.axis;
        if (a && a.every(function (v) { return v > 0 && v < 1; })) {
            const dx = a[2] - a[0], dy = a[3] - a[1];
            if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'top' : 'bottom';
            return dx > 0 ? 'left' : 'right';
        }
        return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[item.direct_side] || null;
    }

    // Oklüzal çerçeve: diş sırası kutusu (+ doğrudan görünen dişlerin dışlanması), istenirse eğim düzeltmesiyle. Eğimde kutu ve şerit
    // kenarı döndürülmüş kareye taşınır; köşeler görüntü dışına taşarsa kutu dişlere kadar daraltılır, yine taşarsa null (eğimsiz denenir).
    // Dönüş: { box, tilt, pivot, occ } ya da null.
    function occlusalFrame(item, w, h, tilt, notes) {
        let occ = occlusalBox(item);
        if (!occ) return null;
        const trimmed = trimDirect(item, occ);
        if (trimmed) { occ = trimmed; notes.push('doğrudan görünen dişler diş sırası kutusuna karışmıştı, kutu şeridin kenarında kesildi'); }
        let it = item, pivot = null, R = null, core = occ;
        if (tilt) {
            pivot = [(occ[0] + occ[2]) / 2, (occ[1] + occ[3]) / 2];
            R = rotator(tilt, pivot, w, h);
            // Şerit karşılaştırması kenar ortalarıyla (döndürülmüş kutunun köşeleri şerit kenarını geçebilir; köşe diş değildir).
            core = [R.to(occ[0], pivot[1])[0], R.to(pivot[0], occ[1])[1], R.to(occ[2], pivot[1])[0], R.to(pivot[0], occ[3])[1]];
            const pts = [[occ[0], occ[1]], [occ[2], occ[1]], [occ[0], occ[3]], [occ[2], occ[3]]].map(function (p) { return R.to(p[0], p[1]); });
            occ = [Math.min.apply(null, pts.map(function (p) { return p[0]; })), Math.min.apply(null, pts.map(function (p) { return p[1]; })),
                Math.max.apply(null, pts.map(function (p) { return p[0]; })), Math.max.apply(null, pts.map(function (p) { return p[1]; }))];
            const e = num(item.direct_edge);
            if (e > 0 && e < 1) {
                const side = item.direct_side;
                const moved = side === 'top' || side === 'bottom' ? R.to(pivot[0], e)[1] : R.to(e, pivot[1])[0];
                it = Object.assign({}, item, { direct_edge: moved });
            }
        }
        let box = finalBox(occ, SETTINGS.occlusalMargin, 0, w, h);
        if (!box) return null;
        // Ön diş yanında pay daha az (kullanıcı, 6 Kasım 2026: ön dişlerle fotoğraf kenarı arası çok açıktı).
        const front = incisorSide(item);
        if (front) {
            const fh = (occ[3] - occ[1]) * SETTINGS.occlusalFrontMargin / 100, fw = (occ[2] - occ[0]) * SETTINGS.occlusalFrontMargin / 100;
            if (front === 'top') box[1] = Math.max(box[1], Math.max(0, occ[1] - fh));
            else if (front === 'bottom') box[3] = Math.min(box[3], Math.min(1, occ[3] + fh));
            else if (front === 'left') box[0] = Math.max(box[0], Math.max(0, occ[0] - fw));
            else if (front === 'right') box[2] = Math.min(box[2], Math.min(1, occ[2] + fw));
        }
        box = relaxBox(box, w, h, 0, SETTINGS.minOutW, SETTINGS.minOutH, SETTINGS.minOutArea);
        const cut = excludeDirect(box, it, core);
        if (cut) { box = cut; notes.push('aynanın dışında doğrudan görünen dişler kadraj dışında bırakıldı'); }
        else if (item.direct_side && item.direct_side !== 'none') {
            notes.push('doğrudan görünen dişler bildirildi (' + item.direct_side + ' ' + num(item.direct_edge).toFixed(3) + ') ama uygulanmadı; diş sırası ' +
                occ.map(function (v) { return v.toFixed(3); }).join(' ') + ', kutu ' + box.map(function (v) { return v.toFixed(3); }).join(' '));
        }
        if (R) {
            const ok = function (b) { return R.inside(b[0], b[1]) && R.inside(b[2], b[1]) && R.inside(b[0], b[3]) && R.inside(b[2], b[3]); };
            for (let i = 0; i < 40 && !ok(box); i++) {
                const step = 0.0025;
                // Kenar dişlere kadar daralır ama hiç genişlemez (şerit için kesilmiş kenar geri açılmasın).
                box = [Math.min(box[0] + step, Math.max(box[0], occ[0])), Math.min(box[1] + step, Math.max(box[1], occ[1])),
                    Math.max(box[2] - step, Math.min(box[2], occ[2])), Math.max(box[3] - step, Math.min(box[3], occ[3]))];
            }
            if (!ok(box)) return null;
        }
        return { box: box, tilt: tilt, pivot: pivot, occ: occ };
    }

    // Yuvası bilinen kare için son çerçeve: { box, tilt, pivot, notes } ya da null (kutu geçersiz).
    function frameFor(model, slot, w, h, upright) {
        const notes = [];
        const item = Object.assign({}, model, { slot: slot, upright: !!upright });
        const face = FACE.test(slot);
        if (OCCLUSAL.test(slot) && occlusalBox(item)) {
            const tilt = occlusalTilt(item, w, h);
            // Tam açı köşede boş alan bırakıyorsa (dişler görüntü kenarına yakın, Anastasiya 5085: 6,3°) açının 2/3'ü, sonra 1/3'ü denenir.
            let tried = [], of = null;
            for (const k of tilt ? [1, 2 / 3, 1 / 3, 0] : [0]) {
                tried = [];
                of = occlusalFrame(item, w, h, tilt * k, tried);
                if (of) break;
            }
            if (!of) return null;
            tried.forEach(function (n) { notes.push(n); });
            if (tilt && Math.abs(of.tilt) < Math.abs(tilt) - 0.01) notes.push('simetri ekseni ' + Math.abs(tilt).toFixed(1) + '° eğikti; tam döndürme köşede boş alan bırakacaktı' + (of.tilt ? ', ' + Math.abs(of.tilt).toFixed(1) + '° döndürüldü' : ', döndürülmedi'));
            else if (of.tilt) notes.push('simetri ekseni ' + Math.abs(of.tilt).toFixed(1) + '° döndürülerek düzeltildi');
            if ((of.box[2] - of.box[0]) * (of.box[3] - of.box[1]) > 0.9) notes.push('oklüzal kutu neredeyse tüm kareyi kaplıyor, kırpma etkisiz');
            return { box: of.box, tilt: of.tilt, pivot: of.pivot, notes: notes };
        }
        const frame = INTRAORAL.test(slot) ? intraoralFrameAny(item, w, h) : null;
        let box = finalBox(frame ? frame.box : [item.x0, item.y0, item.x1, item.y1],
            face ? SETTINGS.faceMargin : SETTINGS.margin, face ? SETTINGS.faceRatio : 0, w, h);
        if (!box) return null;
        if (!face) box = relaxBox(box, w, h, frame ? SETTINGS.maxAspect : 0, SETTINGS.minOutW, SETTINGS.minOutH, SETTINGS.minOutArea);
        if (OCCLUSAL.test(slot)) notes.push('oklüzal diş sınırı ölçülemedi, modelin kutusu kullanıldı');
        const tilt = frame ? frame.tilt : 0;
        if (tilt) notes.push('oklüzal düzlem ' + Math.abs(tilt).toFixed(1) + '° düzeltildi');
        if (frame && !frame.rotated && !frame.upper && !frame.lower) notes.push('ekartör kolu ölçülemedi, modelin kutusu kullanıldı');
        if (frame && frame.used && frame.used.room) notes.push('çerçeve dişleri sarıyordu, genişletildi (' + frame.used.room + ')');
        return { box: box, tilt: tilt, pivot: frame ? frame.pivot : null, notes: notes };
    }

    // Yuvası ve yönü bilinen kareyi kırpar ve döndürür: { file, width, height, notes }. model yoksa (kutu alınamadı) yalnız döndürülür.
    // upright: model dikleştirilmiş kareyi ölçtü; çerçeve ve kırpma dikleştirilmiş karede.
    async function cropFor(item, slot, model, orient, upright) {
        const swap = upright && ((orient && orient.rotate) || 0) % 180 !== 0;
        const useRaw = !!(orient && orient.raw && item.raw);
        const bw = useRaw ? item.rw : item.w, bh = useRaw ? item.rh : item.h;
        const frame = model ? frameFor(model, slot, swap ? bh : bw, swap ? bw : bh, upright) : null;
        const box = frame ? frame.box : [0, 0, 1, 1];
        const result = await cropOne(item.file, box, frame ? frame.tilt : 0, frame ? frame.pivot : null, orient, !!upright);
        result.notes = (frame ? frame.notes : ['kırpma kutusu yok, yalnız yön düzeltildi']).map(function (n) { return item.name + ': ' + n; });
        result.cropped = !!frame;
        return result;
    }

    // Kliniğin çekim kuralı: ön ve bukkal kareler HAM (EXIF uygulanmamış) haliyle YATAY durur (kamera ağız içinde yön sensörünü yanlış
    // okuyor; 28 hastada doğrulandı, 2 Kasım 2026) ama 180° ters olabilir (Altan 1.Refinement, 3 Kasım 2026): 0°/180° kararı content.js
    // poseWork'te ham kareden okunan üst çene yanıyla verilir. raw: ham kareden. Oklüzal kareler bu kuralı kullanmaz (yön modelden).
    // KLİNİK KURALI (kullanıcı, 5 Ekim 2026; 3 Kasım 2026'da tam çözünürlükte doğrulandı): ön ve bukkal kareler kamera ters tutularak
    // çekilir → ham kare BAŞ AŞAĞI, 180° döndürülür. (2 Kasım'daki "ham kare dik" yargısı küçük resimde yanlış bakılmıştı.)
    function ruleOrient(slot) {
        return { rotate: 180, mirror: false, raw: true, warning: '' };
    }

    // Kırpılmamış hali, yönü düzeltilmiş olarak ("Kırpılmamış hallerine dön").
    function fullFor(item, orient) {
        return cropOne(item.file, [0, 0, 1, 1], 0, null, orient);
    }

    window.idsfyCrop = { speedOn: speedOn, ruleOrient: ruleOrient, readRawUpright: readRawUpright, centerThumb: centerThumb, matchRanked: matchRanked, uprightThumb: uprightThumb, readPose: readPose, poseValid: poseValid, prepare: prepare, classify: classify, readBoxes: readBoxes, frameFor: frameFor, cropFor: cropFor, fullFor: fullFor,
        cropOne: cropOne, matchGroup: matchGroup, matchOriginal: matchOriginal, buccalSide: buccalSide, qualityScore: qualityScore,
        relaxBox: relaxBox, finalBox: finalBox, intraoralFrame: intraoralFrame, intraoralFrameAny: intraoralFrameAny, occlusalBox: occlusalBox,
        SETTINGS: SETTINGS };
})();
