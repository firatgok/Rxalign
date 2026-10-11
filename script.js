// =====================================================================
//  Invisalign Form - form.html mantığı
//  Bölümler:
//   1. Yardımcılar
//   2. Görünürlük zinciri (form türü > hasta tipi > ürün > paket > detaylı form)
//   3. Detaylı form kuralları (tek senkron fonksiyonu, form başına tek listener)
//   4. Refinement (Ek Hizalayıcılar) kuralları
//   5. Veri toplama / Firestore kaydet-güncelle / görüntüleme
//   6. PDF, kopyalama, sayaçlar
//   7. Başlangıç
// =====================================================================

// ---------------------------------------------------------------------
// 1. Yardımcılar
// ---------------------------------------------------------------------

// Kayıttaki form alanı olmayan anahtarlar
const META_KEYS = ['createdAt', 'updatedAt', 'checked_in', 'checked_in_at'];

// Görüntüleme / düzenleme için yüklenen kayıt (güncellemede silinen alanları bulmak için)
let loadedFormData = null;

// Kısa bildirim göster (toast)
function showToast(message, duration = 1500) {
    let toast = document.getElementById('toastMessage');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastMessage';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    // Animasyonun her seferinde tekrar tetiklenmesi için
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// Inline style ile gizlenmiş bir atası var mı? (stopAt dahil değil)
function isHiddenInline(el, stopAt = null) {
    for (let n = el; n && n !== stopAt; n = n.parentElement) {
        if (n.style && n.style.display === 'none') return true;
    }
    return false;
}

function show(el) { if (el) el.style.display = 'block'; }
function hide(el) { if (el) el.style.display = 'none'; }

// Bir alanı aktif/pasif yap; pasifse değerini temizle
function setEnabled(el, enabled) {
    if (!el) return;
    el.disabled = !enabled;
    if (!enabled) clearInput(el);
}

function clearInput(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
    } else if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
    } else {
        el.value = '';
    }
}

// Bir alt bölümü göster/gizle; gizlenince içindeki alanları temizle (clear=true ise)
function setShown(el, shown, clear = true) {
    if (!el) return;
    el.style.display = shown ? 'block' : 'none';
    if (!shown && clear) {
        el.querySelectorAll('input, select, textarea').forEach(clearInput);
    }
}

// Seçili radio değerini döndür (kök içinde)
function checkedValue(root, name) {
    return root.querySelector(`input[name="${name}"]:checked`)?.value;
}

// Şu anda açık olan detaylı formu (veya Flex formunu) döndür
function getVisibleDetailedForm() {
    return [...document.querySelectorAll('.detailed-form, .flex-form')].find(f => f.style.display === 'block') || null;
}

// Açık formdaki özel talimat / özel not alanı
const TALIMAT_TEXTAREA_SELECTOR = 'textarea[name^="ozel_talimatlar"], textarea[name="flex_ozel_notlar"]';

// Seçim kartlarının "selected" sınıfını güncelle
function updateCardSelection() {
    document.querySelectorAll('.option-card, .treatment-card').forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        card.classList.toggle('selected', !!(radio && radio.checked));
    });
}

// ---------------------------------------------------------------------
// 2. Görünürlük zinciri
// ---------------------------------------------------------------------

// Hasta tipi -> ürün bölümü
const PRODUCT_BY_HASTA = {
    yetiskin: 'urun_yetiskin',
    ergen: 'urun_ergen',
    cocuk: 'urun_cocuk'
};

// Ürün radio adı + değeri -> tedavi bölümü
const TREATMENT_MAP = {
    urun_tipi_yetiskin: {
        invisalign_aligner: 'tedavi_yetiskin_invisalign',
        vivera_retainer: 'tedavi_yetiskin_vivera',
        gulumseme_mimarisi: 'tedavi_yetiskin_gulumseme'
    },
    urun_tipi_ergen: {
        invisalign_aligner: 'tedavi_ergen_invisalign',
        vivera_retainer: 'tedavi_ergen_vivera',
        palatal_genisletici: 'tedavi_ergen_palatal'
    },
    urun_tipi_cocuk: {
        invisalign_first: 'tedavi_cocuk_first',
        vivera_retainer: 'tedavi_cocuk_vivera',
        palatal_genisletici: 'tedavi_cocuk_palatal'
    }
};

// Paket radio adı:değeri -> detaylı form
const DETAILED_MAP = {
    'tedavi_secenegi:comprehensive': 'detayli_form_yetiskin_comprehensive',
    'tedavi_secenegi:moderate': 'detayli_form_yetiskin_moderate',
    'tedavi_secenegi:lite': 'detayli_form_yetiskin_lite',
    'tedavi_secenegi:express': 'detayli_form_yetiskin_express',
    'tedavi_secenegi_ergen:comprehensive': 'detayli_form_ergen_comprehensive',
    'tedavi_secenegi_ergen:moderate': 'detayli_form_ergen_moderate',
    'tedavi_secenegi_ergen:lite': 'detayli_form_ergen_lite',
    'tedavi_secenegi_ergen:express': 'detayli_form_ergen_express',
    'tedavi_secenegi_cocuk_first:first_comprehensive': 'detayli_form_cocuk_first'
};

// Henüz aktif olmayan seçenekler (radio adı:değeri -> uyarı adı)
const INACTIVE_CHOICES = {
    'urun_tipi_yetiskin:vivera_retainer': 'Vivera Retainerları',
    'urun_tipi_yetiskin:gulumseme_mimarisi': 'Gülümseme Mimarisi',
    'urun_tipi_ergen:vivera_retainer': 'Vivera Retainerları',
    'tedavi_secenegi_palatal:palatal_genisletici': 'Palatal Genişleticiler',
    'tedavi_secenegi_cocuk_vivera:vivera_retainer': 'Vivera Retainerları',
    'tedavi_secenegi_cocuk_palatal:palatal_genisletici': 'Palatal Genişleticiler'
};

