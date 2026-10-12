// =====================================================================
//  Rxalign v3 - sayfalar arası ortak yardımcılar
//  (giriş hatırlama, PIN penceresi, kısa bildirim, etiketler)
// =====================================================================

const RX = (() => {
    const DOCTOR_PASSWORD = '1234';
    const ROLE_KEY = 'rx_v3_doctor_until';
    const DAY = 24 * 60 * 60 * 1000;

    // ---- Hekim doğrulaması: cihazda hatırlama (30 gün) + oturum ----
    function doctorRemembered() {
        try {
            const until = Number(localStorage.getItem(ROLE_KEY) || 0);
            if (until > Date.now()) return true;
            if (sessionStorage.getItem('rx_doctor_ok') === '1') return true;
        } catch (e) { /* depolama kapalı */ }
        return false;
    }

    function rememberDoctor(days) {
        try {
            sessionStorage.setItem('rx_doctor_ok', '1');
            if (days) localStorage.setItem(ROLE_KEY, String(Date.now() + days * DAY));
        } catch (e) { /* yoksay */ }
    }

    function forgetDoctor() {
        try {
            localStorage.removeItem(ROLE_KEY);
            sessionStorage.removeItem('rx_doctor_ok');
        } catch (e) { /* yoksay */ }
    }

    function checkPin(value) {
        return String(value || '').trim() === DOCTOR_PASSWORD;
    }

    // ---- Kısa bildirim ----
    function toast(message, { duration = 2200, action, onAction } = {}) {
        let el = document.getElementById('rxToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rxToast';
            el.className = 'rx-toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.innerHTML = '';
        const text = document.createElement('span');
        text.textContent = message;
        el.appendChild(text);
        if (action && onAction) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = action;
            btn.addEventListener('click', onAction);
            el.appendChild(btn);
        }
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), duration);
    }

    // ---- PIN penceresi (index ve arşiv) ----
    // Döndürdüğü promise doğru PIN'de true, iptalde false verir.
    // grantSession=false: tek seferlik onay (ör. asistanın bir formu düzenlemesi); hekim oturumu açılmaz
    function askPin({ title = 'Hekim doğrulaması', text = 'Devam etmek için 4 haneli hekim PIN kodunu girin.', rememberOption = true, grantSession = true } = {}) {
        return new Promise(resolve => {
            let modal = document.getElementById('rxPinModal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'rxPinModal';
            modal.className = 'rx-modal';
            modal.innerHTML = `
                <div class="rx-modal-card" role="dialog" aria-modal="true" aria-labelledby="rxPinTitle">
                    <h2 id="rxPinTitle" class="rx-modal-title"></h2>
                    <p class="rx-modal-text"></p>
                    <div class="pin-row" id="rxPinRow">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN 1. hane" autocomplete="one-time-code">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN 2. hane">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN 3. hane">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN 4. hane">
                    </div>
                    <p class="rx-modal-error" id="rxPinError" hidden>Hatalı PIN, tekrar deneyin.</p>
                    <label class="check-row" id="rxPinRemember" ${rememberOption ? '' : 'hidden'}><input type="checkbox" checked><span>Bu cihazda 30 gün hatırla</span></label>
                    <div class="rx-modal-actions">
                        <button type="button" class="btn btn-ghost" data-act="cancel">İptal</button>
                        <button type="button" class="btn btn-primary" data-act="ok">Giriş yap</button>
                    </div>
                </div>`;
            modal.querySelector('.rx-modal-title').textContent = title;
            modal.querySelector('.rx-modal-text').textContent = text;
            document.body.appendChild(modal);

            const inputs = [...modal.querySelectorAll('#rxPinRow input')];
            const error = modal.querySelector('#rxPinError');
            const remember = modal.querySelector('#rxPinRemember input');

            const close = result => {
                modal.remove();
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };
            const submit = () => {
                const pin = inputs.map(i => i.value).join('');
                if (checkPin(pin)) {
                    if (grantSession) rememberDoctor(rememberOption && remember.checked ? 30 : 0);
                    close(true);
                } else {
                    error.hidden = false;
                    inputs.forEach(i => { i.value = ''; i.classList.add('error'); });
                    inputs[0].focus();
                }
            };
            const onKey = e => {
                if (e.key === 'Escape') close(false);
            };
            document.addEventListener('keydown', onKey);

            inputs.forEach((input, idx) => {
                input.addEventListener('input', () => {
                    input.classList.remove('error');
                    error.hidden = true;
                    const digits = input.value.replace(/\D/g, '');
                    // Tek seferde birden çok rakam geldiyse (otomatik doldurma) sıradaki kutulara dağıt
                    digits.split('').slice(0, inputs.length - idx).forEach((d, i) => { inputs[idx + i].value = d; });
                    if (!digits) input.value = '';
                    const next = Math.min(idx + Math.max(digits.length, 1), inputs.length - 1);
                    if (digits) inputs[next].focus();
                    if (inputs.every(i => i.value)) submit();
                });
                input.addEventListener('keydown', e => {
                    if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
                    if (e.key === 'Enter') submit();
                });
                input.addEventListener('paste', e => {
                    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
                    if (!digits) return;
                    e.preventDefault();
                    digits.split('').forEach((d, i) => { if (inputs[i]) inputs[i].value = d; });
                    if (digits.length === 4) submit(); else inputs[Math.min(digits.length, 3)].focus();
                });
            });
            modal.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
            modal.querySelector('[data-act="ok"]').addEventListener('click', submit);
            modal.addEventListener('click', e => { if (e.target === modal) close(false); });
            setTimeout(() => inputs[0].focus(), 30);
        });
    }

    // ---- Arayüz ayarları (klinik geneli; Firestore rxalign_settings/ui + yerel kopya) ----
    const UI_CACHE_KEY = 'rx_v3_ui_settings';
    const UI_DEFAULTS = { form_view: 'classic' }; // fabrika: klasik görünüm
    let uiSettings = null;

    function readUiCache() {
        try { return JSON.parse(localStorage.getItem(UI_CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function writeUiCache() {
        try { localStorage.setItem(UI_CACHE_KEY, JSON.stringify(uiSettings || {})); } catch (e) { /* yoksay */ }
    }
    function uiRef() {
        return (typeof db !== 'undefined' && db) ? db.collection('rxalign_settings').doc('ui') : null;
    }
    async function loadUiSettings() {
        uiSettings = { ...UI_DEFAULTS, ...readUiCache() };
        const ref = uiRef();
        if (ref) {
            try {
                const snap = await ref.get();
                if (snap.exists) uiSettings = { ...UI_DEFAULTS, ...(snap.data() || {}) };
                writeUiCache();
            } catch (e) {
                console.warn('Arayüz ayarları buluttan okunamadı, yerel kopya kullanılıyor:', e);
            }
        }
        return uiSettings;
    }
    function getUiSetting(key) {
        const s = uiSettings || { ...UI_DEFAULTS, ...readUiCache() };
        return key in s ? s[key] : UI_DEFAULTS[key];
    }
    async function saveUiSetting(key, value) {
        if (!uiSettings) uiSettings = { ...UI_DEFAULTS, ...readUiCache() };
        uiSettings[key] = value;
        writeUiCache();
        const ref = uiRef();
        if (ref) await ref.set({ [key]: value, updatedAt: Date.now() }, { merge: true });
    }

    // ---- Tema (cihaza özel): 'system' | 'light' | 'dark' ----
    const THEME_KEY = 'rx_v3_theme';
    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function getThemePref() {
        try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
    }
    function applyTheme() {
        const pref = getThemePref();
        const dark = pref === 'dark' || (pref === 'system' && !!darkQuery && darkQuery.matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#111317' : '#F6F5F1');
        document.querySelectorAll('[data-theme-toggle]').forEach(b => {
            b.setAttribute('aria-pressed', String(dark));
            b.setAttribute('aria-label', dark ? 'Gündüz moduna geç' : 'Gece moduna geç');
            b.title = dark ? 'Gündüz modu' : 'Gece modu';
            const label = b.querySelector('.rail-label');
            if (label) label.textContent = dark ? 'Gündüz modu' : 'Gece modu';
        });
        return dark;
    }
    function setThemePref(pref) {
        try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* yoksay */ }
        applyTheme();
        document.dispatchEvent(new CustomEvent('rx-theme', { detail: pref }));
    }
    function toggleTheme() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        setThemePref(dark ? 'light' : 'dark');
    }
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); });
    function bindThemeButtons() {
        document.querySelectorAll('[data-theme-toggle]').forEach(b => {
            if (b.dataset.bound) return;
            b.dataset.bound = '1';
            b.addEventListener('click', toggleTheme);
        });
        applyTheme();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindThemeButtons);
    else bindThemeButtons();

    // ---- Eski tasarıma geçiş: aynı sayfa ve sorgu ile eski/ altındaki kopya ----
    function legacyUrl() {
        const page = location.pathname.split('/').pop() || 'index.html';
        return 'eski/' + page + location.search;
    }
    function bindLegacyLinks() {
        document.querySelectorAll('[data-legacy-link]').forEach(a => { a.href = legacyUrl(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindLegacyLinks);
    else bindLegacyLinks();

    // ---- Etiketler ----
    const FORM_TURU = { yeni_hasta: 'Yeni hasta', yeni_hasta_flex: 'Flex Rx', refinement: 'Refinement' };
    const HASTA_TIPI = { yetiskin: 'Yetişkin', ergen: 'Ergen', cocuk: 'Çocuk' };
    const PAKET = {
        comprehensive: 'Comprehensive', moderate: 'Moderate', lite: 'Lite', express: 'Express',
        first_comprehensive: 'First Comprehensive', vivera_retainer: 'Vivera', palatal_genisletici: 'Palatal genişletici',
        gulumseme_mimarisi: 'Gülümseme Mimarisi'
    };

    // Kayıttaki paket alanı (farklı adlardan biri)
    function packageOf(form) {
        const raw = form.tedavi_secenegi || form.tedavi_secenegi_ergen || form.tedavi_secenegi_cocuk_first ||
            form.tedavi_secenegi_vivera || form.tedavi_secenegi_gulumseme || form.tedavi_secenegi_ergen_vivera ||
            form.tedavi_secenegi_palatal || form.tedavi_secenegi_cocuk_vivera || form.tedavi_secenegi_cocuk_palatal || '';
        if (!raw && form.form_turu === 'refinement') return 'Ek hizalayıcı';
        return PAKET[raw] || raw || '';
    }

    function formatDate(ts) {
        if (!ts) return '';
        const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    return { legacyUrl, doctorRemembered, rememberDoctor, forgetDoctor, checkPin, askPin, toast, loadUiSettings, getUiSetting, saveUiSetting, getThemePref, setThemePref, toggleTheme, FORM_TURU, HASTA_TIPI, PAKET, packageOf, formatDate, escapeHtml };
})();

// Diğer betiklerin window.RX ile erişebilmesi için (üst düzey const window nesnesine bağlanmaz)
window.RX = RX;
