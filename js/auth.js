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
        return auth.signOut().then(function () { location.reload(); });
    }

    auth.onAuthStateChanged(function (user) {
        if (user) {
            if (sawSignedOut) { location.reload(); return; }
            hideGate();
            fillAccount(user);
            resolveReady(user);
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
        signOut: signOut
    };
})();