// Mevcut seçimlere göre hangi bölümlerin görüneceğini hesapla
function updateVisibilityChain({ scroll = false } = {}) {
    const root = document;
    const hastaTipiSection = document.getElementById('hasta_tipi_section');
    const refinementSection = document.getElementById('refinement_form_section');

    const flexSection = document.getElementById('flex_form_section');
    const formTuru = checkedValue(root, 'form_turu');
    const isFlex = formTuru === 'yeni_hasta_flex';

    document.querySelectorAll('.product-section, .treatment-section, .detailed-form').forEach(hide);
    hide(flexSection);

    // Refinement: hasta tipi seçimi kalır (erupsiyon bölümü için), ürün/paket gizli, refinement formu açık
    if (formTuru === 'refinement') {
        show(hastaTipiSection);
        show(refinementSection);
        initRefinement();
        return;
    }

    hide(refinementSection);
    show(hastaTipiSection);

    const hastaTipi = checkedValue(root, 'hasta_tipi');
    if (!hastaTipi) return;
    show(document.getElementById(PRODUCT_BY_HASTA[hastaTipi]));

    const urunName = 'urun_tipi_' + hastaTipi;
    const urun = checkedValue(root, urunName);
    const treatmentId = TREATMENT_MAP[urunName]?.[urun];
    if (!treatmentId) return;
    const treatmentSection = document.getElementById(treatmentId);
    show(treatmentSection);

    const pkg = treatmentSection?.querySelector('input[type="radio"]:checked');
    if (!pkg) return;

    // Flex Rx: paket seçildikten sonra tek bir Flex formu açılır
    if (isFlex) {
        if (!flexSection) return;
        show(flexSection);
        initFlexForm(flexSection);
        if (scroll) {
            setTimeout(() => flexSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
        return;
    }

    const form = document.getElementById(DETAILED_MAP[`${pkg.name}:${pkg.value}`] || '');
    if (!form) return;
    show(form);
    initDetailedForm(form);
    if (scroll) {
        setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
}

// ---------------------------------------------------------------------
// 3b. Flex Rx formu
// ---------------------------------------------------------------------

const FLEX_TEETH_UPPER = [['1.8', '1.7', '1.6', '1.5', '1.4', '1.3', '1.2', '1.1'], ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8']];
const FLEX_TEETH_LOWER = [['4.8', '4.7', '4.6', '4.5', '4.4', '4.3', '4.2', '4.1'], ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8']];

// Diş ızgaralarını ilk açılışta üret, sonra her açılışta durumu senkronla
function initFlexForm(section) {
    if (!section.dataset.ready) {
        section.dataset.ready = '1';
        section.querySelectorAll('.flex-teeth[data-teeth]').forEach(container => {
            const name = container.dataset.teeth;
            const row = teeth => `<div class="teeth-row">` +
                teeth[0].map(t => `<label class="tooth-checkbox"><input type="checkbox" name="${name}" value="${t}"><span>${t}</span></label>`).join('') +
                `<span class="teeth-separator">|</span>` +
                teeth[1].map(t => `<label class="tooth-checkbox"><input type="checkbox" name="${name}" value="${t}"><span>${t}</span></label>`).join('') +
                `</div>`;
            container.innerHTML = `<div class="teeth-grid">${row(FLEX_TEETH_UPPER)}${row(FLEX_TEETH_LOWER)}</div>`;
        });
        section.querySelectorAll('textarea[name="flex_ozel_notlar"]').forEach(setupTextareaAutoResize);
    }
    syncFlexForm(section);
    const notlar = section.querySelector('textarea[name="flex_ozel_notlar"]');
    if (notlar) {
        if (notlar._adjustHeight) notlar._adjustHeight();
        updateCharCount(notlar, 'char_count_flex', 10000);
    }
}

// Flex: geçersiz kılma gövdeleri yalnızca kutu işaretliyken görünür; gizlenince temizlenir
function syncFlexForm(section) {
    section.querySelectorAll('.flex-pref').forEach(pref => {
        const override = pref.querySelector('input[name^="flex_override_"]');
        const body = pref.querySelector('.flex-pref-body');
        const on = !!override?.checked;
        pref.classList.toggle('overridden', on);
        setShown(body, on);
    });

    // Isırma destekleri: tür seçimi yalnızca "özelleştir" seçiliyken
    const isirma = checkedValue(section, 'flex_isirma_yerlesim');
    setShown(section.querySelector('#flex_isirma_tur'), isirma === 'ozellestir');

    // IPR planlama detayı yalnızca aşama bazlı seçeneklerde
    const plan = checkedValue(section, 'flex_ipr_planlama');
    setEnabled(section.querySelector('input[name="flex_ipr_planlama_detay"]'), plan === 'her_x_asamada' || plan === 'belirli_asamalarda');

    // Ataşman sınırlaması "tümünü seç" durumu
    const tumunu = section.querySelector('#flex_atasman_tumunu_sec');
    const boxes = [...section.querySelectorAll('input[name="flex_atasman_sinir"]')];
    if (tumunu && boxes.length) tumunu.checked = boxes.every(cb => cb.checked);
}

function handleFlexChange(section, input) {
    if (input.id === 'flex_atasman_tumunu_sec') {
        section.querySelectorAll('input[name="flex_atasman_sinir"]').forEach(cb => cb.checked = input.checked);
    }
}

// Üst seçim radio'su mu? (form türü, hasta tipi, ürün, paket)
function isStructuralInput(input) {
    return input.name === 'form_turu' ||
        !!input.closest('#hasta_tipi_section, .product-section, .treatment-section');
}

// ---------------------------------------------------------------------
// 3. Detaylı form kuralları
// ---------------------------------------------------------------------

// Form son ekine göre alan erişimi
function fields(form) {
    const s = form.dataset.suffix;
    return {
        suffix: s,
        radio: base => form.querySelector(`input[name="${base}_${s}"]:checked`)?.value,
        radios: base => form.querySelectorAll(`input[name="${base}_${s}"]`),
        cb: base => form.querySelector(`input[name="${base}_${s}"]`),
        group: (prefix, type) => form.querySelectorAll(`input[type="${type}"][name^="${prefix}"][name$="_${s}"]`),
        el: idBase => form.querySelector(`#${idBase}_${s}`)
    };
}

// Formu ilk kez açarken listener'ları bağla; her açılışta durumu senkronla
function initDetailedForm(form) {
    if (!form.dataset.ready) {
        form.dataset.ready = '1';
        form.querySelectorAll('textarea[name^="ozel_talimatlar"]').forEach(setupTextareaAutoResize);
    }
    syncDetailedForm(form);
    refreshTextareas(form);
}

// Tüm bağımlı alanların aktif/pasif ve görünür/gizli durumunu mevcut seçimlerden türet.
// Geçerli seçimleri silmez; yalnızca kurala aykırı (pasif veya gizli) alanları temizler.
function syncDetailedForm(form) {
    const f = fields(form);

    // 1. Tedavi edilecek ark -> karşıt ark seçenekleri (radio; IDS'te tek seçim)
    const ark = f.radio('tedavi_ark');
    f.radios('ust_karsit_ark').forEach(r => setEnabled(r, ark === 'ust'));
    f.radios('alt_karsit_ark').forEach(r => setEnabled(r, ark === 'alt'));

    // 2. Diş hareketi sınırlamaları -> diş seçimi
    const belirliDisler = f.radio('dis_hareketi') === 'belirli_disler';
    f.group('dis_sinir_', 'checkbox').forEach(cb => setEnabled(cb, belirliDisler));

    // 3. Ataşmanlar -> diş seçimi
    const atasmanSecimi = f.radio('atasmanlar') === 'bu_dislere_yerlestirmeyin';
    const atasmanBoxes = [...f.group('atasman_', 'checkbox')];
    atasmanBoxes.forEach(cb => setEnabled(cb, atasmanSecimi));
    const tumunuSec = f.el('tumunu_sec_atasman');
    setEnabled(tumunuSec, atasmanSecimi);
    if (tumunuSec && atasmanSecimi) {
        tumunuSec.checked = atasmanBoxes.length > 0 && atasmanBoxes.every(cb => cb.checked);
    }

    // 4. A-P ilişkisi
    const sag = f.radio('ap_sag');
    const sol = f.radio('ap_sol');
    const disHareketi = f.cb('dis_hareketi_secenekleri');
    const posteriorIPR = f.cb('posterior_ipr');
    const sinif23 = f.cb('sinif_2_3_duzeltme');
    const distalizasyonCb = f.cb('distalizasyon_checkbox');
    const mandibular = f.cb('mandibular_ilerletme');
    const ortognatik = f.cb('ortognatik_cerrahi');

    // IDS kuralı: köpekdişi/Sınıf I herhangi bir tarafta varsa hepsi açık;
    // yalnızca kanin (diğer taraf mevcut) ise Sınıf II/III ve ortognatik kapalı; her ikisi mevcut ise hepsi kapalı.
    const allow = { disHareketi: true, posteriorIPR: true, sinif23: true, distalizasyon: true, mandibular: true, ortognatik: true };
    const hasFull = [sag, sol].some(v => v === 'kopekdisi_azidisi' || v === 'sinif_1');
    if (!hasFull && sag === 'mevcut' && sol === 'mevcut') {
        Object.keys(allow).forEach(k => allow[k] = false);
    } else if (!hasFull && (sag === 'kanin' || sol === 'kanin')) {
        allow.sinif23 = false;
        allow.ortognatik = false;
    }

    setEnabled(disHareketi, allow.disHareketi);
    setEnabled(mandibular, allow.mandibular);
    setEnabled(ortognatik, allow.ortognatik);

    // Diş hareketi alt seçenekleri yalnızca "Diş hareketi seçenekleri" işaretliyken
    const disHareketiOn = !!disHareketi?.checked;
    setEnabled(posteriorIPR, allow.posteriorIPR && disHareketiOn);
    setEnabled(sinif23, allow.sinif23 && disHareketiOn);
    setEnabled(distalizasyonCb, allow.distalizasyon && disHareketiOn);
    f.radios('precision_cuts').forEach(r => setEnabled(r, !!sinif23?.checked));
    f.radios('distalizasyon').forEach(r => setEnabled(r, !!distalizasyonCb?.checked));

    // Mandibular alt seçenekleri (varsayılan değerler HTML'de işaretli; gizlenince silinmez)
    setShown(f.el('mandibular_sub_options'), !!mandibular?.checked, false);

    // 6. Overbite
    const overbite = f.radio('overbite');
    syncKapanis(f, 'acik', overbite === 'acik_kapanis', 'anterior_ekstruzyon', 'posterior_intruzyon');
    syncKapanis(f, 'derin', overbite === 'derin_kapanis', 'anterior_intruzyon', 'posterior_ekstruzyon');

    // 7. Bite ramp
    const biteRamp = f.radio('bite_ramp');
    setShown(f.el('bite_ramp_sub_options'), biteRamp === 'lingual_rampler');
    setShown(f.el('kesici_disler_options'), biteRamp === 'lingual_rampler' && f.radio('bite_ramp_dis_tipi') === 'kesici_disler');

    // 8. Orta hat
    const ortaHatIPR = f.radio('orta_hat') === 'ipr_iyilestir';
    const ortaUst = f.cb('orta_hat_ust');
    const ortaAlt = f.cb('orta_hat_alt');
    setEnabled(ortaUst, ortaHatIPR);
    setEnabled(ortaAlt, ortaHatIPR);
    f.radios('orta_hat_ust_yon').forEach(r => setEnabled(r, !!ortaUst?.checked));
    f.radios('orta_hat_alt_yon').forEach(r => setEnabled(r, !!ortaAlt?.checked));

    // 10. Diş çekimleri
    setShown(f.el('dis_cekimi_grid'), f.radio('dis_cekimi') === 'bu_disleri_cek');

    // 11. Erupsiyon kompansasyonu (ergen / çocuk formları)
    const erupsiyonOn = f.radio('erupsiyon_kompansasyonu') === 'su_disler';
    f.group('erupsiyon_', 'checkbox').forEach(cb => setEnabled(cb, erupsiyonOn));
    const terminalOn = f.radio('terminal_azidisi') === 'su_isler';
    f.group('terminal_', 'checkbox').forEach(cb => setEnabled(cb, terminalOn));
    setEnabled(f.cb('terminal_baslat_asama'), terminalOn);
}

// Açık / derin kapanış alt seçenekleri
function syncKapanis(f, prefix, enabled, ustAlt1, ustAlt2) {
    const ust = f.cb(`${prefix}_kapanis_ust`);
    const alt = f.cb(`${prefix}_kapanis_alt`);
    const diger = f.cb(`${prefix}_kapanis_diger`);
    // IDS kuralı: Üst/Alt işaretliyse Diğer kapalı; Diğer işaretliyse Üst/Alt kapalı
    const digerOn = enabled && !!diger?.checked;
    setEnabled(ust, enabled && !digerOn);
    setEnabled(alt, enabled && !digerOn);
    setEnabled(diger, enabled && !ust?.checked && !alt?.checked);
    setEnabled(f.cb(`${prefix}_kapanis_ust_${ustAlt1}`), !!ust?.checked);
    setEnabled(f.cb(`${prefix}_kapanis_ust_${ustAlt2}`), !!ust?.checked);
    setEnabled(f.cb(`${prefix}_kapanis_alt_${ustAlt1}`), !!alt?.checked);
    setEnabled(f.cb(`${prefix}_kapanis_alt_${ustAlt2}`), !!alt?.checked);
}

// Kullanıcı değişikliklerinde senkrondan önce uygulanacak özel davranışlar
function handleDetailedFormChange(form, input) {
    const f = fields(form);
    const s = f.suffix;
    const base = input.name && input.name.endsWith('_' + s)
        ? input.name.slice(0, -(s.length + 1))
        : '';

    // Ataşmanlar: tümünü seç
    if (input.id === `tumunu_sec_atasman_${s}`) {
        f.group('atasman_', 'checkbox').forEach(cb => { if (!cb.disabled) cb.checked = input.checked; });
    }

    // Tedavi edilecek ark: Üst/Alt seçilince karşıt ark için IDS varsayılanı "hiçbir şey yoktur"
    if (base === 'tedavi_ark' && (input.value === 'ust' || input.value === 'alt')) {
        const radios = [...f.radios(`${input.value}_karsit_ark`)];
        if (radios.length && !radios.some(r => r.checked)) {
            const def = radios.find(r => r.value === 'hicbir_sey_yoktur') || radios[0];
            def.checked = true;
        }
    }

    // A-P tablosu değişince: her ikisi "mevcut" ise hepsi temiz, aksi halde diş hareketi otomatik
    if (base === 'ap_sag' || base === 'ap_sol') {
        const sag = f.radio('ap_sag');
        const sol = f.radio('ap_sol');
        const disHareketi = f.cb('dis_hareketi_secenekleri');
        const mandibular = f.cb('mandibular_ilerletme');
        const ortognatik = f.cb('ortognatik_cerrahi');
        if (sag === 'mevcut' && sol === 'mevcut') {
            [disHareketi, mandibular, ortognatik].forEach(cb => { if (cb) cb.checked = false; });
        } else if (disHareketi) {
            disHareketi.checked = true;
            if (mandibular) mandibular.checked = false;
            if (ortognatik) ortognatik.checked = false;
        }
    }

    // Diş hareketi / mandibular / ortognatik: yalnızca biri seçili olabilir
    const exclusive = ['dis_hareketi_secenekleri', 'mandibular_ilerletme', 'ortognatik_cerrahi'];
    if (exclusive.includes(base) && input.checked) {
        exclusive.filter(b => b !== base).forEach(b => { const cb = f.cb(b); if (cb) cb.checked = false; });
    }
}

// ---------------------------------------------------------------------
// 4. Refinement (Ek Hizalayıcılar) kuralları
// ---------------------------------------------------------------------

function refinementRoot() {
    return document.getElementById('refinement_form_section');
}

function initRefinement() {
    syncRefinement();
}

function syncRefinement() {
    const R = refinementRoot();
    if (!R) return;
    const rv = name => checkedValue(R, name);
    const q = sel => R.querySelector(sel);
    const qa = sel => R.querySelectorAll(sel);

    // 1. Başvuru nedeni -> "Diğer" açıklaması
    setShown(q('textarea[name="basvuru_nedeni_diger"]'), rv('basvuru_nedeni') === 'diger');

    // 3. Tedavi edilecek ark -> karşıt ark
    const ark = rv('tedavi_edilecek_ark');
    qa('input[name="ust_karsit_ark"]').forEach(r => setEnabled(r, ark === 'ust'));
    qa('input[name="alt_karsit_ark"]').forEach(r => setEnabled(r, ark === 'alt'));

    // 6. Diş hareketi sınırlamaları -> diş seçimi
    const belirli = rv('dis_hareketi_sinirlamasi') === 'belirli_disler';
    qa('input[name="dis_sinir"]').forEach(cb => setEnabled(cb, belirli));

    // 7. A-P ilişkisi
    const sag = rv('ap_sag_refinement');
    const sol = rv('ap_sol_refinement');
    const bothMevcut = sag === 'mevcut' && sol === 'mevcut';
    const bothKanin = sag === 'kanin' && sol === 'kanin';
    qa('input[name="ap_duzeltme_secenegi_refinement"]').forEach(r => {
        setEnabled(r, !bothMevcut && !(bothKanin && r.value === 'ortognatik_cerrahi'));
    });
    const secenek = rv('ap_duzeltme_secenegi_refinement');
    const disOn = secenek === 'dis_hareketi';
    const posteriorIPR = q('input[name="posterior_ipr_refinement"]');
    const sinif23 = q('input[name="sinif_2_3_duzeltme_refinement"]');
    const distalizasyonCb = q('input[name="distalizasyon_checkbox_refinement"]');
    setEnabled(posteriorIPR, disOn);
    setEnabled(sinif23, disOn && !bothKanin);
    setEnabled(distalizasyonCb, disOn);
    qa('input[name="precision_cuts_refinement"]').forEach(r => setEnabled(r, !!sinif23?.checked));
    qa('input[name="distalizasyon_refinement"]').forEach(r => setEnabled(r, !!distalizasyonCb?.checked));
    setShown(q('#mandibular_sub_options_refinement'), secenek === 'mandibular_ilerletme', false);

    // 8. Ataşmanlar -> diş seçimi
    const atasmanBelirli = rv('atasmanlar_refinement') === 'belirli_disler';
    const atasmanBoxes = [...qa('input[name="atasmanlar_dis_refinement"]')];
    atasmanBoxes.forEach(cb => setEnabled(cb, atasmanBelirli));
    const tumunuSec = q('#atasmanlar_tumunu_sec_refinement');
    setEnabled(tumunuSec, atasmanBelirli);
    if (tumunuSec && atasmanBelirli) {
        tumunuSec.checked = atasmanBoxes.length > 0 && atasmanBoxes.every(cb => cb.checked);
    }

    // 9. Mevcut ataşmanlar -> seçilen dişler
    setShown(q('#mevcut_atasmanlar_dis_grid_refinement'), rv('mevcut_atasmanlar_refinement') === 'secilen_cikar');

    // 10. IPR -> belirtilen temaslar
    const iprBelirtilen = rv('tedavi_ipr_refinement') === 'belirtilen_temaslar';
    qa('input[name="ipr_dis_refinement"]').forEach(cb => setEnabled(cb, iprBelirtilen));

    // 13. Erupsiyon kompansasyonu: yalnızca ergen ve çocuk hastalarda
    const hastaTipi = checkedValue(document, 'hasta_tipi');
    const erupsiyonBlock = q('#erupsiyon_refinement_section');
    setShown(erupsiyonBlock, hastaTipi === 'ergen' || hastaTipi === 'cocuk', false);
    if (erupsiyonBlock && erupsiyonBlock.style.display !== 'none') {
        const erupsiyonOn = rv('erupsiyon_kompansasyonu_refinement') === 'su_disler';
        qa('input[type="checkbox"][name^="erupsiyon_"][name$="_refinement"]').forEach(cb => setEnabled(cb, erupsiyonOn));
        const terminalOn = rv('terminal_azidisi_refinement') === 'su_isler';
        qa('input[type="checkbox"][name^="terminal_"][name$="_refinement"]').forEach(cb => setEnabled(cb, terminalOn));
        setEnabled(q('input[name="terminal_baslat_asama_refinement"]'), terminalOn);
    }

    // 13. Tedavi talimatları karakter sayaçları
    ['ust', 'alt'].forEach(arc => {
        const ta = q(`#tedavi_talimatlari_${arc}_refinement`);
        const counter = q(`#${arc}_ark_counter`);
        if (ta && counter) counter.textContent = ta.value.length;
    });
}

function handleRefinementChange(input) {
    const R = refinementRoot();
    const rv = name => checkedValue(R, name);

    // A-P tablosu: her ikisi "mevcut" ise seçenek yok; diğer durumlarda diş hareketi otomatik
    if (input.name === 'ap_sag_refinement' || input.name === 'ap_sol_refinement') {
        const sag = rv('ap_sag_refinement');
        const sol = rv('ap_sol_refinement');
        const radios = R.querySelectorAll('input[name="ap_duzeltme_secenegi_refinement"]');
        if (sag === 'mevcut' && sol === 'mevcut') {
            radios.forEach(r => r.checked = false);
        } else {
            const disHareketi = R.querySelector('input[name="ap_duzeltme_secenegi_refinement"][value="dis_hareketi"]');
            const bothKanin = sag === 'kanin' && sol === 'kanin';
            const sinifVeyaKopek = [sag, sol].some(v => v === 'sinif_1' || v === 'kopekdisi_azidisi');
            if (disHareketi && (bothKanin || sinifVeyaKopek)) disHareketi.checked = true;
        }
    }

    // Ataşmanlar: tümünü seç
    if (input.id === 'atasmanlar_tumunu_sec_refinement') {
        R.querySelectorAll('input[name="atasmanlar_dis_refinement"]').forEach(cb => {
            if (!cb.disabled) cb.checked = input.checked;
        });
    }
}

// Panoya kopyalama (refinement tedavi talimatları)
function copyToClipboard(textareaId, button) {
    const textarea = document.getElementById(textareaId);
    if (!textarea || !textarea.value) {
        alert('Kopyalanacak metin yok!');
        return;
    }
    const btn = button || (typeof event !== 'undefined' ? event.target : null);
    writeClipboard(textarea).then(() => flashButton(btn, '#28a745', '#0066cc'));
}

// Hasta arama (henüz gerçek arama yok)
function searchPatient() {
    const hastaAdi = document.getElementById('hasta_adi_refinement');
    if (hastaAdi && hastaAdi.value.trim()) {
        alert('Arama fonksiyonu: ' + hastaAdi.value);
    } else {
        alert('Lütfen hasta adı veya iTero sipariş kodu girin!');
    }
}

// ---------------------------------------------------------------------
// 5. Veri toplama / Firestore
// ---------------------------------------------------------------------

// Yalnızca görünür bölümlerdeki, görünür ve aktif alanları topla
function collectFormData() {
    const formData = {};
    document.querySelectorAll('#formContent > .form-section').forEach(section => {
        if (section.style.display === 'none') return;
        section.querySelectorAll('input, select, textarea').forEach(input => {
            if (!input.name || input.disabled) return;
            if (isHiddenInline(input, section)) return;

            if (input.type === 'checkbox') {
                if (input.checked) {
                    (formData[input.name] = formData[input.name] || []).push(input.value);
                }
            } else if (input.type === 'radio') {
                if (input.checked) formData[input.name] = input.value;
            } else if (input.value !== '') {
                formData[input.name] = input.value;
            }
        });
    });
    return formData;
}

// Boş değerleri at
function cleanFormData(formData) {
    const cleaned = {};
    Object.keys(formData).forEach(key => {
        const value = formData[key];
        if (value === '' || value === null || value === undefined) return;
        if (Array.isArray(value) && value.length === 0) return;
        cleaned[key] = value;
    });
    return cleaned;
}

// Yeni kayıt
async function saveFormToFirebase() {
    if (!db) {
        alert('Firebase bağlantısı kurulamadı! Lütfen firebase-config.js dosyasını yapılandırın.');
        return;
    }

    const formData = collectFormData();

    if (!formData.hasta_adi || !formData.hasta_soyadi) {
        alert('Lütfen hasta adını ve soyadını girin!');
        return;
    }
    if (!formData.form_turu) formData.form_turu = 'yeni_hasta';

    const cleanedData = cleanFormData(formData);
    cleanedData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    cleanedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const saveBtn = document.getElementById('saveBtn');
    try {
        if (saveBtn) saveBtn.disabled = true;
        const docRef = await db.collection('invisalign_forms').add(cleanedData);
        console.log('Form kaydedildi, ID:', docRef.id);
        showToast(`✓ Kaydedildi: ${cleanedData.hasta_soyadi}, ${cleanedData.hasta_adi}`);
        // Kısa bildirimden sonra asistan form arşivine geç (silme kapalı)
        setTimeout(() => {
            window.location.href = 'list.html?role=assistant';
        }, 1200);
    } catch (error) {
        console.error('Form kaydetme hatası:', error);
        alert('Form kaydedilemedi: ' + error.message);
        if (saveBtn) saveBtn.disabled = false;
    }
}

// Mevcut kaydı güncelle (kaldırılan alanlar Firestore'dan da silinir)
async function updateFormData(formId) {
    if (!confirm('Formdaki değişiklikleri kaydetmek istediğinizden emin misiniz?')) return;

    const saveBtn = document.getElementById('saveBtn');
    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Kaydediliyor...';
        }

        const cleaned = cleanFormData(collectFormData());
        if (!cleaned.hasta_adi || !cleaned.hasta_soyadi) {
            alert('Lütfen hasta adını ve soyadını girin!');
            throw new Error('Hasta adı eksik');
        }
        if (!cleaned.form_turu) cleaned.form_turu = 'yeni_hasta';

        const update = { ...cleaned, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (loadedFormData) {
            Object.keys(loadedFormData).forEach(key => {
                if (!META_KEYS.includes(key) && !(key in cleaned)) {
                    update[key] = firebase.firestore.FieldValue.delete();
                }
            });
        }

        await db.collection('invisalign_forms').doc(formId).update(update);
        showToast('✓ Değişiklikler kaydedildi');

        // Kısa bildirimden sonra doğrudan form arşivine dön (aynı rolle)
        setTimeout(() => {
            const role = new URLSearchParams(window.location.search).get('role') || 'doctor';
            window.location.href = `list.html?role=${role}`;
        }, 900);
    } catch (error) {
        if (error.message !== 'Hasta adı eksik') {
            console.error('Form güncelleme hatası:', error);
            alert('Form güncellenemedi: ' + error.message);
        }
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Değişiklikleri Kaydet';
        }
    }
}

// Eski kayıtlardaki karşıt ark checkbox anahtarlarını yeni radio değerine çevir
const LEGACY_KARSIT = /^(ust|alt)_karsit_(arkta_hicbir_sey_yoktur|arktaki_tani_modeli|arkta_pasif_alignerlar)_([a-z_]+)$/;
const LEGACY_KARSIT_VALUE = {
    arkta_hicbir_sey_yoktur: 'hicbir_sey_yoktur',
    arktaki_tani_modeli: 'tani_modeli',
    arkta_pasif_alignerlar: 'pasif_alignerlar'
};

// Kayıttaki değerleri alanlara yaz (olay tetiklemeden)
function fillFormFromData(formData) {
    Object.keys(formData).forEach(key => {
        if (META_KEYS.includes(key)) return;
        const value = formData[key];

        // Eski kayıt: karşıt ark checkbox'ı -> radio
        const legacy = key.match(LEGACY_KARSIT);
        if (legacy && value) {
            const radio = document.querySelector(`input[name="${legacy[1]}_karsit_ark_${legacy[3]}"][value="${LEGACY_KARSIT_VALUE[legacy[2]]}"]`);
            if (radio) radio.checked = true;
            return;
        }
        document.querySelectorAll(`[name="${key}"]`).forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = Array.isArray(value) ? value.includes(input.value) : !!value;
            } else if (input.type === 'radio') {
                if (input.value === value) input.checked = true;
            } else {
                input.value = value;
            }
        });
    });
}

