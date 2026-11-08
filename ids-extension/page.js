// IDS Yardımcısı - sayfa dünyasında çalışan köprü.
// IDS'in otomatik sıralaması bırakılan dosyaları dataTransfer.items[].webkitGetAsEntry()
// üzerinden okur. Bu nesneler eklentinin yalıtılmış dünyasından sayfaya geçemediği için
// bırakma olayı burada, sayfanın kendi dünyasında üretilir. Dosyalar content.js'in
// doldurduğu gizli #idsfy-bridge girişinden alınır.
//
// Yüklemenin bittiği de buradan izlenir: IDS her fotoğraf için görüntü servisine art arda
// istekler atar (kayıt aç, içeriği gönder, bilgiyi ve küçük resmi al). Bırakmadan sonra
// başlayan ve süren istek sayıları <html> öğesinin data-idsfy-* özniteliklerine yazılır;
// content.js bunları okur.
(function () {
    'use strict';

    const ASSET_REQUEST = /smarthub\.invisalign\.com\/.*\/assets/;
    const counts = document.documentElement.dataset;
    let watching = false;

    function publish(started, pending, failed) {
        counts.idsfyStarted = String(started);
        counts.idsfyPending = String(pending);
        counts.idsfyFailed = String(failed);
    }

    let started = 0, pending = 0, failed = 0;

    function watchUploads() {
        if (watching) return;
        watching = true;
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.idsfyAsset = ASSET_REQUEST.test(String(url));
            return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (this.idsfyAsset) {
                started++;
                pending++;
                publish(started, pending, failed);
                this.addEventListener('loadend', function () {
                    pending--;
                    if (this.status === 0 || this.status >= 400) failed++;
                    publish(started, pending, failed);
                });
            }
            return send.apply(this, arguments);
        };
    }

    function entryFor(file) {
        return {
            isFile: true,
            isDirectory: false,
            name: file.name,
            fullPath: '/' + file.name,
            file: function (resolve) { resolve(file); }
        };
    }

    document.addEventListener('idsfy-drop', function () {
        const bridge = document.getElementById('idsfy-bridge');
        const area = document.querySelector('[class*="AutoSortLayout-dropArea"]');
        if (!bridge) return;
        if (!area) {
            bridge.dataset.result = 'error:IDS bırakma alanı bulunamadı';
            return;
        }
        watchUploads();
        started = 0;
        failed = 0;
        publish(started, pending, failed);
        const files = Array.from(bridge.files);
        const items = files.map(function (file) {
            return {
                kind: 'file',
                type: file.type,
                getAsFile: function () { return file; },
                webkitGetAsEntry: function () { return entryFor(file); }
            };
        });
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', {
            value: { items: items, files: files, types: ['Files'] }
        });
        area.dispatchEvent(drop);
        bridge.dataset.result = 'ok:' + files.length;
    });
})();
