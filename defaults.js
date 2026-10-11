// =====================================================================
//  Rxalign - Form varsayılanları: katalog ve depolama
//  form.html (uygulama + düzenleme modu) ve settings.html (ayarlar) ortak kullanır.
//  Kayıt yeri: Firestore rxalign_settings/form_defaults belgesi
//    { <anahtar>: { json: '<bölüm anlık görüntüsü>', updatedAt: <ms> }, ... }
//  Tarayıcıda localStorage kopyası tutulur (hızlı açılış ve çevrimdışı yedek).
// =====================================================================

const DEFAULTS_COLLECTION = 'rxalign_settings';
const DEFAULTS_DOC = 'form_defaults';
const DEFAULTS_CACHE_KEY = 'rxalign_form_defaults';

const HASTA_TIPI_LABELS = { yetiskin: 'Yetişkin', ergen: 'Ergen', cocuk: 'Çocuk' };

// Her satır ayarlar sayfasında bir kart. `select`: varsayılan düzenleme modunda
// işaretlenen üst seçimler (form türü > hasta tipi > ürün > paket); form.html'de gizli kalırlar.
// Detaylı formların anahtarı bölümün data-suffix değeriyle aynıdır.
const DEFAULTS_CATALOG = [
    // Yetişkin
    { key: 'yetiskin_comp', hasta: 'yetiskin', label: 'Comprehensive', icon: '📋', desc: 'Kapsamlı tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'yetiskin', urun_tipi_yetiskin: 'invisalign_aligner', tedavi_secenegi: 'comprehensive' } },
    { key: 'yetiskin_moderate', hasta: 'yetiskin', label: 'Moderate', icon: '📋', desc: 'Orta düzey tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'yetiskin', urun_tipi_yetiskin: 'invisalign_aligner', tedavi_secenegi: 'moderate' } },
    { key: 'yetiskin_lite', hasta: 'yetiskin', label: 'Lite', icon: '📋', desc: 'Hafif vaka formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'yetiskin', urun_tipi_yetiskin: 'invisalign_aligner', tedavi_secenegi: 'lite' } },
    { key: 'yetiskin_express', hasta: 'yetiskin', label: 'Express', icon: '📋', desc: 'Kısa süreli tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'yetiskin', urun_tipi_yetiskin: 'invisalign_aligner', tedavi_secenegi: 'express' } },
    { key: 'flex_yetiskin', hasta: 'yetiskin', label: 'Flex Rx', icon: '⚡', desc: 'Klinik tercihler şablonuna dayalı kısa reçete',
      select: { form_turu: 'yeni_hasta_flex', hasta_tipi: 'yetiskin', urun_tipi_yetiskin: 'invisalign_aligner', tedavi_secenegi: 'comprehensive' } },
    { key: 'refinement_yetiskin', hasta: 'yetiskin', label: 'Refinement', icon: '🔄', desc: 'Ek hizalayıcı (refinement) formu',
      select: { form_turu: 'refinement', hasta_tipi: 'yetiskin' } },

    // Ergen
    { key: 'ergen_comp', hasta: 'ergen', label: 'Comprehensive', icon: '📋', desc: 'Kapsamlı tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'ergen', urun_tipi_ergen: 'invisalign_aligner', tedavi_secenegi_ergen: 'comprehensive' } },
    { key: 'ergen_moderate', hasta: 'ergen', label: 'Moderate', icon: '📋', desc: 'Orta düzey tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'ergen', urun_tipi_ergen: 'invisalign_aligner', tedavi_secenegi_ergen: 'moderate' } },
    { key: 'ergen_lite', hasta: 'ergen', label: 'Lite', icon: '📋', desc: 'Hafif vaka formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'ergen', urun_tipi_ergen: 'invisalign_aligner', tedavi_secenegi_ergen: 'lite' } },
    { key: 'ergen_express', hasta: 'ergen', label: 'Express', icon: '📋', desc: 'Kısa süreli tedavi formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'ergen', urun_tipi_ergen: 'invisalign_aligner', tedavi_secenegi_ergen: 'express' } },
    { key: 'flex_ergen', hasta: 'ergen', label: 'Flex Rx', icon: '⚡', desc: 'Klinik tercihler şablonuna dayalı kısa reçete',
      select: { form_turu: 'yeni_hasta_flex', hasta_tipi: 'ergen', urun_tipi_ergen: 'invisalign_aligner', tedavi_secenegi_ergen: 'comprehensive' } },
    { key: 'refinement_ergen', hasta: 'ergen', label: 'Refinement', icon: '🔄', desc: 'Ek hizalayıcı formu (erupsiyon kompansasyonu dahil)',
      select: { form_turu: 'refinement', hasta_tipi: 'ergen' } },

    // Çocuk
    { key: 'cocuk_first', hasta: 'cocuk', label: 'Invisalign First', icon: '📋', desc: 'Karışık dişlenme (First) formu',
      select: { form_turu: 'yeni_hasta', hasta_tipi: 'cocuk', urun_tipi_cocuk: 'invisalign_first', tedavi_secenegi_cocuk_first: 'first_comprehensive' } },
    { key: 'flex_cocuk', hasta: 'cocuk', label: 'Flex Rx', icon: '⚡', desc: 'Klinik tercihler şablonuna dayalı kısa reçete',
      select: { form_turu: 'yeni_hasta_flex', hasta_tipi: 'cocuk', urun_tipi_cocuk: 'invisalign_first', tedavi_secenegi_cocuk_first: 'first_comprehensive' } },
    { key: 'refinement_cocuk', hasta: 'cocuk', label: 'Refinement', icon: '🔄', desc: 'Ek hizalayıcı formu (erupsiyon kompansasyonu dahil)',
      select: { form_turu: 'refinement', hasta_tipi: 'cocuk' } }
];

// Bellekteki kopya: anahtar -> { json, updatedAt }
let formDefaults = {};
let formDefaultsLoaded = false;

function readDefaultsCache() {
    try {
        return JSON.parse(localStorage.getItem(DEFAULTS_CACHE_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function writeDefaultsCache() {
    try {
        localStorage.setItem(DEFAULTS_CACHE_KEY, JSON.stringify(formDefaults));
    } catch (e) { /* özel pencere vb. */ }
}

function defaultsRef() {
    return (typeof db !== 'undefined' && db) ? db.collection(DEFAULTS_COLLECTION).doc(DEFAULTS_DOC) : null;
}

// Önce yerel kopya, sonra Firestore (varsa üzerine yazar)
async function loadFormDefaults() {
    formDefaults = readDefaultsCache();
    const ref = defaultsRef();
    if (ref) {
        try {
            const snap = await ref.get();
            formDefaults = snap.exists ? (snap.data() || {}) : {};
            writeDefaultsCache();
        } catch (error) {
            console.warn('Varsayılanlar buluttan okunamadı, yerel kopya kullanılıyor:', error);
        }
    }
    formDefaultsLoaded = true;
    return formDefaults;
}

// Anahtarın kayıtlı anlık görüntüsü (yoksa null)
function getFormDefault(key) {
    const entry = formDefaults[key];
    if (!entry || !entry.json) return null;
    try {
        return JSON.parse(entry.json);
    } catch (e) {
        return null;
    }
}

async function saveFormDefault(key, data) {
    const entry = { json: JSON.stringify(data), updatedAt: Date.now() };
    formDefaults[key] = entry;
    writeDefaultsCache();
    const ref = defaultsRef();
    if (ref) await ref.set({ [key]: entry }, { merge: true });
}

async function deleteFormDefault(key) {
    delete formDefaults[key];
    writeDefaultsCache();
    const ref = defaultsRef();
    if (ref) await ref.set({ [key]: firebase.firestore.FieldValue.delete() }, { merge: true });
}