// Görüntüleme / düzenleme için kaydı yükle
async function loadFormForViewing(formId) {
    if (!db) {
        alert('Firebase bağlantısı kurulamadı!');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const userRole = urlParams.get('role') || 'assistant';
    const isEditMode = urlParams.get('edit') === 'true';

    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const checkInBtn = document.getElementById('checkInBtn');
    const generatePdfBtn = document.getElementById('generatePdfBtn');

    hide(saveBtn);
    hide(resetBtn);

    if (userRole === 'assistant' && checkInBtn) {
        checkInBtn.style.display = 'inline-block';
        checkInBtn.textContent = 'Formu Gönder';
        checkInBtn.setAttribute('data-form-id', formId);
    } else {
        hide(checkInBtn);
    }

    // Hekim, görüntüleme modunda: "Formu Düzenle" butonu
    if (userRole === 'doctor' && !isEditMode && generatePdfBtn && !document.getElementById('editFormBtn')) {
        const editBtn = document.createElement('button');
        editBtn.id = 'editFormBtn';
        editBtn.className = 'btn';
        editBtn.style.background = '#f59e0b';
        editBtn.textContent = 'Formu Düzenle';
        generatePdfBtn.parentElement.insertBefore(editBtn, generatePdfBtn);
        editBtn.addEventListener('click', () => enableEditMode(formId));
    }

    try {
        const doc = await db.collection('invisalign_forms').doc(formId).get();
        if (!doc.exists) {
            alert('Form bulunamadı!');
            return;
        }

        loadedFormData = doc.data();
        fillFormFromData(loadedFormData);
        updateCardSelection();
        updateVisibilityChain({ scroll: false });

        if (userRole === 'assistant' && checkInBtn) {
            if (loadedFormData.checked_in) {
                checkInBtn.textContent = '✓ Giriş Yapıldı';
                checkInBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                checkInBtn.disabled = true;
                checkInBtn.style.cursor = 'not-allowed';
            } else {
                checkInBtn.textContent = 'Formu Gönder';
                checkInBtn.disabled = false;
                checkInBtn.style.cursor = 'pointer';
            }
        }

        if (isEditMode) {
            if (saveBtn) {
                saveBtn.style.display = 'inline-block';
                saveBtn.textContent = 'Değişiklikleri Kaydet';
                saveBtn.removeEventListener('click', saveFormToFirebase);
                saveBtn.addEventListener('click', () => updateFormData(formId));
            }
        } else {
            preventFormChanges();
        }
    } catch (error) {
        console.error('Form yükleme hatası:', error);
        alert('Form yüklenemedi: ' + error.message);
    }
}

// Salt okunur mod: alanlar görünür ama değiştirilemez
function preventFormChanges() {
    const urlParams = new URLSearchParams(window.location.search);
    const userRole = urlParams.get('role') || 'assistant';
    let warningShown = false;

    const showWarning = () => {
        if (warningShown) return;
        warningShown = true;
        if (userRole === 'assistant') {
            alert('Asistan girişinden form düzenlenemez. Sadece görüntüleme ve form gönderme yapabilirsiniz.');
        } else {
            alert('Formu düzenlemek için "Formu Düzenle" butonuna tıklayın.');
        }
        setTimeout(() => { warningShown = false; }, 1000);
    };

    const formContent = document.getElementById('formContent');
    if (!formContent) return;

    const isToggle = t => t instanceof HTMLInputElement && (t.type === 'radio' || t.type === 'checkbox');

    // Metin alanları: salt okunur (seçme ve kopyalama serbest)
    formContent.querySelectorAll('input, textarea').forEach(el => {
        if (!isToggle(el)) el.readOnly = true;
    });

    // Radio / checkbox tıklamalarını engelle
    formContent.addEventListener('click', e => {
        if (isToggle(e.target)) {
            e.preventDefault();
            showWarning();
        }
    }, true);

    // Klavye: radio/checkbox'ta Tab dışında her şey engelli; metin alanında yazma denemesinde uyar
    formContent.addEventListener('keydown', e => {
        const t = e.target;
        if (isToggle(t)) {
            if (e.key !== 'Tab') {
                e.preventDefault();
                showWarning();
            }
            return;
        }
        if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) &&
            e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            showWarning();
        }
    }, true);

    // Yapıştırma / sürükleme ile değişikliği engelle
    ['paste', 'drop'].forEach(type => {
        formContent.addEventListener(type, e => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                e.preventDefault();
                showWarning();
            }
        }, true);
    });

    formContent.querySelectorAll('select').forEach(select => {
        select.addEventListener('mousedown', e => { e.preventDefault(); showWarning(); });
        select.addEventListener('keydown', e => { e.preventDefault(); });
    });
}

