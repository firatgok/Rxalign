// Güncelleme şeridi: arka plan (src/background.js) yeni sürümü indirdiyse her panelin
// (.idsfy-panel: Form Doldurucu, Foto Yükleyici, CBCT) başlığının altında
// "… güncellemesi indirildi, kurulsun mu?" sorusu çıkar. "Kur" güncelleyiciye kurdurur ve eklenti
// yeniden başlar; "Sonra" şeridi 6 saat gizler. Güncelleyici kurulu değilse zip bağlantısı gösterilir.
(function () {
    'use strict';
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;

    const SNOOZE_MS = 6 * 60 * 60 * 1000;
    const IDLE_MS = 60 * 1000;
    let state = null;
    let busyText = '';
    let autoOn = true;
    let stale = false;

    function send(message) {
        return new Promise(function (resolve, reject) {
            if (!chrome.runtime || !chrome.runtime.id) return reject(new Error('Eklenti yenilendi; sayfayı F5 ile yenileyin.'));
            chrome.runtime.sendMessage(message, function (reply) {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!reply || !reply.ok) return reject(new Error(reply ? reply.error : 'yanıt yok'));
                resolve(reply);
            });
        });
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function button(text, onClick) {
        const node = el('button', 'idsfy-button', text);
        node.type = 'button';
        node.addEventListener('click', onClick);
        return node;
    }

    function visible(s) {
        if (!s) return false;
        if (s.announce) return true;
        if (s.status !== 'downloaded' && s.status !== 'manual') return false;
        return !(s.snoozedAt && Date.now() - s.snoozedAt < SNOOZE_MS);
    }

    function fill(strip) {
        strip.textContent = '';
        const text = el('div', 'idsfy-update-text');
        const actions = el('div', 'idsfy-update-actions');
        strip.appendChild(text);
        if (stale) {
            text.textContent = 'IDS Yardımcısı güncellendi; bu sayfayı F5 ile yenileyin.';
            return;
        }
        if (busyText) {
            text.textContent = busyText;
            return;
        }
        if (state.announce) {
            text.textContent = 'IDS Yardımcısı ' + state.announce + ' kuruldu.';
            actions.appendChild(button('Tamam', function () {
                send({ type: 'ids-update-seen' }).catch(function () {});
            }));
        } else if (state.status === 'downloaded') {
            text.textContent = 'IDS Yardımcısı ' + state.version + ' güncellemesi indirildi' +
                (autoOn ? '; panel boşta kalınca kendiliğinden kurulacak.' : ', kurulsun mu?') +
                (state.notes ? ' (' + state.notes + ')' : '');
            actions.appendChild(button(autoOn ? 'Şimdi kur' : 'Kur', install));
            actions.appendChild(button('Sonra', snooze));
        } else {
            text.textContent = 'IDS Yardımcısı ' + state.version + ' sürümü çıktı ama otomatik indirilemedi (' +
                (state.error || 'güncelleyici yok') + '). Eklenti klasöründeki Guncelleyiciyi-Kur.bat bir kez ' +
                'çalıştırılmalı; ya da zip\'i indirip klasörün üzerine açın: ';
            const link = el('a', '', 'ids-yardimcisi-' + state.version + '.zip');
            link.href = state.url || '#';
            link.target = '_blank';
            link.rel = 'noopener';
            text.appendChild(link);
            actions.appendChild(button('Sonra', snooze));
        }
        strip.appendChild(actions);
    }

    function render() {
        const show = stale || !!busyText || visible(state);
        document.querySelectorAll('.idsfy-panel').forEach(function (panel) {
            let strip = null;
            for (const child of panel.children) {
                if (child.classList.contains('idsfy-update')) { strip = child; break; }
            }
            if (!show) {
                if (strip) strip.remove();
                return;
            }
            if (!strip) {
                strip = el('div', 'idsfy-update');
                const head = panel.querySelector('.idsfy-head');
                if (head && head.parentNode === panel) panel.insertBefore(strip, head.nextSibling);
                else panel.insertBefore(strip, panel.firstChild);
            }
            fill(strip);
        });
    }

    async function install() {
        busyText = 'Güncelleme kuruluyor…';
        render();
        try {
            const reply = await send({ type: 'ids-update-install' });
            busyText = 'IDS Yardımcısı ' + (reply.result && reply.result.version || state.version) +
                ' kuruldu; eklenti yeniden başlıyor. Açık IDS sekmelerini F5 ile yenileyin.';
        } catch (error) {
            busyText = '';
            state = Object.assign({}, state, { status: 'manual', error: error.message });
        }
        render();
    }

    function snooze() {
        state = Object.assign({}, state, { snoozedAt: Date.now() });
        render();
        send({ type: 'ids-update-snooze' }).catch(function () {});
    }

    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local' || !changes.idsUpdate) return;
        state = changes.idsUpdate.newValue || null;
        if (!busyText) render();
    });

    function watchPanels() {
        const target = document.body || document.documentElement;
        new MutationObserver(function (mutations) {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.classList.contains('idsfy-panel')) {
                        render();
                        return;
                    }
                }
            }
        }).observe(target, { childList: true });
    }

    // Panel etkinliği: panelde (güncelleme şeridi hariç) metin ya da düğüm değiştikçe zaman damgası yazılır; arka plan
    // kendiliğinden kurulumu yalnız tüm sekmelerde 60 sn sessizlikten sonra yapar. Yükleme bekleme döngüleri de
    // durum metnini yazdığından uzun yüklemeler etkinlik sayılır.
    const tabKey = Math.random().toString(36).slice(2);
    let lastActivity = Date.now();
    let lastWritten = 0;
    let idleSent = false;

    function alive() {
        try { return !!(window.chrome && chrome.runtime && chrome.runtime.id); } catch (error) { return false; }
    }

    function watchActivity() {
        new MutationObserver(function (mutations) {
            for (const mutation of mutations) {
                const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
                if (!target || !target.closest || !target.closest('.idsfy-panel') || target.closest('.idsfy-update')) continue;
                lastActivity = Date.now();
                idleSent = false;
                return;
            }
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    function heartbeat() {
        if (!alive()) {
            // Eklenti yeniden başladı: bu betik koptu. Chrome API'si kullanılmadan uyarı şeridi gösterilir.
            clearInterval(timer);
            stale = true;
            render();
            return;
        }
        try {
            if (lastActivity > lastWritten) {
                lastWritten = lastActivity;
                chrome.storage.local.get('idsActivity', function (data) {
                    const map = data && data.idsActivity ? data.idsActivity : {};
                    const now = Date.now();
                    Object.keys(map).forEach(function (key) { if (now - Number(map[key]) > 10 * 60 * 1000) delete map[key]; });
                    map[tabKey] = lastActivity;
                    chrome.storage.local.set({ idsActivity: map });
                });
            }
            if (autoOn && !idleSent && state && state.status === 'downloaded' && Date.now() - lastActivity > IDLE_MS) {
                idleSent = true;
                send({ type: 'ids-update-idle' }).catch(function () {});
            }
        } catch (error) { /* eklenti yeniden başlıyor olabilir */ }
    }

    chrome.storage.local.get('autoInstall', function (data) { autoOn = !(data && data.autoInstall === false); });
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.autoInstall) { autoOn = changes.autoInstall.newValue !== false; render(); }
    });
    watchActivity();
    const timer = setInterval(heartbeat, 5000);
    heartbeat();

    send({ type: 'ids-update-state' }).then(function (reply) {
        state = reply.update || null;
        render();
    }).catch(function () {});
    watchPanels();
})();
