// EXIF yön etiketi okuyucu (saf; tarayıcıda window.idsfyExif, Node'da module.exports).
// Neden: kliniğin kamerası ağız içi karelerde (kamera hastanın üstüne eğikken) yön sensörünü yanlış okuyor; EXIF 6/8 yazıyor ama
// ham kare diktir. Tarayıcı EXIF'i uygulayınca bukkal/oklüzal kareler yan duruyordu. Ağız içi kareler ham haliyle işlenir;
// yüz karelerinde EXIF doğrudur ve uygulanır. Değer: ham kareyi görüntülenen hale getiren saat yönünde dönüş (0/90/180/270).
(function (root) {
    'use strict';

    // bytes: dosyanın ilk ~128 KB'ı (Uint8Array). Dönüş: 0 | 90 | 180 | 270 (etiket yoksa 0).
    function exifRotation(bytes) {
        if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 0;
        let p = 2;
        while (p + 4 <= bytes.length) {
            if (bytes[p] !== 0xFF) return 0;
            const marker = bytes[p + 1];
            if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { p += 2; continue; }
            if (marker === 0xDA || marker === 0xD9) return 0; // görüntü verisi başladı, APP1 yok
            const len = (bytes[p + 2] << 8) | bytes[p + 3];
            if (len < 2) return 0;
            if (marker === 0xE1 && p + 10 <= bytes.length && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66) {
                return orientationFromTiff(bytes, p + 10, Math.min(bytes.length, p + 2 + len));
            }
            p += 2 + len;
        }
        return 0;
    }

    function orientationFromTiff(bytes, start, end) {
        if (start + 8 > end) return 0;
        const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
        const big = bytes[start] === 0x4D && bytes[start + 1] === 0x4D;
        if (!little && !big) return 0;
        const u16 = function (o) { return o + 2 <= end ? (little ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]) : 0; };
        const u32 = function (o) {
            if (o + 4 > end) return 0;
            return little ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
                : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
        };
        if (u16(start + 2) !== 0x2A) return 0;
        const ifd = start + u32(start + 4);
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
            const e = ifd + 2 + i * 12;
            if (e + 12 > end) return 0;
            if (u16(e) === 0x0112) {
                const v = u16(e + 8);
                return v === 6 ? 90 : v === 3 ? 180 : v === 8 ? 270 : 0;
            }
        }
        return 0;
    }

    // Dosya adındaki çekim sırası: son rakam dizisi (2Y6A0547.JPG → 547, "2Y6A0533 - Kopya.JPG" → 533); yoksa null.
    function seqOf(name) {
        const base = String(name || '').replace(/\.[^.]+$/, '').replace(/\s*[-_]?\s*kopya.*$/i, '').replace(/\s*\(\d+\)\s*$/, '');
        const m = base.match(/(\d+)(?!.*\d)/);
        return m ? Number(m[1]) : null;
    }

    const api = { exifRotation: exifRotation, seqOf: seqOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.idsfyExif = api;
})(typeof window !== 'undefined' ? window : this);