// Düzenleme modunu aç (URL'ye edit=true ekle)
function enableEditMode() {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('edit', 'true');
    window.location.search = urlParams.toString();
}

// Formu temizle: sayfayı sıfırdan yükle
function resetForm() {
    if (confirm('Formu temizlemek istediğinizden emin misiniz?')) {
        window.location.href = 'form.html';
    }
}

// ---------------------------------------------------------------------
// 6. PDF, kopyalama, sayaçlar
// ---------------------------------------------------------------------

// PDF oluştur (ekran görüntüsü + seçilebilir özel talimat metni)
async function generatePDF() {
    const actionBar = document.querySelector('.action-buttons');
    const hastaSoyadi = document.querySelector('input[name="hasta_soyadi"]')?.value || 'hasta';
    const hastaAdi = document.querySelector('input[name="hasta_adi"]')?.value || '';
    const fileName = `invisalign_form_${hastaSoyadi}_${hastaAdi}_${Date.now()}.pdf`;

    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; text-align: center;';
    loadingDiv.innerHTML = '<h3 style="margin: 0 0 10px 0; color: #667eea;">PDF Oluşturuluyor...</h3><p style="margin: 0; color: #666;">Lütfen bekleyin</p>';
    document.body.appendChild(loadingDiv);

    // Özel talimatlar: açık olan detaylı formun textarea'sı
    const visibleForm = getVisibleDetailedForm();
    const textarea = visibleForm?.querySelector(TALIMAT_TEXTAREA_SELECTOR) || null;
    const ozelTalimatlarText = textarea?.value || '';
    const originalOpacity = textarea?.style.opacity || '';

    try {
        if (actionBar) actionBar.style.visibility = 'hidden';
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 400));

        const formContainer = document.querySelector('.container') || document.body;
        let textareaRect = null;
        let containerRect = null;
        if (textarea) {
            containerRect = formContainer.getBoundingClientRect();
            textareaRect = textarea.getBoundingClientRect();
            // Görüntüde boş kalsın; metin PDF'e seçilebilir olarak yazılacak
            textarea.style.opacity = '0';
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const canvas = await html2canvas(formContainer, {
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: formContainer.scrollWidth,
            windowHeight: formContainer.scrollHeight
        });

        if (textarea) textarea.style.opacity = originalOpacity;

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const imgWidth = 190;
        const pageHeight = 277;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 10;

        const doc = new jsPDF('p', 'mm', 'a4');
        doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            doc.addPage();
            doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        // Textarea alanının üzerine seçilebilir metin
        if (ozelTalimatlarText.trim() && textareaRect && containerRect) {
            const relTop = textareaRect.top - containerRect.top;
            const relLeft = textareaRect.left - containerRect.left;
            const pdfX = 10 + (relLeft * imgWidth / containerRect.width);
            const pdfY = relTop * imgHeight / containerRect.height;
            const pdfTextWidth = (textareaRect.width * imgWidth / containerRect.width) - 8;

            const textareaPage = Math.floor(pdfY / pageHeight);
            let totalPages = doc.internal.getNumberOfPages();
            let currentPage = Math.min(textareaPage + 1, totalPages);
            doc.setPage(currentPage);

            const applyTextStyle = () => {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
            };
            applyTextStyle();

            const lines = doc.splitTextToSize(ozelTalimatlarText, pdfTextWidth);
            const lineHeight = 5.5;
            let currentY = pdfY - (textareaPage * pageHeight) + 10 + 5;
            for (const line of lines) {
                if (currentY > pageHeight - 15) {
                    currentPage++;
                    if (currentPage > totalPages) {
                        doc.addPage();
                        totalPages++;
                    } else {
                        doc.setPage(currentPage);
                    }
                    currentY = 20;
                    applyTextStyle();
                }
                doc.text(line, pdfX + 4, currentY);
                currentY += lineHeight;
            }
        }

        // Ayrı sayfada tam metin (yedek)
        if (ozelTalimatlarText.trim()) {
            doc.addPage();
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(51, 51, 51);
            doc.text('Special Instructions / Ozel Talimatlar', 15, 20);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text('This text is selectable and can be copied.', 15, 27);
            doc.setDrawColor(200, 200, 200);
            doc.line(15, 30, 195, 30);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 51, 51);
            let yPos = 38;
            doc.splitTextToSize(ozelTalimatlarText, 180).forEach(line => {
                if (yPos > 280) {
                    doc.addPage();
                    yPos = 20;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                }
                doc.text(line, 15, yPos);
                yPos += 6;
            });
        }

        doc.save(fileName);
        showToast('✓ PDF oluşturuldu');
    } catch (error) {
        console.error('PDF oluşturma hatası:', error);
        if (textarea) textarea.style.opacity = originalOpacity;
        alert('PDF oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
        loadingDiv.remove();
        if (actionBar) actionBar.style.visibility = '';
    }
}

