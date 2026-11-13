// =====================================================================
//  Rxalign girişi (Firebase Authentication, e-posta/şifre)
//  Firestore kuralları yalnızca giriş yapmış ve rxalign_users listesinde
//  kayıtlı hesaplara izin verir; bu dosya giriş yapılmamışsa sayfanın üstüne
//  giriş penceresini koyar, girişten sonra sayfayı yeniler.
//  Yükleme sırası: firebase-app-compat, firebase-auth-compat, firebase-firestore-compat,
//  firebase-config.js, js/auth.js. app.js'e bağımlı değildir (eski/ sayfalarında da çalışır).
//  Kullanım: [data-rx-account] içine hesap e-postası yazılır, [data-rx-signout] tıklanınca çıkış.
//  window.RxAuth: { ready(), user(), signOut() }
// =====================================================================

(function () {
    'use strict';
    if (typeof firebase === 'undefined' || !firebase.auth) {
        console.warn('Rxalign girişi: firebase-auth-compat yüklenmemiş.');
        return;
    }
    var auth;
    try { auth = firebase.auth(); } catch (e) { console.error('Rxalign girişi başlatılamadı:', e); return; }
    try { auth.languageCode = 'tr'; } catch (e) { /* yoksay */ }

    var GATE_ID = 'rxAuthGate';
    var sawSignedOut = false;
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });

    var MESSAGES = {
        'auth/invalid-email': 'E-posta adresi geçersiz.',
        'auth/user-not-found': 'Bu e-posta ile hesap bulunamadı.',
        'auth/wrong-password': 'Şifre hatalı.',
        'auth/invalid-credential': 'E-posta ya da şifre hatalı.',
        'auth/invalid-login-credentials': 'E-posta ya da şifre hatalı.',
        'auth/user-disabled': 'Bu hesap kapatılmış. Klinik yöneticisine başvurun.',
        'auth/too-many-requests': 'Çok fazla deneme yapıldı; birkaç dakika sonra yeniden deneyin.',
        'auth/network-request-failed': 'Sunucuya ulaşılamadı; internet bağlantısını kontrol edin.',
        'auth/missing-password': 'Şifre boş.',
        'auth/operation-not-allowed': 'E-posta/şifre girişi Firebase konsolunda açılmamış.',
        'auth/configuration-not-found': 'Firebase Authentication bu projede henüz açılmamış (konsol > Authentication > Get started).'
    };
    function describe(error) {
        return (error && MESSAGES[error.code]) || (error && error.message) || 'Giriş yapılamadı.';
    }

    function injectStyle() {
        if (document.getElementById('rxAuthStyle')) return;
        var style = document.createElement('style');
        style.id = 'rxAuthStyle';
        style.textContent = [
            '#rxAuthGate{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;',
            'background:rgba(23,26,33,0.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:var(--font,system-ui,-apple-system,"Segoe UI",sans-serif);}',
            '#rxAuthGate .rx-auth-card{width:100%;max-width:400px;padding:28px;background:var(--surface,#fff);color:var(--text,#2A2F3A);',
            'border-radius:var(--r-panel,18px);box-shadow:0 24px 60px -20px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:14px;box-sizing:border-box;}',
            '#rxAuthGate h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-0.02em;}',
            '#rxAuthGate p{margin:0;font-size:14px;color:var(--muted,#6B7280);line-height:1.5;}',
            '#rxAuthGate label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;}',
            '#rxAuthGate input{width:100%;box-sizing:border-box;height:44px;padding:0 12px;font-size:15px;font-family:inherit;color:inherit;',
            'background:var(--surface,#fff);border:1px solid var(--line,#D9D7D0);border-radius:10px;}',
            '#rxAuthGate input:focus{outline:2px solid var(--accent-from,#E8524C);outline-offset:1px;}',
            '#rxAuthGate .rx-auth-error{font-size:13px;font-weight:600;color:var(--coral-text,#B3261E);min-height:18px;}',
            '#rxAuthGate .rx-auth-info{font-size:13px;font-weight:600;color:var(--ok,#1a7f37);}',
            '#rxAuthGate .rx-auth-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;}',
            '#rxAuthGate button{height:44px;padding:0 18px;border-radius:12px;border:1px solid transparent;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}',
            '#rxAuthGate .rx-auth-submit{background:linear-gradient(180deg,var(--accent-from,#E8524C),var(--accent-to,#D63B36));color:#fff;flex:1;}',
            '#rxAuthGate .rx-auth-submit[disabled]{opacity:0.6;cursor:default;}',
            '#rxAuthGate .rx-auth-link{background:transparent;color:var(--muted,#6B7280);padding:0 6px;font-weight:600;font-size:13px;text-decoration:underline;}',
            '#rxAuthGate .rx-auth-foot{font-size:12px;color:var(--muted,#6B7280);}'
        ].join('');
        document.head.appendChild(style);
    }

    function showGate() {
        injectStyle();
        if (document.getElementById(GATE_ID)) return;
        var gate = document.createElement('div');
        gate.id = GATE_ID;
        gate.innerHTML =
            '<form class="rx-auth-card" role="dialog" aria-modal="true" aria-labelledby="rxAuthTitle" autocomplete="on">' +
            '<h2 id="rxAuthTitle">Rxalign girişi</h2>' +
            '<p>Hasta kayıtlarına ulaşmak için klinik hesabınızla giriş yapın. Oturum bu cihazda açık kalır.</p>' +
            '<div><label for="rxAuthEmail">E-posta</label><input id="rxAuthEmail" name="email" type="email" inputmode="email" autocomplete="username" required></div>' +
            '<div><label for="rxAuthPassword">Şifre</label><input id="rxAuthPassword" name="password" type="password" autocomplete="current-password" required></div>' +
            '<div class="rx-auth-error" id="rxAuthError" role="alert"></div>' +
            '<div class="rx-auth-actions">' +
            '<button type="button" class="rx-auth-link" id="rxAuthReset">Şifremi unuttum</button>' +
            '<button type="submit" class="rx-auth-submit" id="rxAuthSubmit">Giriş yap</button>' +
            '</div>' +
            '<div class="rx-auth-foot">Hesaplar klinik yöneticisi tarafından açılır; kendi kendine kayıt yoktur.</div>' +
            '</form>';
        var attach = function () { (document.body || document.documentElement).appendChild(gate); };
        if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);

        var form = gate.querySelector('form');
        var email = gate.querySelector('#rxAuthEmail');
        var password = gate.querySelector('#rxAuthPassword');
        var error = gate.querySelector('#rxAuthError');
        var submit = gate.querySelector('#rxAuthSubmit');
        var reset = gate.querySelector('#rxAuthReset');
        try { email.value = localStorage.getItem('rx_auth_last_email') || ''; } catch (e) { /* yoksay */ }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            error.className = 'rx-auth-error';
            error.textContent = '';
            submit.disabled = true;
            submit.textContent = 'Giriş yapılıyor…';
            var address = email.value.trim();
            auth.signInWithEmailAndPassword(address, password.value).then(function () {
                try { localStorage.setItem('rx_auth_last_email', address); } catch (err) { /* yoksay */ }
                submit.textContent = 'Açılıyor…';
                // onAuthStateChanged sayfayı yeniler; ilk okumalar giriş olmadan başarısız olduğundan temiz başlangıç gerekir.
            }).catch(function (err) {
                error.textContent = describe(err);
                submit.disabled = false;
                submit.textContent = 'Giriş yap';
                password.focus();
                password.select();
            });
        });

        reset.addEventListener('click', function () {
            var address = email.value.trim();
            error.className = 'rx-auth-error';
            if (!address) {
                error.textContent = 'Önce e-posta adresinizi yazın.';
                email.focus();
                return;
            }
            reset.disabled = true;
            auth.sendPasswordResetEmail(address).then(function () {
                error.className = 'rx-auth-info';
                error.textContent = 'Şifre sıfırlama bağlantısı ' + address + ' adresine gönderildi.';
            }).catch(function (err) {
                error.textContent = describe(err);
            }).then(function () { reset.disabled = false; });
        });

        setTimeout(function () { (email.value ? password : email).focus(); }, 30);
    }

    function hideGate() {
        var gate = document.getElementById(GATE_ID);
        if (gate) gate.remove();
    }

    function fillAccount(user) {
        var apply = function () {
            var nodes = document.querySelectorAll('[data-rx-account]');
            for (var i = 0; i < nodes.length; i++) nodes[i].textContent = user ? (user.email || user.uid) : '';
            var buttons = document.querySelectorAll('[data-rx-signout]');
            for (var j = 0; j < buttons.length; j++) {
                if (buttons[j].dataset.rxBound) continue;
                buttons[j].dataset.rxBound = '1';
                buttons[j].addEventListener('click', function (e) { e.preventDefault(); signOut(); });
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
    }

    function signOut() {
        var tellExtension = extensionSend({ type: 'rx-auth-clear' }).catch(function () { /* eklenti yok */ });
        return tellExtension.then(function () { return auth.signOut(); }).then(function () { location.reload(); });
    }

    // ---- IDS Yardımcısı köprüsü ----
    // Eklenti (manifest externally_connectable) bu siteden ileti kabul eder. Giriş yapılmış oturumun yenileme
    // anahtarı eklentiye aktarılır; böylece eklentiye ayrıca giriş gerekmez. Arşivdeki "IDS'te aç" düğmesi de
    // bu kanaldan geçer. Eklenti yoksa window.chrome.runtime tanımsızdır; sessizce geçilir.
    var EXTENSION_ID = 'bgepiaaakgecaoehcgjakjcoaejcoiip';
    var NO_EXTENSION = 'IDS Yardımcısı bu tarayıcıda bulunamadı. Eklentinin kurulu olduğu Chrome\'da deneyin.';
    // Eklenti bu tarayıcıda yok (ya da yanıt vermiyor): hata nesnesine noExtension işareti konur; openInIds bu durumda
    // rxalign-ids:// bağlantısına düşer.
    function missingError(text) {
        var e = new Error(text || NO_EXTENSION);
        e.noExtension = true;
        return e;
    }

    function extensionSend(message) {
        return new Promise(function (resolve, reject) {
            var rt = window.chrome && window.chrome.runtime;
            if (!rt || typeof rt.sendMessage !== 'function') return reject(missingError());
            try {
                rt.sendMessage(EXTENSION_ID, message, function (reply) {
                    var err = rt.lastError;
                    if (err) {
                        var text = String(err.message || '');
                        return reject(/Receiving end|Could not establish|Invalid extension/i.test(text)
                            ? missingError('IDS Yardımcısı yanıt vermedi; eklentinin kurulu ve en az 0.35.0 sürümünde olması gerekir.')
                            : new Error(text));
                    }
                    if (!reply || !reply.ok) return reject(new Error(reply && reply.error ? reply.error : 'IDS Yardımcısı yanıt vermedi.'));
                    resolve(reply);
                });
            } catch (e) {
                reject(missingError());
            }
        });
    }

    var extensionSynced = false;
    function syncExtension(user) {
        if (extensionSynced || !user || !user.refreshToken) return;
        extensionSynced = true;
        user.getIdToken().then(function (idToken) {
            return extensionSend({
                type: 'rx-auth-set',
                email: user.email || '',
                uid: user.uid,
                refreshToken: user.refreshToken,
                idToken: idToken,
                expiresAt: Date.now() + 50 * 60 * 1000
            });
        }).then(function () {
            console.log('Rxalign oturumu IDS Yardımcısı\'na aktarıldı.');
        }).catch(function (e) {
            if (e && !e.noExtension) console.warn('IDS Yardımcısı oturum aktarımı:', e.message);
        });
    }

    // Arşivdeki "IDS'te aç": yeni hasta kaydı IDS Yeni hasta sayfasını, refinement kaydı hastanın dosyasını
    // (IDS numarası biliniyorsa) ya da hasta listesini açar. Çözülen değer: 'new' | 'file' | 'list' | 'other'.
    // Eklenti bu tarayıcıda yoksa (ör. site Edge'de, eklenti Chrome'da) rxalign-ids:// bağlantısı çağrılır: kurulum
    // dosyasının ya da güncelleyicinin Windows'a kaydettiği bağlantı türü, eklentinin kurulu olduğu tarayıcıyı ids-ac.html
    // köprü sayfasıyla açar ve istek oradan eklentiye gider ('other'). Bağlantı türü kayıtlı değilse hiçbir şey olmaz.
    function idsProtocolUrl(form, kind) {
        var q = function (v) { return encodeURIComponent(String(v || '').slice(0, 80)); };
        return 'rxalign-ids://open?k=' + kind + '&id=' + q(form.id) + '&a=' + q(form.hasta_adi) + '&s=' + q(form.hasta_soyadi) +
            '&m=' + q(form.hasta_mi) + '&t=' + q(form.form_turu);
    }

    function openInIds(form) {
        var kind = form && form.form_turu === 'refinement' ? 'refinement' : 'new';
        return extensionSend({
            type: 'rx-open',
            kind: kind,
            record: {
                id: form.id,
                hasta_adi: form.hasta_adi || '',
                hasta_soyadi: form.hasta_soyadi || '',
                hasta_mi: form.hasta_mi || '',
                form_turu: form.form_turu || ''
            }
        }).then(function (reply) { return reply.opened; }, function (error) {
            if (!error || !error.noExtension) throw error;
            window.location.assign(idsProtocolUrl(form, kind));
            return 'other';
        });
    }

    auth.onAuthStateChanged(function (user) {
        if (user) {
            if (sawSignedOut) { location.reload(); return; }
            hideGate();
            fillAccount(user);
            resolveReady(user);
            syncExtension(user);
        } else {
            sawSignedOut = true;
            showGate();
        }
    }, function (err) {
        console.error('Rxalign girişi durumu okunamadı:', err);
        showGate();
    });

    window.RxAuth = {
        ready: function () { return ready; },
        user: function () { return auth.currentUser; },
        signOut: signOut,
        openInIds: openInIds,
        idsProtocolUrl: idsProtocolUrl,
        extensionSend: extensionSend
    };
})();
