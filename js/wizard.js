// =====================================================================
//  Rxalign v3 - form sihirbazı kabuğu
//  ../script.js'in form mantığına dokunmaz; bölümleri adımlara ayırır,
//  tedavi detaylarını akordeona çevirir, özet adımını üretir, taslağı
//  cihazda saklar ve "Klasik görünüm" anahtarını yönetir.
//  Bölümler: 1 durum  2 adımlar  3 akordeon  4 özet  5 taslak  6 kabuk olayları  7 başlangıç
// =====================================================================
(function () {
    'use strict';

    // ---------------------------------------------------------------------
    // 1. Durum ve yardımcılar
    // ---------------------------------------------------------------------
    const params = new URLSearchParams(window.location.search);
    const MODE = params.has('view') ? (params.get('edit') === 'true' ? 'edit' : 'view')
        : params.has('defaults') ? 'defaults' : 'new';
    const ROLE = params.get('role') || 'doctor';
    const DRAFT_KEY = 'rx_v3_draft';
    const CLASSIC_SESSION_KEY = 'rx_v3_classic_session'; // formdaki anahtar: yalnızca bu oturum için
    const DESKTOP = window.matchMedia('(min-width: 768px)');

    const body = document.body;
    const main = document.getElementById('formContent');
    const $ = id => document.getElementById(id);

    const STEP_META = {
        1: { title: 'Hasta', desc: 'Hastanın adı, soyadı ve iki harfli kısaltması (MI).', sub: 'Hasta bilgilerini girin' },
        2: { title: 'Form ve hasta tipi', desc: 'Form türünü ve hastanın yaş grubunu seçin.', sub: 'Form türü ve hasta tipi' },
        3: { title: 'Ürün ve paket', desc: 'Fiyatlar IDS listesidir; karşılaştırma içindir, forma yazılmaz.', sub: 'Ürün ve paket seçimi' },
        4: { title: 'Tedavi detayları', desc: 'Tüm gruplar klinik varsayılanlarınızla dolu. Yalnızca değiştirmek istediklerinizi açın; kapalı satırda seçili değer görünür.', sub: 'Tedavi detayları' },
        5: { title: 'Özet ve kaydet', desc: 'Kaydetmeden önce son kontrol. Varsayılandan farklı tercihler üstte listelenir; asistan IDS\'e girerken aynı özeti görür.', sub: 'Özet ve kaydet' }
    };

    let currentStep = 1;
    const sections = [...main.querySelectorAll(':scope > section.form-section')];

    function stepOf(section) {
        if (section.id === 'hasta_bilgileri_section') return 1;
        if (section.id === 'form_turu_section' || section.id === 'hasta_tipi_section') return 2;
        if (section.classList.contains('product-section') || section.classList.contains('treatment-section')) return 3;
        return 4;
    }
    sections.forEach(s => { s.dataset.step = String(stepOf(s)); });

    function inlineVisible(el) { return !!el && el.style.display !== 'none'; }
    function sectionsOf(step) { return sections.filter(s => s.dataset.step === String(step)); }
    // Adımlar her zaman görünür; yalnızca Refinement'ta ürün/paket adımı atlanır
    function stepAvailable(step) {
        if (step === 3) return main.querySelector('input[name="form_turu"]:checked')?.value !== 'refinement';
        return true;
    }
    function activeDetailSection() {
        return sectionsOf(4).find(inlineVisible) || null;
    }
    function checkedLabel(name) {
        const r = main.querySelector(`input[name="${name}"]:checked`);
        if (!r) return '';
        const card = r.closest('.option-card, .treatment-card');
        if (card) return (card.querySelector('h3')?.textContent || '').trim();
        return (r.closest('label')?.textContent || '').trim();
    }
    function shortPackage(text) {
        return text.replace(/\s*(Package|Paketi|Paket)\s*$/i, '').trim();
    }
    function patientText() {
        const ad = (main.querySelector('input[name="hasta_adi"]')?.value || '').trim();
        const soyad = (main.querySelector('input[name="hasta_soyadi"]')?.value || '').trim();
        const mi = (main.querySelector('input[name="hasta_mi"]')?.value || '').trim();
        if (!ad && !soyad) return '';
        return `${soyad}${soyad && ad ? ', ' : ''}${ad}${mi ? ' · ' + mi.toUpperCase() : ''}`;
    }
    function toast(msg, opts) {
        if (window.RX && RX.toast) RX.toast(msg, opts); else if (typeof showToast === 'function') showToast(msg);
    }

    // ---------------------------------------------------------------------
    // 2. Adımlar
    //    Adım 1–3 tek sayfada: yukarıdan aşağı doldurdukça sonraki bölüm
    //    kendiliğinden açılır. Paket seçilince (Refinement'ta hasta tipi
    //    seçilince) tedavi detaylarına kendiliğinden geçilir. 4 ve 5 ayrı sayfa.
    // ---------------------------------------------------------------------
    let view = 'intro';            // 'intro' | '4' | '5' | 'all'
    let lastVisible = new Set();
    let advanceTimer = null;

    function stepperItems() { return [...document.querySelectorAll('#stepper li[data-step]')]; }
    function picked(name) { return main.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
    function nameComplete() {
        const ad = (main.querySelector('input[name="hasta_adi"]')?.value || '').trim();
        const soyad = (main.querySelector('input[name="hasta_soyadi"]')?.value || '').trim();
        return !!(ad && soyad);
    }
    // Ne kadar ilerlenebilir: 1 hasta, 2 form/hasta tipi, 3 ürün/paket, 4 detaylar hazır
    function computeReach() {
        if (!nameComplete()) return 1;
        if (!picked('form_turu') || !picked('hasta_tipi')) return 2;
        if (picked('form_turu') === 'refinement') return activeDetailSection() ? 4 : 2;
        return activeDetailSection() ? 4 : 3;
    }
    function introReach() { return Math.min(computeReach(), stepAvailable(3) ? 3 : 2); }
    function visibleSet() {
        return new Set(sections.filter(s => s.offsetParent !== null || (inlineVisible(s) && getComputedStyle(s).display !== 'none')).map(s => s.id).filter(Boolean));
    }

    function detailTitle() {
        const detail = activeDetailSection();
        return detail?.id === 'refinement_form_section' ? 'Ek hizalayıcılar'
            : detail?.id === 'flex_form_section' ? 'Flex Rx reçetesi' : 'Tedavi detayları';
    }

    function renderStepper() {
        const reach = computeReach();
        const maxStep = reach >= 4 ? (currentStep >= 4 ? 5 : 4) : reach;
        const items = stepperItems();
        items.forEach(li => {
            const n = Number(li.dataset.step);
            const available = stepAvailable(n);
            li.classList.toggle('skipped', !available);
            li.classList.toggle('active', n === currentStep);
            li.classList.toggle('done', available && n < currentStep);
            li.querySelector('.step-btn').disabled = !(available && n !== currentStep && n <= maxStep);
            li.querySelector('.step-sub').textContent = stepSubtitle(n);
        });
        const avail = [1, 2, 3, 4, 5].filter(stepAvailable);
        const idx = Math.max(0, avail.indexOf(currentStep));
        const bar = $('stepperBar');
        if (bar) bar.style.width = `${Math.round(((idx + 1) / avail.length) * 100)}%`;
        const li4 = items.find(li => li.dataset.step === '4');
        if (li4) li4.querySelector('.step-title').textContent = detailTitle();
    }

    function stepSubtitle(n) {
        if (n > currentStep) return '';
        if (n === currentStep) return n === 4 ? changedSummaryText() : 'Şimdi';
        switch (n) {
            case 1: return patientText();
            case 2: return [checkedLabel('form_turu'), checkedLabel('hasta_tipi')].filter(Boolean).join(' · ');
            case 3: return packageText();
            case 4: return changedSummaryText();
        }
        return '';
    }

    function packageText() {
        const ht = picked('hasta_tipi');
        if (!ht) return '';
        const urun = checkedLabel('urun_tipi_' + ht);
        const treat = sectionsOf(3).find(s => s.classList.contains('treatment-section') && inlineVisible(s));
        const pkg = treat ? (treat.querySelector('input[type="radio"]:checked')?.closest('.treatment-card, .option-card')?.querySelector('h3')?.textContent || '') : '';
        return [shortPackage(pkg), urun.replace(/^Invisalign\s+/i, '')].filter(Boolean).join(' · ');
    }

    function changedSummaryText() {
        const detail = activeDetailSection();
        if (!detail) return '';
        const groups = accordionsOf(detail);
        const changed = groups.filter(g => g.classList.contains('changed')).length;
        if (!groups.length) return '';
        return changed ? `${changed} grup değiştirildi` : 'Tümü varsayılan';
    }

    function renderHeader() {
        const header = $('stepHeader');
        const sub = $('appbarSub');
        if (!header || view === 'all') return;
        header.hidden = false;
        $('stepEyebrow').textContent = `Adım ${currentStep} / 5`;
        if (view === 'intro') {
            const refinement = picked('form_turu') === 'refinement';
            $('stepTitle').textContent = refinement ? 'Hasta ve form' : 'Hasta, form ve paket';
            $('stepDesc').textContent = refinement
                ? 'Yukarıdan aşağı doldurun; her bölüm tamamlanınca sonraki kendiliğinden açılır. Hasta tipini seçince ek hizalayıcı formuna geçilir.'
                : 'Yukarıdan aşağı doldurun; her bölüm tamamlanınca sonraki kendiliğinden açılır. Paketi seçince tedavi detaylarına geçilir.';
        } else {
            const meta = STEP_META[currentStep];
            $('stepTitle').textContent = currentStep === 4 ? detailTitle() : meta.title;
            $('stepDesc').textContent = meta.desc;
        }
        if (sub) sub.textContent = STEP_META[currentStep]?.sub || '';
    }

    // Görünümü uygula (bölüm görünürlüğü CSS'te: main[data-view][data-reach])
    function applyView() {
        main.dataset.view = view;
        body.dataset.view = view;
        if (view === 'intro') {
            const reach = introReach();
            main.dataset.reach = String(reach);
            currentStep = reach;
        } else if (view !== 'all') {
            currentStep = Number(view);
        }
        body.dataset.step = view === 'all' ? 'all' : String(currentStep);
        renderHeader();
        renderStepper();
        updateActionBar();
    }

    function scrollToSection(step) {
        const target = step <= 1 ? null : sectionsOf(step).filter(inlineVisible).pop();
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goTo(step, { scroll = true } = {}) {
        clearTimeout(advanceTimer);
        if (step <= 3) {
            view = 'intro';
            applyView();
            if (scroll) {
                const s = Math.min(step, introReach());
                if (s <= 1) window.scrollTo({ top: 0, behavior: 'smooth' });
                else (sectionsOf(s).filter(inlineVisible)[0])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            view = String(step);
            if (step === 4) refreshAccordions();
            if (step === 5) buildSummary();
            applyView();
            if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        lastVisible = visibleSet();
        saveDraft();
    }

    // Adım 1–3'te her değişiklikten sonra (script.js görünürlüğü güncelledikten sonra) çağrılır
    function onIntroChange(e) {
        if (MODE !== 'new' || view !== 'intro') return;
        const before = lastVisible;
        applyView();
        const now = visibleSet();
        lastVisible = now;
        const fresh = sections.filter(s => s.id && now.has(s.id) && !before.has(s.id) && Number(s.dataset.step) <= 3);
        fresh.forEach(s => { s.classList.remove('reveal'); void s.offsetWidth; s.classList.add('reveal'); });

        const t = e.target;
        const isChoice = e.type === 'change' && t instanceof HTMLInputElement && t.type === 'radio';
        if (!isChoice) return; // yazarken sayfa kaymaz
        if (fresh.length) {
            setTimeout(() => fresh[0].scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        }
        // Son seçim yapıldıysa tedavi detaylarına kendiliğinden geç
        const decisive = t.closest('.treatment-section') || (t.name === 'hasta_tipi' && picked('form_turu') === 'refinement') ||
            (t.name === 'form_turu' && t.value === 'refinement');
        if (computeReach() >= 4 && decisive) {
            clearTimeout(advanceTimer);
            advanceTimer = setTimeout(() => {
                if (view === 'intro' && computeReach() >= 4) {
                    goTo(4);
                    toast(`${detailTitle()} açıldı`);
                }
            }, 550);
        }
    }

    function validateStep(step) {
        if (step === 1) {
            const ad = main.querySelector('input[name="hasta_adi"]');
            const soyad = main.querySelector('input[name="hasta_soyadi"]');
            let ok = true;
            [ad, soyad].forEach(i => {
                const bad = !i.value.trim();
                i.classList.toggle('invalid', bad);
                if (bad && ok) { ok = false; i.focus(); }
            });
            if (!ok) toast('Hasta adı ve soyadı gerekli');
            return ok;
        }
        if (step === 2) {
            if (!picked('form_turu')) { toast('Form türünü seçin'); $('form_turu_section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false; }
            if (!picked('hasta_tipi')) { toast('Hasta tipini seçin'); $('hasta_tipi_section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false; }
            return true;
        }
        if (step === 3) {
            if (!activeDetailSection()) {
                toast(picked('urun_tipi_' + picked('hasta_tipi')) ? 'Paketi seçin' : 'Ürün tipini seçin');
                scrollToSection(3);
                return false;
            }
            return true;
        }
        return true;
    }

    function nextStep() {
        if (view === 'intro') {
            for (const n of [1, 2, 3]) {
                if (stepAvailable(n) && !validateStep(n)) { applyView(); return; }
            }
            if (!activeDetailSection()) { toast('Ürün ve paketi seçin'); return; }
            goTo(4);
            return;
        }
        if (view === '4') goTo(5);
    }
    function prevStep() {
        if (view === '5') goTo(4);
        else if (view === '4') goTo(stepAvailable(3) ? 3 : 2);
    }

    function updateActionBar() {
        const status = $('actionStatus');
        const next = $('wizardNext');
        if (!status || !next) return;
        let label = 'Devam';
        if (view === 'intro') label = computeReach() >= 4 ? `Devam: ${detailTitle()}` : 'Devam';
        else if (view === '4') label = 'Devam: Özet';
        next.querySelector('span').textContent = label;
        if (view === 'intro') status.textContent = packageText() ? `${packageText()} seçildi` : 'Bölüm tamamlandıkça sonraki kendiliğinden açılır';
        else if (view === '4') status.textContent = changedSummaryText();
        else if (view === '5') status.textContent = 'Kaydedince form arşivde "Bekliyor" olarak görünür';
        else status.textContent = '';
    }

    function updateChips() {
        const p = $('patientChip');
        const k = $('packageChip');
        const pt = patientText();
        if (p) { p.textContent = pt; p.hidden = !pt; }
        const pk = packageText();
        if (k) { k.textContent = pk; k.hidden = !pk; }
    }

    // ---------------------------------------------------------------------
    // 3. Akordeon
    // ---------------------------------------------------------------------
    const CHEVRON = '<svg class="acc-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

    function groupsIn(section) {
        if (section.id === 'refinement_form_section') {
            return [...section.querySelectorAll('.refinement-container > .form-group')];
        }
        return [...section.querySelectorAll(':scope > .form-subsection')];
    }
    function accordionsOf(section) { return [...section.querySelectorAll(':scope .acc')]; }

    function buildAccordion(group, index) {
        if (group.classList.contains('acc')) return;
        let h3 = group.querySelector(':scope > h3');
        const firstHeading = group.querySelector('h3');
        if (!h3 && firstHeading && firstHeading.parentElement === group) h3 = firstHeading;
        let titleHtml = '';
        let num = '';
        if (h3) {
            const clone = h3.cloneNode(true);
            clone.querySelectorAll('a').forEach(a => a.remove());
            const raw = clone.innerHTML.trim();
            const m = raw.match(/^(\d+)\.\s*/);
            if (m) num = m[1];
            titleHtml = raw.replace(/^(\d+)\.\s*/, '');
            if (h3.parentElement === group) h3.remove();
        } else {
            titleHtml = group.id === 'erupsiyon_refinement_section' ? 'Erupsiyon kompansasyonu' : 'Ölçü ve iTero bilgileri';
        }
        if (!num) num = '•';

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'acc-head';
        head.setAttribute('aria-expanded', 'false');
        head.innerHTML = `<span class="acc-num">${num}</span><span class="acc-main"><span class="acc-title">${titleHtml}</span><span class="acc-sum"></span></span><span class="acc-badge pill pill-default">Varsayılan</span>${CHEVRON}`;

        const bodyEl = document.createElement('div');
        bodyEl.className = 'acc-body';
        while (group.firstChild) bodyEl.appendChild(group.firstChild);
        group.appendChild(head);
        group.appendChild(bodyEl);
        group.classList.add('acc');
        group.dataset.num = num;

        head.addEventListener('click', () => {
            if (body.classList.contains('classic')) return;
            toggleGroup(group);
        });
    }

    function toggleGroup(group, open) {
        const willOpen = open === undefined ? !group.classList.contains('open') : open;
        group.classList.toggle('open', willOpen);
        group.querySelector('.acc-head').setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
            // Textarea yükseklikleri açılınca hesaplanır
            group.querySelectorAll('textarea').forEach(t => { if (t._adjustHeight) t._adjustHeight(); });
        }
    }

    function buildAllAccordions() {
        sectionsOf(4).forEach(section => groupsIn(section).forEach((g, i) => buildAccordion(g, i)));
        tagTeethRows();
    }

    // Telefonda çeyrek başlıkları için: her ızgaranın ilk iki daimi satırı üst/alt çene
    function tagTeethRows(root = main) {
        root.querySelectorAll('.teeth-grid, .tooth-grid, .dis-cekimi-grid').forEach(grid => {
            const rows = [...grid.querySelectorAll(':scope > .teeth-row:not(.teeth-row-primary), :scope > .tooth-row, :scope > div > .teeth-row:not(.teeth-row-primary)')];
            rows.slice(0, 2).forEach((row, i) => { row.dataset.arch = i === 0 ? 'ust' : 'alt'; });
        });
    }

    // Tablo içindeki radyo: "Satır etiketi: değer" (A-P tablosunda sütun başlığı da)
    function tableLabel(input) {
        const td = input.closest('td');
        const tr = input.closest('tr');
        if (!td || !tr) return null;
        const rowLabel = (tr.querySelector('td')?.textContent || '').replace(/\s+/g, ' ').trim().replace(/\(.*?\)/g, '').trim();
        const table = input.closest('table');
        const headers = table ? [...table.querySelectorAll('thead th')] : [];
        const colIdx = [...tr.children].indexOf(td);
        const col = headers[colIdx] ? headers[colIdx].textContent.trim() : '';
        const label = input.closest('label');
        const value = label ? (label.querySelector('span')?.textContent || label.textContent).replace(/\s+/g, ' ').trim() : rowLabel;
        if (col) return { key: col, value: rowLabel || value };
        return { key: rowLabel, value };
    }

    // Görünür ve aktif alanların seçili değerlerinden özet metni
    function summarize(bodyEl) {
        const parts = [];
        const teeth = [];
        const seen = new Set();
        const tableRows = [];
        bodyEl.querySelectorAll('input, select, textarea').forEach(input => {
            if (input.disabled || !input.name) return;
            if (typeof isHiddenInline === 'function' && isHiddenInline(input, bodyEl)) return;
            if (input.type === 'radio' || input.type === 'checkbox') {
                if (!input.checked) return;
                const isTooth = !!input.closest('.teeth-numbers, .tooth-checkbox, .tooth-numbers');
                if (isTooth) {
                    const label = input.closest('label');
                    teeth.push((label?.querySelector('span')?.textContent || input.value).trim());
                    return;
                }
                const tl = tableLabel(input);
                if (tl) { tableRows.push(tl); return; }
                const label = input.closest('label');
                const text = (label ? (label.querySelector('span')?.textContent || label.textContent) : input.value).replace(/\s+/g, ' ').trim();
                if (/tümünü seç/i.test(text)) return;
                if (text && !seen.has(text)) { seen.add(text); parts.push(text); }
            } else if (input.tagName === 'SELECT') {
                const t = input.options[input.selectedIndex]?.text?.trim();
                if (t && input.selectedIndex > 0) parts.push(t);
            } else if (input.value.trim()) {
                const v = input.value.trim().replace(/\s+/g, ' ');
                parts.push(v.length > 70 ? v.slice(0, 70) + '…' : v);
            }
        });
        if (tableRows.length) {
            const values = new Set(tableRows.map(r => r.value));
            if (values.size === 1 && tableRows.length > 1) parts.unshift(`Tümü: ${tableRows[0].value}`);
            else tableRows.forEach(r => parts.push(`${r.key}: ${r.value}`));
        }
        if (teeth.length) parts.push('Dişler: ' + teeth.join(', '));
        let text = parts.join(' · ');
        if (text.length > 140) text = text.slice(0, 140) + '…';
        return text || '—';
    }

    // Varsayılandan (kayıtlı varsayılan ya da fabrika) farklı alan var mı?
    function isChanged(bodyEl, section) {
        let data = null;
        try {
            const key = (typeof defaultsKeyFor === 'function') ? defaultsKeyFor(section) : null;
            data = (key && typeof getFormDefault === 'function') ? getFormDefault(key) : null;
        } catch (e) { data = null; }
        const skip = (typeof DEFAULTS_SKIP !== 'undefined') ? DEFAULTS_SKIP : /^(hasta_adi|hasta_soyadi|hasta_mi)$/;
        const inputs = bodyEl.querySelectorAll('input[name], select[name], textarea[name]');
        for (const input of inputs) {
            if (input.disabled || skip.test(input.name)) continue;
            const name = input.name;
            const hasDefault = data && Object.prototype.hasOwnProperty.call(data, name);
            if (input.type === 'checkbox') {
                const expected = hasDefault ? (Array.isArray(data[name]) && data[name].includes(input.value)) : input.defaultChecked;
                if (input.checked !== expected) return true;
            } else if (input.type === 'radio') {
                const expected = hasDefault ? data[name] === input.value : input.defaultChecked;
                if (input.checked !== expected) return true;
            } else if (input.tagName === 'SELECT') {
                const expected = hasDefault ? String(data[name] ?? '') : ([...input.options].find(o => o.defaultSelected)?.value ?? input.options[0]?.value ?? '');
                if ((input.value || '') !== expected) return true;
            } else {
                const expected = hasDefault ? String(data[name] ?? '') : (input.defaultValue || '');
                if ((input.value || '').trim() !== expected.trim()) return true;
            }
        }
        return false;
    }

    function refreshAccordions() {
        const section = activeDetailSection();
        if (!section) return;
        let changed = 0;
        accordionsOf(section).forEach(group => {
            const bodyEl = group.querySelector('.acc-body');
            const sum = group.querySelector('.acc-sum');
            const badge = group.querySelector('.acc-badge');
            const isDiff = isChanged(bodyEl, section);
            group.classList.toggle('changed', isDiff);
            if (isDiff) changed++;
            sum.textContent = summarize(bodyEl);
            badge.textContent = isDiff ? 'Değiştirildi' : 'Varsayılan';
            badge.className = 'acc-badge pill ' + (isDiff ? 'pill-changed' : 'pill-default');
        });
        const total = accordionsOf(section).length;
        const allBtn = $('filterAll');
        const chBtn = $('filterChanged');
        if (allBtn) allBtn.innerHTML = `Tüm gruplar <span class="n">${total}</span>`;
        if (chBtn) chBtn.innerHTML = `Değiştirilenler <span class="n" style="color:${changed ? 'var(--coral-deep)' : ''}">${changed}</span>`;
        const note = $('accEmptyNote');
        if (note) note.hidden = !(main.dataset.filter === 'changed' && changed === 0);
    }

    function buildToolbar() {
        const bar = document.createElement('div');
        bar.className = 'step-toolbar';
        bar.id = 'detayToolbar';
        bar.innerHTML = `
            <div class="seg group-filter" role="group" aria-label="Grup filtresi">
                <button type="button" id="filterAll" aria-pressed="true">Tüm gruplar</button>
                <button type="button" id="filterChanged" aria-pressed="false">Değiştirilenler</button>
            </div>
            <div class="step-toolbar-right">
                <button type="button" class="btn btn-ghost btn-sm" id="expandAll">Tümünü aç</button>
                <label class="switch classic-switch" id="classicSwitch"><input type="checkbox" id="classicToggle"><span class="switch-label">Klasik görünüm</span><span class="switch-track" aria-hidden="true"></span></label>
            </div>
            <p class="acc-empty-note" id="accEmptyNote" hidden>Varsayılandan farklı grup yok.</p>`;
        // Form alanının (main) dışında: görüntüleme modunda script.js oradaki onay kutularını kilitler
        main.parentNode.insertBefore(bar, main);

        $('filterAll').addEventListener('click', () => setFilter('all'));
        $('filterChanged').addEventListener('click', () => setFilter('changed'));
        $('expandAll').addEventListener('click', () => {
            const section = activeDetailSection();
            if (!section) return;
            const groups = accordionsOf(section);
            const anyClosed = groups.some(g => !g.classList.contains('open'));
            groups.forEach(g => toggleGroup(g, anyClosed));
            $('expandAll').textContent = anyClosed ? 'Tümünü daralt' : 'Tümünü aç';
        });
        const toggle = $('classicToggle');
        toggle.addEventListener('change', () => setClassic(toggle.checked, true));
    }

    function setFilter(mode) {
        main.dataset.filter = mode;
        $('filterAll').setAttribute('aria-pressed', String(mode === 'all'));
        $('filterChanged').setAttribute('aria-pressed', String(mode === 'changed'));
        refreshAccordions();
    }

    function setClassic(on, persist) {
        const allowed = DESKTOP.matches;
        const value = on && allowed;
        body.classList.toggle('classic', value);
        const toggle = $('classicToggle');
        if (toggle) toggle.checked = value;
        if (persist) { try { sessionStorage.setItem(CLASSIC_SESSION_KEY, on ? '1' : '0'); } catch (e) { /* yoksay */ } }
        if (value) {
            document.querySelectorAll('.acc textarea').forEach(t => { if (t._adjustHeight) t._adjustHeight(); });
        }
    }
    // Başlangıç: bu oturumda anahtar kullanıldıysa o; yoksa Ayarlar'daki varsayılan (fabrika: klasik)
    function restoreClassic() {
        let session = null;
        try { session = sessionStorage.getItem(CLASSIC_SESSION_KEY); } catch (e) { /* yoksay */ }
        if (session !== null) { setClassic(session === '1', false); return; }
        const view = (window.RX && RX.getUiSetting) ? RX.getUiSetting('form_view') : 'classic';
        setClassic(view !== 'modern', false);
    }
    DESKTOP.addEventListener('change', () => restoreClassic());

    // Özetten gelen "Düzenle": gruba git ve aç
    function openGroup(group) {
        goTo(4, { scroll: false });
        setFilter('all');
        toggleGroup(group, true);
        setTimeout(() => group.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }

    // ---------------------------------------------------------------------
    // 4. Özet adımı
    // ---------------------------------------------------------------------
    function buildSummary() {
        let box = $('wizardSummary');
        if (!box) {
            box = document.createElement('section');
            box.id = 'wizardSummary';
            box.dataset.step = '5';
            main.appendChild(box);
        }
        refreshAccordions();
        const esc = s => (window.RX ? RX.escapeHtml(s) : String(s));
        const ft = checkedLabel('form_turu');
        const ht = checkedLabel('hasta_tipi');
        const htVal = main.querySelector('input[name="hasta_tipi"]:checked')?.value;
        const urun = htVal ? checkedLabel('urun_tipi_' + htVal) : '';
        const treat = sectionsOf(3).find(s => s.classList.contains('treatment-section') && inlineVisible(s));
        const pkgCard = treat?.querySelector('input[type="radio"]:checked')?.closest('.treatment-card, .option-card');
        const pkg = pkgCard ? shortPackage(pkgCard.querySelector('h3')?.textContent || '') : '';
        const detail = activeDetailSection();
        const groups = detail ? accordionsOf(detail) : [];
        const changed = groups.filter(g => g.classList.contains('changed'));
        const unchanged = groups.filter(g => !g.classList.contains('changed'));
        const titleOf = g => {
            const t = g.querySelector('.acc-title');
            if (!t) return '';
            const clone = t.cloneNode(true);
            clone.querySelectorAll('span, a, small').forEach(el => el.remove());
            return clone.textContent.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
        };

        const rows = changed.map((g, i) => {
            const ta = g.querySelector('textarea');
            const isText = ta && ta.value.trim() && !g.querySelector('input:checked');
            const value = isText ? ta.value.trim() : summarize(g.querySelector('.acc-body'));
            return `<div class="sum-row"><span class="sum-row-title">${esc(g.dataset.num)} · ${esc(titleOf(g))}</span><span class="sum-row-value${isText ? ' quote' : ''}">${esc(value)}</span><button type="button" class="link-btn" data-open="${i}">Düzenle</button></div>`;
        }).join('');

        box.innerHTML = `
            <div class="sum-card">
                <div class="sum-card-head"><h3>Hasta ve form</h3><span class="spacer"></span><button type="button" class="link-btn" data-goto="1">Düzenle</button></div>
                <dl class="sum-grid">
                    <div><dt>Hasta</dt><dd>${esc(patientText() || '—')}</dd></div>
                    <div><dt>Form türü</dt><dd>${esc(ft || '—')}</dd></div>
                    <div><dt>Hasta tipi</dt><dd>${esc(ht || '—')}</dd></div>
                    ${urun ? `<div><dt>Ürün</dt><dd>${esc(urun)}</dd></div>` : ''}
                    ${pkg ? `<div><dt>Paket</dt><dd>${esc(pkg)}</dd></div>` : ''}
                </dl>
            </div>
            <div class="sum-card changed-card">
                <div class="sum-card-head"><span class="sum-dot"></span><h3>Varsayılandan farklı tercihler</h3><span class="pill ${changed.length ? 'pill-count' : 'pill-count-muted'}">${changed.length}</span><span class="spacer"></span><button type="button" class="link-btn" data-goto="4">Tümünü gör</button></div>
                ${changed.length ? `<div class="sum-rows">${rows}</div>` : '<p class="sum-empty">Tüm gruplar varsayılan değerlerde. IDS\'e girerken ek dikkat gerektiren tercih yok.</p>'}
            </div>
            <div class="sum-card">
                <div class="sum-card-head"><h3>Varsayılan kalan gruplar</h3><span class="pill pill-count-muted">${unchanged.length}</span></div>
                <p class="sum-muted">${unchanged.length ? esc(unchanged.map(titleOf).join(', ')) : 'Yok'}</p>
            </div>`;

        box.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => goTo(Number(b.dataset.goto))));
        box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openGroup(changed[Number(b.dataset.open)])));
    }

    // ---------------------------------------------------------------------
    // 5. Taslak (cihazda, yalnızca yeni form)
    // ---------------------------------------------------------------------
    let draftTimer = null;
    let draftRestoring = false;
    let userTouched = false; // kullanıcı forma dokunmadan kayıtlı taslak silinmez

    function serializeAll() {
        const data = {};
        main.querySelectorAll('input[name], select[name], textarea[name]').forEach(input => {
            const name = input.name;
            if (input.type === 'checkbox') {
                if (!Array.isArray(data[name])) data[name] = [];
                if (input.checked) data[name].push(input.value);
            } else if (input.type === 'radio') {
                if (!(name in data)) data[name] = '';
                if (input.checked) data[name] = input.value;
            } else {
                data[name] = input.value;
            }
        });
        return data;
    }

    function hasContent(data) {
        return Object.keys(data).some(k => {
            const v = data[k];
            const el = main.querySelector(`[name="${k}"]`);
            if (!el) return false;
            if (el.type === 'radio') return v && !(main.querySelector(`[name="${k}"][value="${v}"]`)?.defaultChecked);
            if (el.type === 'checkbox') return Array.isArray(v) && v.some(val => !main.querySelector(`[name="${k}"][value="${val}"]`)?.defaultChecked);
            return (v || '').trim() !== (el.defaultValue || '').trim();
        });
    }

    function saveDraft() {
        if (MODE !== 'new' || draftRestoring || !userTouched) return;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
            const data = serializeAll();
            const status = $('draftStatus');
            if (!hasContent(data)) {
                try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* yoksay */ }
                if (status) status.hidden = true;
                return;
            }
            const payload = { savedAt: Date.now(), step: currentStep, patient: patientText(), data };
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
                if (status) {
                    status.hidden = false;
                    status.querySelector('.draft-status-text').textContent = 'Taslak kaydedildi · ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                }
            } catch (e) { /* depolama dolu/kapalı */ }
        }, 400);
    }

    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* yoksay */ }
        const status = $('draftStatus');
        if (status) status.hidden = true;
    }

    function readDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            return d && d.data ? d : null;
        } catch (e) { return null; }
    }

    function restoreDraft(draft) {
        draftRestoring = true;
        const data = draft.data;
        Object.keys(data).forEach(name => {
            const value = data[name];
            main.querySelectorAll(`[name="${name}"]`).forEach(input => {
                if (input.type === 'checkbox') input.checked = Array.isArray(value) && value.includes(input.value);
                else if (input.type === 'radio') input.checked = input.value === value;
                else input.value = value == null ? '' : value;
            });
        });
        // Taslaktan dolan bölümlere varsayılanlar yeniden uygulanmasın
        sectionsOf(4).forEach(s => { s.dataset.dirty = '1'; });
        if (typeof updateCardSelection === 'function') updateCardSelection();
        if (typeof updateVisibilityChain === 'function') updateVisibilityChain();
        draftRestoring = false;
        userTouched = true;
        updateChips();
        let step = Math.min(Math.max(Number(draft.step) || 1, 1), 5);
        if (step >= 4 && !activeDetailSection()) step = 3;
        goTo(step <= 3 ? Math.min(step, introReach()) : step);
        toast('Taslak geri yüklendi');
    }

    function offerDraft() {
        const draft = readDraft();
        const banner = $('draftBanner');
        if (!draft || !banner) return;
        const when = new Date(draft.savedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        $('draftBannerInfo').textContent = `${draft.patient || 'Adsız hasta'} · ${when}`;
        banner.hidden = false;
        $('draftRestore').addEventListener('click', () => { banner.hidden = true; restoreDraft(draft); });
        $('draftDiscard').addEventListener('click', () => { banner.hidden = true; clearDraft(); });
    }

    // ---------------------------------------------------------------------
    // 6. Kabuk olayları
    // ---------------------------------------------------------------------
    function bindShell() {
        $('wizardNext')?.addEventListener('click', nextStep);
        $('wizardBack')?.addEventListener('click', prevStep);
        stepperItems().forEach(li => li.querySelector('.step-btn').addEventListener('click', () => {
            const n = Number(li.dataset.step);
            if (n === 4 && view === 'intro') nextStep();
            else goTo(n);
        }));

        // Ad alanlarında Enter: sonraki alana / form türüne geç
        main.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
            const order = ['hasta_adi', 'hasta_soyadi', 'hasta_mi'];
            const idx = order.indexOf(e.target.name);
            if (idx < 0) return;
            e.preventDefault();
            const nextName = order.slice(idx + 1).find(n => !main.querySelector(`input[name="${n}"]`)?.value.trim());
            if (nextName && nextName !== 'hasta_mi') main.querySelector(`input[name="${nextName}"]`).focus();
            else if (nameComplete()) { e.target.blur(); $('form_turu_section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            else validateStep(1);
        });

        // Kartın tamamı tıklanır (görüntüleme modunda seçim değişmez)
        main.addEventListener('click', e => {
            if (MODE === 'view') return;
            const card = e.target.closest('.option-card, .treatment-card');
            if (!card || e.target.closest('input, a')) return;
            const radio = card.querySelector('input[type="radio"]');
            if (!radio || radio.checked || radio.disabled) return;
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Değişiklikler: özetler, çipler, taslak
        let refreshTimer = null;
        const onChange = e => {
            userTouched = true;
            onIntroChange(e);
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                if (view === '4' || MODE !== 'new') refreshAccordions();
                updateChips();
                renderStepper();
                updateActionBar();
            }, 60);
            saveDraft();
        };
        main.addEventListener('change', onChange);
        main.addEventListener('input', onChange);
        main.addEventListener('input', e => {
            if (e.target.classList?.contains('invalid') && e.target.value.trim()) e.target.classList.remove('invalid');
        });

        // PDF: her şeyi açık yakala
        const pdfBtn = $('generatePdfBtn');
        if (pdfBtn && typeof generatePDF === 'function') {
            pdfBtn.removeEventListener('click', generatePDF);
            pdfBtn.addEventListener('click', async () => {
                // PDF her zaman gündüz renkleriyle ve tüm gruplar açık üretilir
                const root = document.documentElement;
                const theme = root.getAttribute('data-theme');
                root.setAttribute('data-theme', 'light');
                body.classList.add('pdf-mode');
                try { await generatePDF(); } finally {
                    body.classList.remove('pdf-mode');
                    root.setAttribute('data-theme', theme || 'light');
                }
            });
        }

        // Kaydet: başarıda taslağı sil
        const saveBtn = $('saveBtn');
        if (saveBtn && MODE === 'new' && typeof saveFormToFirebase === 'function') {
            saveBtn.removeEventListener('click', saveFormToFirebase);
            saveBtn.addEventListener('click', async () => {
                await saveFormToFirebase();
                if (saveBtn.disabled) clearDraft();
            });
        }

        // Temizle: taslağı da sil
        const resetBtn = $('resetBtn');
        if (resetBtn && typeof resetForm === 'function') {
            resetBtn.removeEventListener('click', resetForm);
            resetBtn.addEventListener('click', () => {
                if (!confirm('Formu temizlemek istediğinizden emin misiniz?')) return;
                clearDraft();
                window.location.href = 'form.html';
            });
        }

        // Düzenleme / varsayılan modunda kaydedilmemiş değişiklik varsa sayfadan çıkarken sor
        let editDirty = false;
        if (MODE === 'edit' || MODE === 'defaults') {
            main.addEventListener('change', () => { editDirty = true; });
            main.addEventListener('input', () => { editDirty = true; });
            const unsaved = () => {
                if (MODE === 'edit') return editDirty && !$('saveBtn')?.disabled; // kaydederken düğme kilitlenir
                const s = (typeof currentDefaultsSection === 'function') ? currentDefaultsSection() : null;
                return !!(s && s.dataset.dirty);
            };
            window.addEventListener('beforeunload', e => {
                if (!unsaved()) return;
                e.preventDefault();
                e.returnValue = '';
            });
        }

        // ESC: çıkış (yeni formda taslak cihazda kalır; düzenlemede kaydedilmemişse sorulur)
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || document.getElementById('rxPinModal')) return;
            const target = $('viewFormsBtn')?.getAttribute('href') || 'index.html';
            window.location.href = target;
        });
    }

    // Görüntüleme modu: değişiklik denemesi -> asistan için PIN, sonra hekim düzenlemesi;
    // hekim için uyarı penceresi yerine "Düzenle" eylemli bildirim. (script.js'in uyarısından önce yakalar)
    function guardViewMode() {
        if (MODE !== 'view') return;
        const toEdit = () => {
            const p = new URLSearchParams(window.location.search);
            p.set('role', 'doctor');
            p.set('edit', 'true');
            window.location.search = p.toString();
        };
        let asking = false;
        const requestEdit = async () => {
            if (asking) return;
            if (ROLE !== 'assistant') {
                toast('Görüntüleme modundasınız', { action: 'Düzenle', onAction: toEdit, duration: 4000 });
                return;
            }
            asking = true;
            const ok = window.RX ? await RX.askPin({
                title: 'Formu düzenle',
                text: 'Değişiklik yapmak için hekim PIN kodunu girin. Form, hekim arşivinden açılmış gibi düzenleme modunda açılır.',
                rememberOption: false,
                grantSession: false
            }) : false;
            asking = false;
            if (ok) toEdit();
        };
        const block = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); requestEdit(); };
        const isToggle = t => t instanceof HTMLInputElement && (t.type === 'radio' || t.type === 'checkbox');
        const inForm = t => t instanceof Element && main.contains(t);

        document.addEventListener('click', e => {
            const t = e.target;
            if (!inForm(t) || t.closest('.step-toolbar')) return; // görünüm araçları serbest
            if (isToggle(t)) { block(e); return; }
            // Kart, diş hücresi veya seçenek satırına tıklama da değişiklik denemesidir
            if (!t.closest('button, a, textarea, input, select') && t.closest('.option-card, .treatment-card, label')) block(e);
        }, true);
        document.addEventListener('keydown', e => {
            const t = e.target;
            if (!inForm(t) || t.closest('.step-toolbar') || e.key === 'Tab' || e.ctrlKey || e.metaKey) return;
            if (isToggle(t) && (e.key === ' ' || e.key.startsWith('Arrow'))) { block(e); return; }
            if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && !isToggle(t) && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) block(e);
        }, true);
        ['paste', 'drop'].forEach(type => document.addEventListener(type, e => {
            if (inForm(e.target) && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) block(e);
        }, true));
        document.addEventListener('mousedown', e => { if (inForm(e.target) && e.target instanceof HTMLSelectElement) block(e); }, true);
        $('assistantEditBtn')?.addEventListener('click', requestEdit);
    }

    function setupMode() {
        body.dataset.mode = MODE;
        body.dataset.role = ROLE;
        const title = $('stepTitle');
        const h1 = document.querySelector('.appbar-title');
        const sub = $('appbarSub');
        if (MODE === 'view' || MODE === 'edit') {
            view = 'all';
            applyView();
            document.title = (MODE === 'edit' ? 'Formu Düzenle' : 'Kayıtlı Form') + ' - Rxalign';
            if (h1) h1.textContent = MODE === 'edit' ? 'Formu düzenle' : 'Kayıtlı form';
            if (sub) sub.textContent = ROLE === 'assistant' ? 'Asistan görünümü · yalnızca okuma' : (MODE === 'edit' ? 'Değişiklikler kaydedilince arşive dönülür' : 'Hekim görünümü');
            const close = $('viewFormsBtn');
            if (close) close.href = `list.html?role=${ROLE}`;
            $('stepHeader').hidden = true;
        } else if (MODE === 'defaults') {
            view = 'all';
            applyView();
            if (sub) sub.textContent = 'Form varsayılanları';
            $('stepHeader').hidden = true;
            const close = $('viewFormsBtn');
            if (close) close.href = 'settings.html';
        }
        if (title && MODE === 'new') goTo(1, { scroll: false });
    }

    // ---------------------------------------------------------------------
    // 7. Başlangıç (script.js'in DOMContentLoaded işleyicisinden sonra çalışır)
    // ---------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        buildAllAccordions();
        buildToolbar();
        restoreClassic();
        bindShell();
        setupMode();
        guardViewMode();
        updateChips();
        if (MODE === 'new') offerDraft();

        // Ayarlar buluttan gelince (oturumda anahtar kullanılmadıysa) görünümü güncelle
        if (window.RX && RX.loadUiSettings) RX.loadUiSettings().then(restoreClassic).catch(() => {});

        // Kayıt yüklenince (görüntüleme) ve varsayılanlar gelince özetleri tazele
        let tries = 0;
        const poll = setInterval(() => {
            refreshAccordions();
            updateChips();
            renderStepper();
            if (++tries > 12) clearInterval(poll);
        }, 500);
    });
})();