// Panoya yaz; Clipboard API yoksa execCommand ile
function writeClipboard(textarea) {
    const text = textarea.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => execCopy(textarea));
    }
    return Promise.resolve(execCopy(textarea));
}

function execCopy(textarea) {
    try {
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        document.execCommand('copy');
    } catch (err) {
        console.error('Kopyalama hatası:', err);
        alert('Kopyalama başarısız. Metni manuel olarak seçip kopyalayın.');
    }
}

// Butona kısa süreli "Kopyalandı" geri bildirimi
function flashButton(btn, activeColor, restoreColor) {
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Kopyalandı!';
    btn.style.background = activeColor;
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = restoreColor;
    }, 2000);
}

// Özel talimatları kopyala (açık olan formun textarea'sı)
function copyOzelTalimatlar(button) {
    const form = (button && button.closest('.detailed-form, .flex-form')) || getVisibleDetailedForm();
    const textarea = form?.querySelector(TALIMAT_TEXTAREA_SELECTOR);
    if (!textarea || !textarea.value.trim()) {
        alert('Kopyalanacak metin yok!');
        return;
    }
    const btn = button || form.querySelector('[id^="copy_ozel_talimatlar_btn"]');
    writeClipboard(textarea).then(() => flashButton(btn, '#10b981', '#667eea'));
}

// Karakter sayacını güncelle (üst ve alt sayaç)
function updateCharCount(textarea, counterId, maxLength = 4000) {
    const currentLength = textarea.value.length;
    const text = `${currentLength}/${maxLength}`;
    [document.getElementById(counterId + '_top'), document.getElementById(counterId)].forEach(counter => {
        if (!counter) return;
        counter.textContent = text;
        counter.classList.toggle('over-limit', currentLength > maxLength);
    });
}

// Textarea içeriğe göre büyüsün (tek sefer bağlanır)
function setupTextareaAutoResize(textarea) {
    if (textarea.dataset.autoresize) return;
    textarea.dataset.autoresize = '1';

    const adjustHeight = () => {
        if (isHiddenInline(textarea)) return;
        const scrollY = window.scrollY;
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        const isAtBottom = textarea.scrollHeight - textarea.scrollTop <= textarea.clientHeight + 5;

        textarea.style.height = 'auto';
        textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';

        try { textarea.setSelectionRange(selectionStart, selectionEnd); } catch (e) { /* odak yoksa */ }
        if (isAtBottom) textarea.scrollTop = textarea.scrollHeight;
        window.scrollTo(0, scrollY);
    };

    textarea.addEventListener('input', adjustHeight);
    textarea.addEventListener('paste', () => setTimeout(adjustHeight, 10));
    textarea._adjustHeight = adjustHeight;
}

// Açık formdaki textarea yüksekliğini ve sayaçlarını güncelle
function refreshTextareas(form) {
    form.querySelectorAll('textarea[name^="ozel_talimatlar"]').forEach(textarea => {
        if (textarea._adjustHeight) textarea._adjustHeight();
        updateCharCount(textarea, 'char_count_' + form.dataset.suffix);
    });
}

// ---------------------------------------------------------------------
// 7. Başlangıç
// ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
    const formContent = document.getElementById('formContent');

    document.getElementById('generatePdfBtn')?.addEventListener('click', generatePDF);
    document.getElementById('resetBtn')?.addEventListener('click', resetForm);
    document.getElementById('saveBtn')?.addEventListener('click', saveFormToFirebase);

    // Tüm form değişiklikleri tek bir dinleyiciden geçer
    if (formContent) {
        formContent.addEventListener('change', e => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;

            // Henüz aktif olmayan seçenek
            const inactiveName = INACTIVE_CHOICES[`${t.name}:${t.value}`];
            if (inactiveName && t.checked) {
                t.checked = false;
                updateCardSelection();
                updateVisibilityChain();
                alert(`${inactiveName} henüz aktive edilmemiştir.\n\nLütfen başka bir tedavi seçeneği seçiniz.`);
                return;
            }

            if (isStructuralInput(t)) {
                updateCardSelection();
                updateVisibilityChain({ scroll: e.isTrusted });
                return;
            }

            const form = t.closest('.detailed-form');
            if (form) {
                handleDetailedFormChange(form, t);
                syncDetailedForm(form);
                return;
            }

            const flex = t.closest('#flex_form_section');
            if (flex) {
                handleFlexChange(flex, t);
                syncFlexForm(flex);
                return;
            }

            if (t.closest('#refinement_form_section')) {
                handleRefinementChange(t);
                syncRefinement();
            }
        });

        // Refinement tedavi talimatları sayaçları
        formContent.addEventListener('input', e => {
            const t = e.target;
            if (t instanceof HTMLTextAreaElement && t.closest('#refinement_form_section')) {
                syncRefinement();
            }
        });
    }

    // Asistan: Formu Gönder (check-in)
    const checkInBtn = document.getElementById('checkInBtn');
    if (checkInBtn) {
        checkInBtn.addEventListener('click', async function() {
            const formId = this.getAttribute('data-form-id');
            if (!formId) {
                alert('Form ID bulunamadı!');
                return;
            }
            if (!confirm('Bu hastanın girişini yapmak istediğinizden emin misiniz?')) return;
            try {
                await db.collection('invisalign_forms').doc(formId).update({
                    checked_in: true,
                    checked_in_at: firebase.firestore.FieldValue.serverTimestamp()
                });
                this.textContent = '✓ Giriş Yapıldı';
                this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                this.disabled = true;
                this.style.cursor = 'not-allowed';
                this.style.opacity = '0.7';
                showToast('✓ Giriş işlemi tamamlandı');
            } catch (error) {
                console.error('Giriş işlemi hatası:', error);
                alert('Giriş işlemi yapılamadı: ' + error.message);
            }
        });
    }

    updateCardSelection();

    // Görüntüleme / düzenleme modu
    const viewFormId = new URLSearchParams(window.location.search).get('view');
    if (viewFormId) {
        loadFormForViewing(viewFormId);
    } else {
        updateVisibilityChain();
    }
});
