// IDS Form Doldurucu - hasta dosyası ve reçete (Rx) sayfalarının betiği.
// IDS'te açılan hastanın kayıtlı formunu Firestore'da bulur; reçeteyi başlatır, hasta tipi /
// ürün / paketi seçer, geleneksel reçeteye geçer, adımları (1-10) doldurup "İleri" ile
// ilerler ve Tara, Fotoğraflar, Radyograf, İndirim adımlarını geçip Özet'te durur.
// "Gönder"e hiçbir zaman basmaz.
// Desteklenen kayıtlar: yetişkin ve ergen Comprehensive/Moderate/Lite/Express, çocuk Invisalign First
// (geleneksel Rx, yeni hasta) ve refinement (Ek Hizalayıcılar). Vivera, palatal genişletici ve Flex kapsam dışı.
(function () {
    'use strict';

    const STATE_KEY = 'idsRxFill';
    const PICK_KEY = 'idsRxPick';
    const PICK_TTL_MS = 12 * 60 * 60 * 1000;
    const PATIENTS_KEY = 'idsRxPatients';
    const AUTO_KEY = 'idsRxAuto';
    const AUTO_TTL_MS = 10 * 60 * 1000;
    // Dolduran sekmenin kalp atışı: bu süreden eskiyse sekme kapanmış/bırakılmış sayılır.
    const HEARTBEAT_KEY = 'idsRxHeartbeat';
    const HEARTBEAT_MS = 2500;
    const HEARTBEAT_STALE_MS = 8000;

    // ---------- Paketler ----------
    // Form sitesindeki alan son eki ve IDS reçete sayfasının yolu pakete göre değişir.
    // Vivera ve palatal genişletici kapsam dışıdır (kullanıcı kararı).

    const PACKAGES = {
        'yetiskin:comprehensive': { suffix: '_yetiskin_comp', page: 'comprehensive', teen: false, child: false },
        'yetiskin:moderate': { suffix: '_yetiskin_moderate', page: 'moderate', teen: false, child: false },
        'yetiskin:lite': { suffix: '_yetiskin_lite', page: 'lite', teen: false, child: false },
        'yetiskin:express': { suffix: '_yetiskin_express', page: 'express', teen: false, child: false },
        'ergen:comprehensive': { suffix: '_ergen_comp', page: 'comprehensive', teen: true, child: false },
        'ergen:moderate': { suffix: '_ergen_moderate', page: 'moderate', teen: true, child: false },
        'ergen:lite': { suffix: '_ergen_lite', page: 'lite', teen: true, child: false },
        'ergen:express': { suffix: '_ergen_express', page: 'express', teen: true, child: false },
        'cocuk:first_comprehensive': { suffix: '_cocuk_first', page: 'first', teen: true, child: true },
        // Refinement (Ek Hizalayıcılar): /rx/secondary/additionalAligners.action; ergen/çocukta erüpsiyon bloğu.
        'refinement': { suffix: '_refinement', page: 'refinement', teen: false, child: false, refinement: true },
        'refinement:ergen': { suffix: '_refinement', page: 'refinement', teen: true, child: false, refinement: true }
    };

    // Refinement formunda ortak yapıcıların beklediğinden farklı adla tutulan alanlar.
    const REFINEMENT_ALIAS = { tedavi_ark: 'tedavi_edilecek_ark', itero_siparis_kodu: 'hasta_adi', tarama_turu: 'olcu_tipi' };

    // Kaydın paketi: { key, suffix, page, teen, child, label } ya da null.
    function packageOf(record) {
        const type = record.hasta_tipi;
        if (record.form_turu === 'refinement') {
            const key = type === 'ergen' || type === 'cocuk' ? 'refinement:ergen' : 'refinement';
            return Object.assign({ key: key, type: type || 'yetiskin', paket: 'refinement' }, PACKAGES[key]);
        }
        if ((record.form_turu || 'yeni_hasta') !== 'yeni_hasta') return null;
        let product, paket;
        if (type === 'yetiskin') { product = record.urun_tipi_yetiskin; paket = record.tedavi_secenegi; }
        if (type === 'ergen') { product = record.urun_tipi_ergen; paket = record.tedavi_secenegi_ergen; }
        if (type === 'cocuk') { product = record.urun_tipi_cocuk; paket = record.tedavi_secenegi_cocuk_first; }
        if (!(product === 'invisalign_aligner' || product === 'invisalign_first') || !paket) return null;
        const info = PACKAGES[type + ':' + paket];
        if (!info) return null;
        return Object.assign({ key: type + ':' + paket, type: type, paket: paket }, info);
    }

    // Reçete sayfasının yolundan paket adı (comprehensive, moderate, lite, express, first).
    function pagePackage() {
        if (/\/rx\/secondary\/additionalAligners\.action$/.test(location.pathname)) {
            const type = new URLSearchParams(location.search).get('formType');
            return type === 'ADDITIONAL_ALIGNERS_INT_2_0' ? 'refinement' : null;
        }
        const m = /\/rx\/i20\/(?:maui\/)?(\w+)\.action$/.exec(location.pathname);
        if (!m) return null;
        return m[1] === 'firstComprehensive' ? 'first' : m[1];
    }

    // Etkin kayıt: alan son eki ve adım listesi buna göre seçilir.
    let activePackage = PACKAGES['yetiskin:comprehensive'];

    function setPackage(info) {
        activePackage = info || PACKAGES['yetiskin:comprehensive'];
    }

    // ---------- Kayıtlı form verisi ----------

    // Refinement formunda bazı alanlar soneksizdir ("basvuru_nedeni", "dis_sinir"...), bazıları
    // ortak yapıcıların beklediğinden farklı addadır (REFINEMENT_ALIAS).
    function value(data, key) {
        if (activePackage.refinement) {
            key = REFINEMENT_ALIAS[key] || key;
            const v = data[key + activePackage.suffix];
            return v !== undefined ? v : data[key];
        }
        return data[key + activePackage.suffix];
    }

    // Değersiz kutular ["on"] dizisi olarak kaydedilir.
    function checked(data, key) {
        const v = value(data, key);
        return Array.isArray(v) ? v.length > 0 : !!v;
    }

    // Değer listesi tutan kutular (["1.6", "3.1"]).
    function listed(data, key) {
        const v = value(data, key);
        return v === undefined || v === null ? [] : [].concat(v).map(String);
    }

    // FDI ("1.8") -> IDS diş dizini (Universal - 1): üst 1.8=0 … 2.8=15, alt 3.8=16 … 4.8=31.
    function toothIndex(fdi) {
        const quadrant = Number(fdi[0]);
        const n = Number(fdi[fdi.length - 1]);
        if (quadrant === 1) return 8 - n;
        if (quadrant === 2) return 7 + n;
        if (quadrant === 3) return 24 - n;
        return 23 + n;
    }

    const ALL_TEETH = [];
    [1, 2, 3, 4].forEach(function (q) {
        for (let n = 1; n <= 8; n++) ALL_TEETH.push(q + '.' + n);
    });

    // Süt dişleri (yalnızca Invisalign First): IDS kimliği "..._tooth_primary_<i>".
    const PRIMARY_INDEX = {
        '5.5': 32, '5.4': 33, '5.3': 34, '5.2': 35, '5.1': 36,
        '6.1': 37, '6.2': 38, '6.3': 39, '6.4': 40, '6.5': 41,
        '7.1': 42, '7.2': 43, '7.3': 44, '7.4': 45, '7.5': 46,
        '8.1': 47, '8.2': 48, '8.3': 49, '8.4': 50, '8.5': 51
    };

    // Ergen/çocuk bloğu: erüpsiyon kompansasyonu ve terminal azıdişi ızgaraları (sütunlar
    // IDS sayfasındaki sırayla okundu, bkz. docs/IDS_PAKET_FARKLARI.md).
    const ERUPTION_INDEX = {
        '1.5': 0, '1.4': 1, '1.3': 2, '1.2': 3, '1.1': 4,
        '2.1': 12, '2.2': 13, '2.3': 14, '2.4': 15, '2.5': 16,
        '4.5': 31, '4.4': 30, '4.3': 29, '4.2': 28, '4.1': 27,
        '3.1': 21, '3.2': 20, '3.3': 19, '3.4': 18, '3.5': 17
    };
    const TERMINAL_INDEX = {
        '1.8': 0, '1.7': 1, '1.6': 2, '2.6': 13, '2.7': 14, '2.8': 15,
        '4.8': 31, '4.7': 30, '4.6': 29, '3.6': 18, '3.7': 17, '3.8': 16
    };

    // ---------- Adım planları ----------
    // Her adım, sayfada bulunan bir alan kimliğiyle (probe) tanınır ve kayıtlı veriden
    // bir işlem listesi üretir: radio (seç), check (işaretle/kaldır), text (yaz), note (uyarı).

    // Tek çene tedavi edilirken IDS öbür çeneye ait alanları (dişler, çapraşıklık satırları,
    // kapanış alt seçenekleri) pasif yapar. İşlemler çeneyle etiketlenir ("arch"); tedavi
    // edilmeyen çeneninkiler uygulanmaz, bilinçli seçimler bir notla bildirilir.
    function Plan(data) {
        this.data = data;
        this.ops = [];
        this.arch = value(data, 'tedavi_ark') || 'her_ikisi_de';
    }

    Plan.prototype.treats = function (arch) {
        return (this.arch !== 'ust' && this.arch !== 'alt') || this.arch === arch;
    };

    // arch: 'ust' | 'alt' | undefined; quiet: atlanırsa not düşülmez (form varsayılanları).
    Plan.prototype.radio = function (key, map, arch, quiet) {
        const v = value(this.data, key);
        if (v === undefined) return undefined;
        if (!map[v]) {
            this.note('"' + key + '" alanındaki "' + v + '" değeri IDS\'te karşılıksız');
            return v;
        }
        this.ops.push({ kind: 'radio', id: map[v], arch: arch, quiet: quiet });
        return v;
    };

    Plan.prototype.check = function (key, id, arch) {
        const on = checked(this.data, key);
        this.ops.push({ kind: 'check', id: id, on: on, arch: arch });
        return on;
    };

    Plan.prototype.text = function (id, text) {
        this.ops.push({ kind: 'text', id: id, value: text });
    };

    function archOf(fdi) {
        return '1256'.indexOf(fdi[0]) >= 0 ? 'ust' : 'alt';
    }

    // 32 kalıcı diş; çocukta ayrıca 20 süt dişi.
    Plan.prototype.teeth = function (prefix, isOn) {
        const ops = this.ops;
        ALL_TEETH.forEach(function (fdi) {
            ops.push({ kind: 'check', id: prefix + toothIndex(fdi), on: isOn(fdi), arch: archOf(fdi) });
        });
        if (activePackage.child) {
            Object.keys(PRIMARY_INDEX).forEach(function (fdi) {
                ops.push({ kind: 'check', id: prefix + 'primary_' + PRIMARY_INDEX[fdi], on: isOn(fdi), arch: archOf(fdi) });
            });
        }
    };

    // stop: adım gönderilmeden önce kullanıcının elle giriş yapması gerekir.
    Plan.prototype.note = function (text, stop) {
        this.ops.push({ kind: 'note', text: text, stop: !!stop });
    };

    const LEVELS = ['Primarily', 'IfNeeded', 'None'];

    function levelMap(prefix) {
        return { oncelikli: prefix + LEVELS[0], gerektiginde: prefix + LEVELS[1], hicbiri: prefix + LEVELS[2] };
    }

    // --- Adım yapıcıları (pakete göre seçilir) ---

    function buildArches(p) {
        const ark = p.radio('tedavi_ark', {
            her_ikisi_de: 'treatArches.both', ust: 'treatArches.upperOnly', alt: 'treatArches.lowerOnly'
        });
        const opposite = function (key, base) {
            p.radio(key, {
                hicbir_sey_yoktur: base + '.nothingOnOppositeArch',
                tani_modeli: base + '.diagnosticSetup',
                pasif_alignerlar: base + '.passiveAlignersOppositeArch'
            });
        };
        if (ark === 'ust') opposite('ust_karsit_ark', 'treatArches.upperOnly');
        if (ark === 'alt') opposite('alt_karsit_ark', 'treatArches.lowerOnly');
    }

    function buildTeeth(p) {
        const d = p.data;
        const move = p.radio('dis_hareketi', {
            hicbiri: 'doNotMoveTeeth_none', belirli_disler: 'doNotMoveTeeth_theseTeeth'
        });
        if (move === 'belirli_disler') {
            p.teeth('doNotMoveTeeth_theseTeeth_tooth_', function (fdi) { return checked(d, 'dis_sinir_' + fdi); });
        }
        const attach = p.radio('atasmanlar', {
            gerektigi_gibi: 'teethPermittedForAttachments_anyTeeth',
            bu_dislere_yerlestirmeyin: 'teethPermittedForAttachments_doNotPutTheseTeeth'
        });
        if (attach === 'bu_dislere_yerlestirmeyin') {
            p.teeth('teethPermittedForAttachments_doNotPutTheseTeeth_tooth_', function (fdi) {
                return checked(d, 'atasman_' + fdi);
            });
        }
    }

    // A-P satırları pakete göre: form değeri -> IDS satır kimliğinin gövdesi (Right/Left eklenir).
    const AP_ROWS = {
        comprehensive: { mevcut: 'maintain', kanin: 'improveToClass1CanineOnly', kopekdisi_azidisi: 'improveCanineAndMolar', sinif_1: 'class1CanineAndMolar' },
        moderate: { mevcut: 'maintain', kanin: 'improveToClass1CanineOnly', kopekdisi_azidisi: 'partialClass1CanineOnly' },
        lite: { mevcut: 'maintain', kanin: 'improveToClass1CanineOnly', kopekdisi_azidisi: 'improveCanineAndMolarUpTo2Mm' },
        refinement: { mevcut: 'maintain', kanin: 'improveToClass1CanineOnly', kopekdisi_azidisi: 'partialClass1CanineOnly', sinif_1: 'class1CanineAndMolar' },
        // First: ikinci satır "yalnızca azıdişi"; form sitesinde aynı sıradaki değer "kanin".
        first: { mevcut: 'maintain', kanin: 'improveToClass1MolarOnly', kopekdisi_azidisi: 'improveCanineAndMolar', sinif_1: 'class1CanineAndMolar' }
    };

    function buildAP(p) {
        const d = p.data;
        const page = activePackage.page;
        const rows = AP_ROWS[page];
        const side = function (key, tail) {
            const map = {};
            Object.keys(rows).forEach(function (v) { map[v] = 'aPRelation.' + rows[v] + tail; });
            return p.radio(key, map);
        };
        const right = side('ap_sag', 'Right');
        const left = side('ap_sol', 'Left');
        // İki taraf da "mevcut" ise IDS düzeltme seçeneklerinin tümünü kapatır.
        if ((right === undefined || right === 'mevcut') && (left === undefined || left === 'mevcut')) return;

        const hasMA = page === 'comprehensive' || page === 'first' || page === 'refinement';
        const hasSurgical = page !== 'lite';
        const hasDistalization = page !== 'lite';
        let mode = null;
        if (page === 'refinement') {
            // Refinement formunda düzeltme seçeneği tek radyo.
            mode = { dis_hareketi: 'movement', mandibular_ilerletme: 'ma', ortognatik_cerrahi: 'surgical' }[value(d, 'ap_duzeltme_secenegi')] || null;
        } else if (hasMA && checked(d, 'mandibular_ilerletme')) {
            mode = 'ma';
        } else if (hasSurgical && checked(d, 'ortognatik_cerrahi')) {
            mode = 'surgical';
        } else if (checked(d, 'dis_hareketi_secenekleri')) {
            mode = 'movement';
        }
        if (mode === 'ma') {
            p.ops.push({ kind: 'radio', id: 'APRelation_MAF' });
            p.radio('ma_ozellik', {
                okluzal_bloklar: 'APRelation_MA_OCCLUSAL', gelismis_hassas_kanatlar: 'APRelation_MA_EPW'
            });
            p.radio('ma_final_pozisyon', {
                bas_basa: 'APRelation_MAF_ENDMA_ETE',
                '1mm_ileride': 'APRelation_MAF_ENDMA_LA1MMB',
                '2mm_ileride': 'APRelation_MAF_ENDMA_LA2MMB'
            });
            p.radio('ma_asamalandirma', {
                ikiser_mm: 'APRelation_MAF_MAAS_2MM', tekli_ilerleme: 'APRelation_MAF_MAAS_SINGLE'
            });
            p.radio('alt_ark_asimetrik', {
                orta_hatti_iyilestir: 'APRelation_MAF_TR_UPTO_2MM', kaydirma: 'APRelation_MAF_TR_DO_NOT'
            });
            p.radio('dikey_elastikler', {
                evet: 'APRelation_MAF_PRECISION_CUTS_YES', hayir: 'APRelation_MAF_PRECISION_CUTS_NO'
            });
        } else if (mode === 'surgical') {
            p.ops.push({ kind: 'radio', id: 'APRelation_surgical' });
        } else if (mode === 'movement') {
            p.ops.push({ kind: 'radio', id: 'APRelation_tooth_movement' });
            p.check('posterior_ipr', 'APRelation_posteriorIPR');
            if (p.check('sinif_2_3_duzeltme', 'APRelation_classIIOrIIICorrectionSimulation')) {
                p.radio('precision_cuts', {
                    evet: 'APRelation_classIIOrIIICorrectionSimulation_alignerCutsYes',
                    hayir: 'APRelation_classIIOrIIICorrectionSimulation_alignerCutsNo'
                });
            }
            if (hasDistalization && p.check('distalizasyon_checkbox', 'APRelation_distalization')) {
                p.radio('distalizasyon', {
                    evet: 'APRelation_distalization_alignerCutsYes',
                    hayir: 'APRelation_distalization_alignerCutsNo'
                });
            }
        }
    }

    function buildOverjet(p) {
        p.radio('overjet', {
            hizalama_sonrasi: 'overjet.showResultantOverjetAfterAlignment',
            ilk_koru: 'overjet.maintainInitialOverjet',
            ipr_iyilestir: 'overjet.improveResultingOverjetWithIPR'
        });
    }

    // Comprehensive, Moderate, First: ayrıntılı açık/derin kapanış seçenekleri.
    function buildOverbiteFull(p) {
        const bite = p.radio('overbite', {
            hizalama_sonrasi: 'overbite.maintainResultant',
            ilk_koru: 'overbite.maintainInitial',
            acik_kapanis: 'archLevelOverBite.correctOpenBite',
            derin_kapanis: 'archLevelOverBite.correctDeepBite'
        });
        // IDS'te "Diğer" işaretliyken Üst/Alt, Üst/Alt işaretliyken "Diğer" kapanır.
        const arches = function (key, base, anterior, posterior) {
            if (checked(p.data, key + '_diger')) {
                p.ops.push({ kind: 'check', id: base + '.upper', on: false });
                p.ops.push({ kind: 'check', id: base + '.lower', on: false });
                p.check(key + '_diger', base + '.other');
                return;
            }
            p.ops.push({ kind: 'check', id: base + '.other', on: false });
            [['ust', 'upper'], ['alt', 'lower']].forEach(function (arch) {
                if (!p.check(key + '_' + arch[0], base + '.' + arch[1], arch[0])) return;
                p.check(key + '_' + arch[0] + '_anterior_' + anterior[0], base + '.' + arch[1] + '.' + anterior[1], arch[0]);
                p.check(key + '_' + arch[0] + '_posterior_' + posterior[0], base + '.' + arch[1] + '.' + posterior[1], arch[0]);
            });
        };
        if (bite === 'acik_kapanis') {
            arches('acik_kapanis', 'archLevelOverBite.correctOpenBite',
                ['ekstruzyon', 'extrudeAnterior'], ['intruzyon', 'intrudePosterior']);
        }
        if (bite === 'derin_kapanis') {
            arches('derin_kapanis', 'archLevelOverBite.correctDeepBite',
                ['intruzyon', 'intrudeAnterior'], ['ekstruzyon', 'extrudePosterior']);
        }
    }

    // Lite, Express: overjet ile aynı sayfada, sade seçenekler.
    function buildOverbiteLite(p) {
        const bite = p.radio('overbite', {
            hizalama_sonrasi: 'overbite.maintainResultant',
            ilk_koru: 'overbite.maintainInitial',
            acik_kapanis: 'overbite.improveOpenBite',
            derin_kapanis: 'overbite.improveDeepBite'
        });
        if (bite === 'derin_kapanis') {
            p.check('derin_kapanis_ust', 'overbite.improveDeepBiteUpper', 'ust');
            p.check('derin_kapanis_alt', 'overbite.improveDeepBiteLower', 'alt');
        }
    }

    function buildBiteRamps(p) {
        const ramp = p.radio('bite_ramp', {
            otomatik: 'biteRampsUpper_autoPrecisionBiteRamps',
            lingual_rampler: 'biteRampsUpper_biteRampsUpperOptions',
            hicbiri: 'biteRampsUpper_none'
        });
        if (ramp !== 'lingual_rampler') return;
        const type = p.radio('bite_ramp_dis_tipi', {
            kesici_disler: 'biteRampsUpper_biteRampsUpperOptions_incisors',
            kaninler: 'biteRampsUpper_biteRampsUpperOptions_canines'
        });
        if (type === 'kesici_disler') {
            p.check('bite_ramp_santral', 'biteRampsUpper_biteRampsUpperOptions_incisors_centralIncisors');
            p.check('bite_ramp_lateral', 'biteRampsUpper_biteRampsUpperOptions_incisors_lateralIncisors');
        }
    }

    function buildMidline(p) {
        const midline = p.radio('orta_hat', {
            hizalama_sonrasi: 'midline.showResultantMidlineAfterAlignment',
            ilk_koru: 'midline.maintainInitialMidline',
            ipr_iyilestir: 'midline.improveMidlineWithIPR'
        });
        if (midline === 'ipr_iyilestir') {
            [['ust', 'Upper'], ['alt', 'Lower']].forEach(function (arch) {
                const base = 'midline.improveMidlineWithIPR' + arch[1];
                if (!p.check('orta_hat_' + arch[0], base, arch[0])) return;
                p.radio('orta_hat_' + arch[0] + '_yon', {
                    sagina: base + '.patientsRight', soluna: base + '.patientsLeft'
                }, arch[0]);
            });
        }
        if (activePackage.page !== 'lite' && activePackage.page !== 'express') {
            // Bizim formdaki "duzeltme" = düzeltme yapma (IDS: maintain), "duzelt" = düzelt.
            p.radio('posterior_capraz', {
                duzeltme: 'posteriorCrossbite.maintain', duzelt: 'posteriorCrossbite.correct'
            });
        }
    }

    function buildSpaces(p) {
        const spaces = p.radio('bosluk', {
            kapat: 'spaces_closeAll', birak: 'spaces_leaveSpaces', duzenle: 'spaces_leaveSpaces'
        });
        if (spaces === 'birak' || spaces === 'duzenle') {
            // IDS mm değeri girilmeden adımı kabul etmez.
            p.note('Boşluk miktarları kayıtlı formda yok; diş aralarındaki mm değerlerini elle girin', true);
        }
        [['ust', 'upper'], ['alt', 'lower']].forEach(function (arch) {
            p.radio(arch[0] + '_genislet', levelMap(arch[1] + 'Expand'), arch[0], true);
            p.radio(arch[0] + '_procline', levelMap(arch[1] + 'Procline'), arch[0], true);
            p.radio(arch[0] + '_ipr_anterior', levelMap(arch[1] + 'Anterior'), arch[0], true);
            p.radio(arch[0] + '_ipr_sag', levelMap(arch[1] + 'PosteriorRight'), arch[0], true);
            p.radio(arch[0] + '_ipr_sol', levelMap(arch[1] + 'PosteriorLeft'), arch[0], true);
        });
    }

    function buildExtraction(p) {
        const extraction = p.radio('dis_cekimi', {
            hicbiri: 'extraction.none', bu_disleri_cek: 'extraction.theseTeeth'
        });
        if (extraction === 'bu_disleri_cek') {
            const list = value(p.data, 'cekilecek_dis') || [];
            p.teeth('extraction_theseTeeth_tooth_', function (fdi) { return list.indexOf(fdi) >= 0; });
        }
    }

    // Ergen ve çocukta erüpsiyon kompansasyonu ve terminal azıdişi blokları. Comprehensive'de
    // ikisi de özel talimat sayfasındadır; refinement'ta ayrı sayfalara dağılır. Her blok yalnızca
    // sayfada varsa doldurulur.
    function buildTeenBlock(p) {
        buildEruption(p);
        buildTerminalTabs(p);
    }

    function buildEruption(p) {
        const d = p.data;
        if (!document.getElementById('SpacesForCanineAnd2ndBi.none')) return;
        const eruption = p.radio('erupsiyon_kompansasyonu', {
            hicbiri: 'SpacesForCanineAnd2ndBi.none', su_disler: 'SpacesForCanineAnd2ndBi.tooth'
        });
        if (eruption === 'su_disler') {
            Object.keys(ERUPTION_INDEX).forEach(function (fdi) {
                const id = 'spacesForCanineAnd2NdBi_' + ERUPTION_INDEX[fdi];
                // Ergen ızgarasında yalnızca 1.3-1.5, 2.3-2.5, 3.3-3.5, 4.3-4.5 bulunur; olmayan
                // kutular kayıtta da yoktur, atlanır.
                if (!document.getElementById(id)) return;
                p.ops.push({ kind: 'check', id: id, on: checked(d, 'erupsiyon_' + fdi), arch: archOf(fdi) });
            });
        }
    }

    function buildTerminalTabs(p) {
        const d = p.data;
        // "Hiçbiri" radyosu Comprehensive'de teenSecondMolarTabs.none, refinement'ta teenSecondMolarTabsNo.
        const noneId = ['teenSecondMolarTabs.none', 'teenSecondMolarTabsNo'].filter(function (id) {
            return document.getElementById(id);
        })[0];
        if (!noneId) return;
        const tabs = p.radio('terminal_azidisi', {
            hicbiri: noneId, su_isler: 'teenSecondMolarTabsYes'
        });
        if (tabs === 'su_isler') {
            // IDS'te her çeyrekte tek diş seçilebilir (radyo grubu); formda birden fazla
            // işaretliyse son tıklanan kalır, uyarı verilir.
            const perQuadrant = {};
            Object.keys(TERMINAL_INDEX).forEach(function (fdi) {
                if (!checked(d, 'terminal_' + fdi)) return;
                perQuadrant[fdi[0]] = (perQuadrant[fdi[0]] || 0) + 1;
                p.ops.push({ kind: 'radio', id: 'teenSecondMolarTabs_' + TERMINAL_INDEX[fdi], arch: archOf(fdi) });
            });
            Object.keys(perQuadrant).forEach(function (q) {
                if (perQuadrant[q] > 1) p.note(q + '. çeyrekte birden fazla terminal azıdişi işaretli; IDS tek diş kabul eder');
            });
            const stage = value(d, 'terminal_baslat_asama');
            if (stage) p.ops.push({ kind: 'text', id: 'teenSecondMolarTabs.startStage', value: String(stage) });
        }
    }

    // --- Refinement (Ek Hizalayıcılar) adımları; kimlikler docs/IDS_PAKET_FARKLARI.md ---

    function buildReason(p) {
        const reason = p.radio('basvuru_nedeni', {
            bitirme_iyilestirmeleri: 'reasonForSubmission.needsFinishingImprovements',
            disler_duzelt_izde_degil: 'reasonForSubmission.teethAreNotTracking',
            tedavi_plani_degisikligi: 'reasonForSubmission.treatmentPlanChange',
            yeni_restorasyon: 'reasonForSubmission.patientHasNewRestorationOrDentalWork',
            hasta_uyumlu_degildi: 'reasonForSubmission.patientWasNotCompliant',
            diger: 'reasonForSubmission.other'
        });
        if (reason === 'diger') p.text('reasonForSubmission.other.description', value(p.data, 'basvuru_nedeni_diger') || '');
        const upper = value(p.data, 'ust_hizalayici_numara');
        const lower = value(p.data, 'alt_hizalayici_numara');
        if (upper) p.text('currentStageUpper', String(upper));
        if (lower) p.text('currentStageLower', String(lower));
        if (!upper && !lower) {
            p.note('Hastanın kullandığı hizalayıcı numarası kayıtlı formda yok; üst/alt numarayı elle girin', true);
        }
    }

    function buildRefinementArch(p) {
        const ark = p.radio('tedavi_ark', {
            her_ikisi_de: 'treatedArch.both.both', ust: 'treatedArch.upper.upper', alt: 'treatedArch.lower.lower'
        });
        const opposite = function (key, base) {
            p.radio(key, {
                hicbir_sey_yoktur: base + '.nothingOnOppositeArch',
                pasif_alignerlar: base + '.passiveAlignersOppositeArch'
            });
        };
        if (ark === 'ust') opposite('ust_karsit_ark', 'treatedArch.upper');
        if (ark === 'alt') opposite('alt_karsit_ark', 'treatedArch.lower');
        p.radio('ust_ark_olcu', { evet: 'sendingNewPVSUpper.yes', hayir: 'sendingNewPVSUpper.no' });
        p.radio('alt_ark_olcu', { evet: 'sendingNewPVSLower.yes', hayir: 'sendingNewPVSLower.no' });
        p.radio('tedavi_plani_duzenleme', {
            rotus_ayarlari: 'treatmentPlanInstructions.finishingForTheCurrentToothPosition',
            son_dis_konumu: 'treatmentPlanInstructions.sameFinalToothPositionAsTheOriginalClinCheckTreatmentPlan',
            diger: 'treatmentPlanInstructions.Other'
        });
    }

    function buildRefinementTeeth(p) {
        const move = p.radio('dis_hareketi_sinirlamasi', {
            hicbiri: 'doNotMoveTeeth_none', belirli_disler: 'doNotMoveTeeth_theseTeeth'
        });
        if (move === 'belirli_disler') {
            const list = listed(p.data, 'dis_sinir');
            p.teeth('doNotMoveTeeth_theseTeeth_tooth_', function (fdi) { return list.indexOf(fdi) >= 0; });
        }
    }

    function buildRefinementAttachments(p) {
        const attach = p.radio('atasmanlar', {
            gerektiginde: 'teethPermittedForAttachments_anyTeeth',
            belirli_disler: 'teethPermittedForAttachments_doNotPutTheseTeeth'
        });
        if (attach === 'belirli_disler') {
            const list = listed(p.data, 'atasmanlar_dis');
            p.teeth('teethPermittedForAttachments_doNotPutTheseTeeth_tooth_', function (fdi) { return list.indexOf(fdi) >= 0; });
        }
        const existing = p.radio('mevcut_atasmanlar', {
            tum_cikar: 'existingAttachments_virtuallyRemoveExistingAttachments',
            secilen_cikar: 'existingAttachments_virtuallyRemoveSelectedAttachments',
            optimize_cikar: 'existingAttachments_virtuallyRemoveOptimizedAttachments',
            tut: 'existingAttachments_keepAllAttachments'
        });
        if (existing === 'secilen_cikar') {
            const list = listed(p.data, 'mevcut_atasmanlar_dis');
            p.teeth('existingAttachments_virtuallyRemoveSelectedAttachments_tooth_', function (fdi) { return list.indexOf(fdi) >= 0; });
        }
    }

    function buildRefinementIPR(p) {
        const ipr = p.radio('tedavi_ipr', {
            gerektiginde: 'ipr.performIPRAsNeeded',
            hic_yapma: 'ipr.doNotPerformAnyIPR',
            belirtilen_temaslar: 'ipr.doNotPerformIPROnSpecificContacts'
        });
        if (ipr === 'belirtilen_temaslar') {
            // Formda diş, IDS'te diş arası temas işaretlenir; eşleme belirsiz.
            const teeth = listed(p.data, 'ipr_dis');
            p.note('IPR yapılmayacak temasları IDS ızgarasında elle işaretleyin' +
                (teeth.length ? ' (formdaki dişler: ' + teeth.join(', ') + ')' : ''), true);
        }
        const past = p.radio('onceki_ipr', {
            onerilen: 'historicalipr.IPRPerformedAsPrescribed',
            gerceklestirilmemis: 'historicalipr.noIPRWasPerformed',
            belirlenen: 'historicalipr.performedIPRAsSpecified'
        });
        if (past === 'belirlenen') p.note('Önceki planda gerçekleştirilen IPR miktarlarını elle girin', true);
        const cuts = p.radio('hassas_kesimler', {
            hicbiri: 'precisionCutsQuestion.none',
            onceki_plan: 'precisionCutsQuestion.samePlacementAsPreviousTreatmentPlan',
            klinik_tercihler: 'precisionCutsQuestion.placePrecisionCutsAsNeeded',
            belirtilen: 'precisionCutsQuestion.placePrecisionCutsAsSpecified'
        });
        if (cuts === 'belirtilen') p.note('Hassas kesim yerlerini elle belirtin', true);
    }

    function buildRefinementInstructions(p) {
        const upper = value(p.data, 'tedavi_talimatlari_ust');
        const lower = value(p.data, 'tedavi_talimatlari_alt');
        if (upper && document.getElementById('upper.instruction')) p.text('upper.instruction', String(upper));
        if (lower && document.getElementById('lower.instruction')) p.text('lower.instruction', String(lower));
    }

    // Yetişkinde rezidüel boşluklar ve tedavi talimatları aynı sayfadadır (7); ergende talimatlar
    // ayrı sayfaya (8) çıkar, erüpsiyon ve terminal azıdişi blokları da ayrı sayfalarda olabilir.
    // Her parça yalnızca sayfada varsa doldurulur.
    function buildRefinementSpaces(p) {
        const residual = p.radio('reziduel_bosluklar', {
            hicbiri: 'residualSpaces.none', kapat: 'residualSpaces.residualSpaces'
        });
        if (residual === 'kapat') p.note('Rezidüel boşluk miktarlarını elle girin', true);
        buildRefinementInstructions(p);
        if (activePackage.teen) buildTeenBlock(p);
    }

    function buildRefinementInstructionsPage(p) {
        buildRefinementInstructions(p);
        if (activePackage.teen) buildTeenBlock(p);
    }

    function refinementSteps() {
        return [
            { name: 'Başvuru nedeni ve mevcut aşama', probe: 'reasonForSubmission.needsFinishingImprovements', build: buildReason },
            { name: 'Tedavi edilecek ark ve plan', probe: 'treatedArch.both.both', build: buildRefinementArch },
            { name: 'Diş hareketi sınırlamaları', probe: 'doNotMoveTeeth_none', build: buildRefinementTeeth },
            { name: 'A-P ilişkisi', probe: 'aPRelation.maintainRight', build: buildAP },
            { name: 'Ataşmanlar', probe: 'teethPermittedForAttachments_anyTeeth', build: buildRefinementAttachments },
            { name: 'IPR ve hassas kesimler', probe: 'ipr.performIPRAsNeeded', build: buildRefinementIPR },
            { name: 'Rezidüel boşluklar', probe: 'residualSpaces.none', build: buildRefinementSpaces },
            // Aşağıdakiler yalnızca ergende ayrı sayfa olarak çıkar (optional: elle geçilen adım
            // sayımında yok sayılır).
            { name: 'Tedavi talimatları', probe: 'upper.instruction', build: buildRefinementInstructionsPage, optional: true },
            { name: 'Erüpsiyon kompansasyonu', probe: 'SpacesForCanineAnd2ndBi.none', build: buildTeenBlock, optional: true },
            { name: 'Terminal azıdişi', probe: 'teenSecondMolarTabsNo', build: buildTerminalTabs, optional: true }
        ];
    }

    function buildInstructions(p) {
        p.ops.push({ kind: 'text', id: 'SpecInstructions', value: value(p.data, 'ozel_talimatlar') || '' });
        if (activePackage.teen) buildTeenBlock(p);
    }

    // Paketin adım listesi. Adım numaraları pakete göre kaydığı için adımlar sayfadaki
    // alan kimliğinden (probe) tanınır; liste sırası probe önceliğidir.
    function stepsFor(page) {
        if (page === 'refinement') return refinementSteps();
        const lite = page === 'lite' || page === 'express';
        const steps = [
            { name: 'Tedavi edilecek ark', probe: 'treatArches.both', build: buildArches },
            { name: 'Diş hareketi sınırlamaları ve ataşmanlar', probe: 'doNotMoveTeeth_none', build: buildTeeth }
        ];
        if (page !== 'express') steps.push({ name: 'A-P ilişkisi', probe: 'aPRelation.maintainRight', build: buildAP });
        if (lite) {
            steps.push({ name: 'Overjet ve overbite', probe: 'overjet.maintainInitialOverjet', build: function (p) {
                buildOverjet(p);
                buildOverbiteLite(p);
            } });
        } else {
            steps.push({ name: 'Overjet', probe: 'overjet.maintainInitialOverjet', build: buildOverjet });
            steps.push({ name: 'Overbite', probe: 'overbite.maintainResultant', build: buildOverbiteFull });
        }
        steps.push({ name: 'Bite Ramp', probe: 'biteRampsUpper_none', build: buildBiteRamps });
        steps.push({ name: lite ? 'Orta hat' : 'Orta hat ve posterior çapraz kapanış',
            probe: 'midline.showResultantMidlineAfterAlignment', build: buildMidline });
        steps.push({ name: 'Boşluk ve çapraşıklık', probe: 'spaces_closeAll', build: buildSpaces });
        if (page !== 'express') steps.push({ name: 'Diş çekimleri', probe: 'extraction.none', build: buildExtraction });
        steps.push({ name: 'Özel talimatlar', probe: 'SpecInstructions', build: buildInstructions });
        return steps;
    }

    function activeSteps() {
        return stepsFor(activePackage.page);
    }

    const SCAN_PROBE = 'dentalRecords.intraOralScan';

    // Sayfadaki adımın dizini; kayıt seçilmeden önce sayfanın yolundaki pakete göre bakılır.
    function currentStep() {
        const steps = stepsFor(pagePackage() || activePackage.page);
        for (let i = 0; i < steps.length; i++) {
            if (document.getElementById(steps[i].probe)) return i;
        }
        return -1;
    }

    // ---------- İşlemleri sayfaya uygulama ----------

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // "..._tooth_<i>" / "..._tooth_primary_<i>" kimliğinden FDI numarası.
    function fdiOfId(id) {
        const m = /_tooth_(primary_)?(\d+)$/.exec(id || '');
        if (!m) return null;
        const i = Number(m[2]);
        if (m[1]) {
            return Object.keys(PRIMARY_INDEX).filter(function (fdi) { return PRIMARY_INDEX[fdi] === i; })[0] || null;
        }
        return ALL_TEETH.filter(function (fdi) { return toothIndex(fdi) === i; })[0] || null;
    }

    function labelOf(element) {
        const label = (element.id && document.querySelector('label[for="' + CSS.escape(element.id) + '"]')) ||
            element.closest('label');
        const text = label ? label.textContent.trim().replace(/\s+/g, ' ') : '';
        if (text) return text.slice(0, 60);
        const fdi = fdiOfId(element.id);
        return fdi ? "diş " + fdi : element.id;
    }

    // IDS üst seçenek seçilince alt seçenekleri kendi betiğiyle açar; kapalı bir alan
    // kısa süre beklenir. Hâlâ kapalıysa IDS o seçeneğe izin vermiyor demektir.
    async function applyOp(op) {
        if (op.kind === 'note') return op.text;
        const element = document.getElementById(op.id);
        if (!element) return 'IDS\'te alan bulunamadı: ' + op.id;
        if (op.kind === 'text') {
            if (element.value === op.value) return null;
            element.focus();
            element.value = op.value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.blur();
            return null;
        }
        const want = op.kind === 'radio' ? true : op.on;
        if (element.checked === want) return null;
        for (let i = 0; i < 8 && element.disabled; i++) await sleep(150);
        if (element.disabled) {
            return want ? 'IDS\'te pasif, seçilemedi: ' + labelOf(element) : null;
        }
        element.click();
        await sleep(40);
        if (element.checked !== want) return 'IDS seçimi kabul etmedi: ' + labelOf(element);
        return null;
    }

    async function fillStep(index, data) {
        const steps = activeSteps();
        const plan = new Plan(data);
        steps[index].build(plan);
        const problems = [];
        const skipped = [];
        let stop = false;
        for (const op of plan.ops) {
            if (stopRequested) break;
            if (op.stop) stop = true;
            if (op.arch && !plan.treats(op.arch)) {
                if (!op.quiet && (op.kind === 'radio' || op.on)) {
                    const element = document.getElementById(op.id);
                    skipped.push(element ? labelOf(element) : op.id);
                }
                continue;
            }
            const problem = await applyOp(op);
            if (problem) problems.push(problem);
        }
        if (skipped.length) {
            // "IDS" ile başlamadığından akışı durdurmaz; günlükte uyarı olarak görünür.
            problems.push((plan.arch === 'ust' ? 'Alt' : 'Üst') +
                ' çene tedavi edilmediğinden şu seçimler atlandı: ' + skipped.join(', '));
        }
        return { step: steps[index].name, problems: problems, stop: stop };
    }

    // ---------- Durum (adımlar arası sayfa yenilenir) ----------

    function patientIdParam() {
        return new URLSearchParams(location.search).get('patientId') || '';
    }

    // Reçete adımlarının "İleri" düğmesi; refinement 1. adımında kimliksiz input.next-button.
    function nextButton() {
        return document.querySelector('input[type="submit"]#form_0') ||
            document.querySelector('input.next-button, button.nextButton');
    }

    function formId() {
        return new URLSearchParams(location.search).get('formId') ||
            (document.querySelector('input[name="formId"]') || {}).value || '';
    }

    function loadState() {
        return new Promise(function (resolve) {
            chrome.storage.local.get(STATE_KEY, function (stored) {
                const state = stored[STATE_KEY];
                if (!state) return resolve(null);
                if (state.formId === formId()) return resolve(state);
                // Refinement 1. adımda formId -1'dir; gönderilince gerçek kimlik gelir.
                if (state.formId === '-1' && state.patientId && state.patientId === patientIdParam()) {
                    state.formId = formId();
                    return resolve(state);
                }
                resolve(null);
            });
        });
    }

    function saveState(state) {
        return new Promise(function (resolve) {
            const entry = {};
            entry[STATE_KEY] = state;
            chrome.storage.local.set(entry, resolve);
        });
    }

    // Yeni hasta sayfasında seçilen kayıt; reçete adımlarında kendiliğinden seçilsin diye saklanır.
    function savePick(record) {
        return new Promise(function (resolve) {
            const entry = {};
            entry[PICK_KEY] = { id: record.id, at: Date.now() };
            chrome.storage.local.set(entry, resolve);
        });
    }

    function loadPick() {
        return new Promise(function (resolve) {
            chrome.storage.local.get(PICK_KEY, function (stored) {
                const pick = stored[PICK_KEY];
                resolve(pick && Date.now() - pick.at < PICK_TTL_MS ? pick : null);
            });
        });
    }

    function clearState() {
        return new Promise(function (resolve) { chrome.storage.local.remove(STATE_KEY, resolve); });
    }

    function ask(message) {
        return new Promise(function (resolve, reject) {
            // Eklenti yenilenince açık sayfadaki eski betik arka planla konuşamaz.
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

    // ---------- Hasta eşleştirme ----------

    function patientName() {
        const header = document.querySelector('.patientHeader .patientName');
        return header ? header.textContent.trim().split('\n')[0].trim() : '';
    }

    function tokens(text) {
        return (text || '').toLocaleLowerCase('tr')
            .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o')
            .replace(/ş/g, 's').replace(/ü/g, 'u')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9]+/).filter(Boolean).sort();
    }

    // 2: ad ve soyad sözcükleri birebir aynı, 1: biri diğerini kapsıyor, 0: eşleşmiyor.
    function matchScore(idsName, record) {
        const a = tokens(idsName);
        const b = tokens(record.hasta_adi + ' ' + record.hasta_soyadi);
        if (!a.length || !b.length) return 0;
        if (a.join(' ') === b.join(' ')) return 2;
        const inside = function (x, y) { return x.every(function (t) { return y.indexOf(t) >= 0; }); };
        return inside(a, b) || inside(b, a) ? 1 : 0;
    }

    // Yazarken arama: aramadaki her sözcük kayıttaki bir sözcüğün başıyla tutmalı.
    // Arama boşsa tüm kayıtlar listelenir.
    function searchScore(query, record) {
        const wanted = tokens(query);
        const have = tokens(record.hasta_adi + ' ' + record.hasta_soyadi);
        return wanted.every(function (w) {
            return have.some(function (h) { return h.indexOf(w) === 0; });
        }) ? 1 : 0;
    }

    function supported(record) {
        return !!packageOf(record);
    }

    function describeRecord(record) {
        const date = record.createdAt ? new Date(record.createdAt).toLocaleDateString('tr-TR') : 'tarihsiz';
        const paket = record.tedavi_secenegi || record.tedavi_secenegi_ergen || record.tedavi_secenegi_cocuk_first || '';
        const tur = record.form_turu && record.form_turu !== 'yeni_hasta' ? ' · ' + record.form_turu : '';
        return record.hasta_soyadi + ', ' + record.hasta_adi + ' · ' + date + ' · ' +
            (record.hasta_tipi || '?') + ' ' + paket + tur;
    }

    // ---------- Panel ----------

    let panel = null;

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

    function ensurePanel() {
        if (panel) return panel.querySelector('.idsfy-body');
        panel = el('div', 'idsfy-panel idsfy-rx');
        const head = el('div', 'idsfy-head');
        head.appendChild(el('span', '', 'IDS Form Doldurucu'));
        const toggle = el('button', 'idsfy-toggle', '–');
        toggle.type = 'button';
        toggle.addEventListener('click', function () {
            toggle.textContent = panel.classList.toggle('idsfy-collapsed') ? '+' : '–';
        });
        head.appendChild(toggle);
        panel.appendChild(head);
        panel.appendChild(el('div', 'idsfy-body'));
        document.body.appendChild(panel);
        return panel.querySelector('.idsfy-body');
    }

    function showLog(body, state) {
        const order = logOrder();
        const entries = (state.log || []).slice().sort(function (a, b) {
            return order.indexOf(a.step) - order.indexOf(b.step);
        });
        entries.forEach(function (entry) {
            // Kullanıcı "Devam et" ile tamamladığı adımın uyarıları kapanmış sayılır; elle geçilen
            // adımlar ayrıca belirtilir.
            const open = entry.problems.length > 0 && !entry.resolved;
            const row = el('div', 'idsfy-row' + (open ? ' idsfy-row-error' : ''));
            const tail = entry.manual ? ' · elle dolduruldu' :
                (entry.problems.length && entry.resolved ? ' · elle tamamlandı' : '');
            row.appendChild(el('span', 'idsfy-label', (open ? '⚠ ' : '✓ ') + entry.step + tail));
            if (open) {
                entry.problems.forEach(function (problem) {
                    row.appendChild(el('span', 'idsfy-warning', problem));
                });
            }
            body.appendChild(row);
        });
    }

    function scanSummary(data) {
        const parts = [];
        const type = value(data, 'tarama_turu');
        if (type) parts.push(type === 'pvs' ? 'PVS ölçü' : 'İntraoral tarama');
        const code = value(data, 'itero_siparis_kodu');
        if (code) parts.push('iTero: ' + code);
        if (checked(data, 'intraoral_tarama_yok')) parts.push('intraoral tarama mevcut değil');
        if (checked(data, 'cbct_tara')) parts.push('CBCT Tara işaretli');
        return parts.join(' · ');
    }

    function stepUrl(step) {
        return location.pathname + '?formId=' + encodeURIComponent(formId()) + '&step=' + step;
    }

    // Kayıt seçici: arama kutusu + eşleşen kayıtlar + eylem düğmesi. Reçete adımlarında
    // (IDS'teki hasta adıyla) ve yeni hasta sayfasında (boş aramayla) kullanılır.
    async function showPicker(options) {
        const body = ensurePanel();
        body.textContent = '';
        body.appendChild(el('div', 'idsfy-status', options.intro));
        if (options.message) body.appendChild(el('div', 'idsfy-status idsfy-error', options.message));
        const query = el('input', 'idsfy-input');
        query.type = 'text';
        query.placeholder = 'Kayıtlı formlarda ara (ad soyad)';
        query.value = options.query || '';
        body.appendChild(query);
        const list = el('div', 'idsfy-list');
        body.appendChild(list);
        const start = button(options.action, function () { options.onPick(selected); });
        start.disabled = true;
        body.appendChild(start);

        let records = [];
        let selected = null;
        const picked = await loadPick();

        function renderList() {
            list.textContent = '';
            selected = null;
            start.disabled = true;
            const preferred = function (record) { return !!options.preferId && record.id === options.preferId; };
            const scored = records.map(function (record) {
                return { record: record, score: options.score(query.value, record) };
            }).filter(function (item) { return item.score > 0 || preferred(item.record); });
            // Önce önerilen kayıt, sonra eşleşme gücü, IDS'e henüz girilmemiş olanlar, en yeni kayıt.
            scored.sort(function (x, y) {
                const refinementLast = function (r) { return options.preferNew && r.form_turu === 'refinement' ? 1 : 0; };
                return (preferred(y.record) ? 1 : 0) - (preferred(x.record) ? 1 : 0) ||
                    y.score - x.score || refinementLast(x.record) - refinementLast(y.record) ||
                    (x.record.checked_in ? 1 : 0) - (y.record.checked_in ? 1 : 0) ||
                    String(y.record.createdAt).localeCompare(String(x.record.createdAt));
            });
            if (!scored.length) {
                list.appendChild(el('div', 'idsfy-info', 'Bu isimle kayıtlı form bulunamadı.'));
                return;
            }
            const select = function (radio, record) {
                radio.checked = true;
                selected = record;
                start.disabled = false;
            };
            scored.slice(0, 8).forEach(function (item, index) {
                const row = el('label', 'idsfy-row idsfy-choice');
                const radio = el('input');
                radio.type = 'radio';
                radio.name = 'idsfy-record';
                const ok = options.usable(item.record);
                radio.disabled = !ok;
                radio.addEventListener('change', function () { select(radio, item.record); });
                row.appendChild(radio);
                row.appendChild(el('span', 'idsfy-info', describeRecord(item.record)));
                if (preferred(item.record)) row.appendChild(el('span', 'idsfy-info', '(önerilen)'));
                if (item.record.checked_in) row.appendChild(el('span', 'idsfy-info', '(IDS girişi yapıldı olarak işaretli)'));
                if (!ok) row.appendChild(el('span', 'idsfy-warning', 'Bu form türü/paketi henüz desteklenmiyor'));
                list.appendChild(row);
                if (!ok || !options.autoSelect) return;
                // Yeni hasta sayfasında seçilen kayıt ya da tek ve birebir ad eşleşmesi kendiliğinden seçilir.
                const wasPicked = picked && picked.id === item.record.id;
                const exact = options.exactScore || 2;
                const onlyExact = index === 0 && item.score >= exact && (scored.length === 1 || scored[1].score < exact);
                const firstMatch = options.preferFirst && index === 0 && item.score >= exact;
                if (preferred(item.record) || wasPicked || ((onlyExact || firstMatch) && !selected)) select(radio, item.record);
            });
        }

        query.addEventListener('input', renderList);
        list.appendChild(el('div', 'idsfy-info', 'Kayıtlı formlar okunuyor…'));
        try {
            records = (await ask({ type: 'ids-forms-list' })).records;
            renderList();
        } catch (error) {
            list.textContent = '';
            list.appendChild(el('div', 'idsfy-status idsfy-error', 'Kayıtlar okunamadı: ' + error.message));
        }
    }

    // preferId: önerilen kayıt (ürün seçiminden ya da hasta dosyasından gelen); listede başa alınır ve seçili gelir.
    function showSearch(message, preferId) {
        const idsName = patientName();
        return showPicker({
            intro: 'IDS hastası: ' + (idsName || '(okunamadı)') + '. Doldurulacak kaydı seçip "Formu doldur"a basın.',
            message: message,
            query: idsName,
            action: 'Formu doldur',
            score: matchScore,
            usable: supported,
            autoSelect: true,
            preferId: preferId || null,
            onPick: onStart
        });
    }

    // ---------- Yeni hasta sayfası ----------
    // Kayıtlı formda yalnızca ad, soyad ve MI vardır; cinsiyet, doğum tarihi ve T.C. kimlik
    // numarasını hastayı oluşturan kişi IDS'te kendisi girer.

    const NAME_FIELDS = {
        hasta_soyadi: 'form_patientInfo_lastName',
        hasta_adi: 'form_patientInfo_firstName',
        hasta_mi: 'form_patientInfo_middleName'
    };

    // IDS'e ad ve soyad Türkçe karaktersiz yazılır (Çağrı Şahin -> Cagri Sahin).
    const ASCII = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };

    function withoutTurkish(text) {
        return (text || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, function (letter) { return ASCII[letter]; })
            .normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function setText(element, text) {
        element.focus();
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
    }

    // ---------- Dentsoft köprüsü ----------
    // dentsoft.js hasta kartından aldığı bilgileri chrome.storage.local'a yazar; burada Yeni hasta
    // formuna aktarılır. Bilgi 3 saat geçerlidir.
    const DENTSOFT_KEY = 'dentsoftPatient';
    const DENTSOFT_TTL = 3 * 60 * 60 * 1000;

    function dentsoftPatient() {
        return new Promise(function (resolve) {
            chrome.storage.local.get(DENTSOFT_KEY, function (stored) {
                const p = stored && stored[DENTSOFT_KEY];
                resolve(p && p.ad && Date.now() - (p.at || 0) < DENTSOFT_TTL ? p : null);
            });
        });
    }

    function describeDentsoft(p) {
        const parts = [p.soyad + ', ' + p.ad];
        if (p.dogum) parts.push(p.dogum.split('-').reverse().join('/'));
        if (p.cinsiyet) parts.push(p.cinsiyet === 'erkek' ? 'Erkek' : 'Kadın');
        if (p.tc) parts.push('T.C. ' + p.tc.slice(0, 3) + '…');
        return 'Dentsoft: ' + parts.join(' · ');
    }

    // IDS Yeni hasta formunun kimlik dışı alanları yer tutucu ve etiketle bulunur (IDS id vermiyor).
    function newPatientFields() {
        const form = document.getElementById(NAME_FIELDS.hasta_soyadi)?.closest('form') || document;
        const texts = [...form.querySelectorAll('input[type="text"]')].filter(function (f) { return f.offsetParent; });
        const byPlaceholder = function (ph) { return texts.find(function (f) { return (f.placeholder || '').trim() === ph; }) || null; };
        const day = byPlaceholder('GG'), month = byPlaceholder('AA'), year = byPlaceholder('YYYY');
        const known = new Set([day, month, year].concat(Object.keys(NAME_FIELDS).map(function (k) { return document.getElementById(NAME_FIELDS[k]); })));
        // T.C. kimlik no: yıl kutusundan sonraki ilk bilinmeyen metin kutusu
        let tc = null;
        if (year) {
            const after = texts.slice(texts.indexOf(year) + 1);
            tc = after.find(function (f) { return !known.has(f); }) || null;
        }
        const radios = [...form.querySelectorAll('input[type="radio"]')];
        const radioByLabel = function (pattern) {
            return radios.find(function (r) {
                const label = (r.labels && r.labels[0] && r.labels[0].innerText) || (r.closest('label') || {}).innerText ||
                    (r.nextElementSibling || {}).innerText || (r.parentElement || {}).innerText || '';
                return pattern.test(label);
            }) || null;
        };
        return { day: day, month: month, year: year, tc: tc, male: radioByLabel(/Erkek/), female: radioByLabel(/Kad[ıi]n/) };
    }

    function fillFromDentsoft(p) {
        const problems = [];
        const first = document.getElementById(NAME_FIELDS.hasta_adi);
        const last = document.getElementById(NAME_FIELDS.hasta_soyadi);
        const middle = document.getElementById(NAME_FIELDS.hasta_mi);
        if (first) setText(first, withoutTurkish(p.ad));
        if (last) setText(last, withoutTurkish(p.soyad));
        if (middle) setText(middle, '');
        const f = newPatientFields();
        if (p.dogum && /^\d{4}-\d{2}-\d{2}$/.test(p.dogum)) {
            const parts = p.dogum.split('-');
            if (f.day && f.month && f.year) {
                setText(f.day, parts[2]); setText(f.month, parts[1]); setText(f.year, parts[0]);
            } else problems.push('doğum tarihi kutuları bulunamadı');
        } else problems.push('Dentsoft\'ta doğum tarihi yok');
        if (p.cinsiyet) {
            const radio = p.cinsiyet === 'erkek' ? f.male : f.female;
            if (radio) { radio.click(); if (!radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); } }
            else problems.push('cinsiyet seçeneği bulunamadı');
        } else problems.push('Dentsoft\'ta cinsiyet yok');
        if (p.tc) {
            if (f.tc) setText(f.tc, p.tc); else problems.push('T.C. kimlik kutusu bulunamadı');
        } else problems.push('Dentsoft\'ta T.C. kimlik no yok');
        return problems;
    }

    function nameFieldsEmpty() {
        return ['hasta_soyadi', 'hasta_adi'].every(function (key) {
            const field = document.getElementById(NAME_FIELDS[key]);
            return !field || !String(field.value || '').trim();
        });
    }

    // Dentsoft'tan "IDS'e aktar" ile gelen hasta: Yeni hasta sayfası açılır açılmaz kimlik alanları
    // dolar (bir kez; sonra "applied" işaretlenir), Rxalign'daki kayıt ada göre aranır ve tek kesin
    // eşleşme varsa seçilir. Kullanıcı yalnızca kontrol edip "İleri"ye basar.
    // Bu sekme Dentsoft'taki "IDS'e aktar" ile mi açıldı? (window.name ya da aktarımdan hemen sonra)
    function openedFromDentsoft(p) {
        return !!p && !p.applied && (window.name === 'idsfy-dentsoft' || Date.now() - (p.at || 0) < 2 * 60000);
    }

    // Kullanıcı kararı: kimlik alanları yalnızca "IDS'e aktar" ile açılan sekmede kendiliğinden dolar;
    // Rxalign kaydı kendiliğinden seçilmez, en olası kayıt işaretli gelir ve arama kutusu açık kalır.
    async function showNewPatient(message) {
        const p = await dentsoftPatient();
        const fromDentsoft = openedFromDentsoft(p);
        let dentsoftStatus = null;
        if (fromDentsoft && nameFieldsEmpty()) {
            const problems = fillFromDentsoft(p);
            await markDentsoftApplied(p);
            dentsoftStatus = problems.length
                ? 'Dentsoft bilgileri dolduruldu, eksikler: ' + problems.join(', ') + '.'
                : 'Ad, soyad, cinsiyet, doğum tarihi ve T.C. kimlik no Dentsoft\'tan dolduruldu.';
        }
        const dentsoftFilled = !!dentsoftStatus;
        return showPicker({
            intro: fromDentsoft
                ? 'Yeni hasta: Rxalign kaydı "' + p.soyad + ' ' + p.ad + '" adıyla arandı; işaretli kaydı onaylayın ya da başka kayıt arayın.'
                : 'Yeni hasta: kayıtlı formu seçin, ad ve soyad doldurulsun.',
            message: message,
            query: fromDentsoft ? (p.soyad + ' ' + p.ad) : '',
            action: dentsoftFilled ? 'Bu kaydı kullan' : 'Adı ve soyadı doldur',
            score: searchScore,
            exactScore: 1,
            usable: function () { return true; },
            autoSelect: fromDentsoft,
            preferFirst: fromDentsoft,
            preferNew: true,
            onPick: async function (record) {
                if (!record) return;
                // Dentsoft doldurduysa resmi yazım korunur; aksi halde ad/soyad kayıttan yazılır.
                if (!dentsoftFilled) {
                    Object.keys(NAME_FIELDS).forEach(function (key) {
                        const field = document.getElementById(NAME_FIELDS[key]);
                        if (field) setText(field, withoutTurkish(record[key]));
                    });
                }
                await savePick(record);
                const body = ensurePanel();
                body.textContent = '';
                body.appendChild(el('div', 'idsfy-info', describeRecord(record)));
                body.appendChild(el('div', 'idsfy-status', dentsoftFilled
                    ? 'Kayıt seçildi. ' + dentsoftStatus + ' Kontrol edip "İleri"ye basın; reçete adımlarında bu kayıt kullanılacak.'
                    : 'Ad ve soyad dolduruldu. Cinsiyet, doğum tarihi ve T.C. kimlik numarasını girip "İleri"ye basın. ' +
                      'Reçete adımlarında bu kayıt kendiliğinden seçilecek.'));
                body.appendChild(button('Başka kayıt seç', function () { showNewPatient(); }));
                if (fromDentsoft) addDentsoftBlock(dentsoftStatus);
            }
        }).then(function (result) {
            if (fromDentsoft) addDentsoftBlock(dentsoftStatus);
            return result;
        });
    }

    function markDentsoftApplied(p) {
        return new Promise(function (resolve) {
            const entry = {};
            entry[DENTSOFT_KEY] = Object.assign({}, p, { applied: true });
            chrome.storage.local.set(entry, resolve);
        });
    }

    // Yeni hasta panelinin üstüne Dentsoft'tan alınan hastayı ve doldurma düğmesini ekler.
    async function addDentsoftBlock(statusText) {
        const p = await dentsoftPatient();
        if (!p) return;
        const body = ensurePanel();
        if (body.querySelector('.idsfy-dentsoft')) return;
        const block = el('div', 'idsfy-dentsoft');
        block.appendChild(el('div', 'idsfy-info', describeDentsoft(p)));
        if (statusText) block.appendChild(el('div', 'idsfy-status', statusText));
        block.appendChild(button('Dentsoft bilgileriyle doldur', function () {
            const problems = fillFromDentsoft(p);
            const status = block.querySelector('.idsfy-status') || block.appendChild(el('div', 'idsfy-status'));
            status.textContent = problems.length
                ? 'Dolduruldu, eksikler: ' + problems.join(', ') + '. Kontrol edip "İleri"ye basın.'
                : 'Ad, soyad, cinsiyet, doğum tarihi ve T.C. kimlik no dolduruldu. Kontrol edip "İleri"ye basın.';
            status.classList.toggle('idsfy-error', problems.length > 0);
        }));
        body.insertBefore(block, body.firstChild);
    }

    async function onStart(record) {
        if (!record) return;
        const info = packageOf(record);
        if (!info) return;
        if (pagePackage() && pagePackage() !== info.page) {
            showSearch('Kayıtlı form "' + info.paket + '" paketi, açılan reçete ise "' + pagePackage() +
                '". Paketi IDS\'te değiştirin ya da başka kayıt seçin.');
            return;
        }
        const body = ensurePanel();
        body.textContent = '';
        body.appendChild(el('div', 'idsfy-status', 'Kayıtlı form okunuyor…'));
        try {
            const data = (await ask({ type: 'ids-form-get', id: record.id })).data;
            setPackage(info);
            await saveState({
                formId: formId(), docId: record.id, title: describeRecord(record), data: data, pkg: info.key, patientId: patientIdParam(),
                auto: true, submitted: -1, log: [], tab: tabToken()
            });
            // Doldurma her zaman 1. adımdan başlar.
            if (currentStep() === 0) run(); else location.href = stepUrl(1);
        } catch (error) {
            showSearch('Kayıt okunamadı: ' + error.message);
        }
    }

    // ---------- Boşluk ızgarası: ekran görüntüsünden mm okuma ----------
    // Boşluk sayfalarında (Comprehensive 8 "Belli boşluklar bırak", refinement 7 rezidüel boşluklar)
    // panelde yapıştırma kutusu çıkar: kullanıcı ekran görüntüsünü (Win+Shift+S) Ctrl+V ile yapıştırır,
    // görüntü arka planda modele gönderilir, okunan diş arası mm değerleri ızgaraya yazılır (kullanıcı
    // kararı). Izgara dizini: üst 0-14 (1.8-1.7 … 2.7-2.8), alt 16-30 (3.8-3.7 … 4.7-4.8); dizin = iki
    // dişten küçük Universal numarası - 1 (Universal: 1.8=1 … 2.8=16, 3.8=17 … 3.1=24, 4.1=25 … 4.8=32).

    function spaceInputs() {
        const map = {};
        Array.from(document.querySelectorAll('input[id*="Array_"][id*="__amount"]')).forEach(function (input) {
            const m = /Array_(\d+)__amount/.exec(input.id);
            if (m) map[Number(m[1])] = input;
        });
        return map;
    }

    function universalOf(fdi) {
        const q = Number(fdi[0]);
        const n = Number(fdi[fdi.length - 1]);
        if (!(n >= 1 && n <= 8)) return null;
        if (q === 1) return 9 - n;
        if (q === 2) return 8 + n;
        if (q === 3) return 25 - n;
        if (q === 4) return 24 + n;
        return null;
    }

    function contactIndex(pair) {
        const m = /([1-4]\.?[1-8])\D+([1-4]\.?[1-8])/.exec(pair || '');
        if (!m) return null;
        const norm = function (t) { return t.length === 2 ? t[0] + '.' + t[1] : t; };
        const a = universalOf(norm(m[1]));
        const b = universalOf(norm(m[2]));
        if (a === null || b === null || Math.abs(a - b) !== 1) return null;
        const low = Math.min(a, b);
        if (low === 16) return null; // üst-alt sınırı (2.8 ile 3.8 arası diye bir temas yok)
        return low - 1;
    }

    function imageToJpeg(blob, maxSide) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = function () {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('görüntü okunamadı'));
            };
            img.src = url;
        });
    }

    async function fillSpacesFrom(blob, note, state) {
        try {
            note.textContent = 'Görüntü okunuyor…';
            note.classList.remove('idsfy-error');
            const data = await imageToJpeg(blob, 1600);
            const result = (await ask({ type: 'ids-spaces', image: { media_type: 'image/jpeg', data: data } })).result;
            const contacts = result.contacts || [];
            // Izgara "boşluk bırak" seçeneğiyle etkinleşir.
            ['residualSpaces.residualSpaces', 'spaces_leaveSpaces'].forEach(function (id) {
                const radio = document.getElementById(id);
                if (radio && !radio.checked) radio.click();
            });
            await sleep(300);
            const inputs = spaceInputs();
            const written = [];
            const skipped = [];
            contacts.forEach(function (contact) {
                const index = contactIndex(contact.teeth);
                const mm = Math.round(Number(contact.mm) * 100) / 100;
                if (index === null || !inputs[index] || !(mm > 0)) {
                    skipped.push(contact.teeth + ' ' + contact.mm);
                    return;
                }
                setText(inputs[index], String(mm));
                written.push(contact.teeth + ' ' + mm + ' mm');
            });
            let text = written.length
                ? 'Giriş yapıldı (' + written.length + ' boşluk): ' + written.join(', ') + '.'
                : 'Görüntüde okunabilen boşluk değeri yok.';
            if (skipped.length) text += ' Eşlenemeyen: ' + skipped.join(', ') + '.';
            const notes = String(result.notes || '').replace(/[{}\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (notes) text += ' Not: ' + notes;
            if (!written.length) {
                note.textContent = text;
                note.classList.add('idsfy-error');
                return;
            }
            if (state) {
                // Elle giriş notu karşılandı: adım "elle tamamlandı" sayılır; panel yenilenir ki günlükte
                // uyarı kapansın ve sonuç durum satırında görünsün.
                const step = currentStep();
                const entry = step >= 0 && state.log.filter(function (e) { return e.step === activeSteps()[step].name; })[0];
                if (entry && entry.problems.length) entry.resolved = true;
                await saveState(state);
                showProgress(state, text + ' Devam edilsin mi? Izgarayı kontrol edip "Devam et"e basın.', false);
                return;
            }
            note.textContent = text + ' Izgarayı kontrol edip "Devam et"e basın.';
        } catch (error) {
            note.textContent = 'Okunamadı: ' + error.message;
            note.classList.add('idsfy-error');
        }
    }

    function pasteBox(state) {
        const wrap = el('div', 'idsfy-paste-wrap');
        wrap.appendChild(el('div', 'idsfy-info',
            'Boşluk ölçülerini ekran görüntüsünden doldurma: Win+Shift+S ile ölçülerin göründüğü alanı kırpın, ' +
            'sonra aşağıdaki kutuya tıklayıp Ctrl+V ile yapıştırın.'));
        const box = el('div', 'idsfy-paste', 'Ekran görüntüsünü buraya yapıştırın (Ctrl+V)');
        box.tabIndex = 0;
        box.contentEditable = 'true';
        box.spellcheck = false;
        const note = el('div', 'idsfy-status', '');
        const take = function (file) {
            if (!file) {
                note.textContent = 'Panoda görüntü yok; önce Win+Shift+S ile ekran görüntüsü alın.';
                note.classList.add('idsfy-error');
                return;
            }
            fillSpacesFrom(file, note, state);
        };
        box.addEventListener('paste', function (event) {
            event.preventDefault();
            const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
            const item = items.filter(function (it) { return it.type.indexOf('image/') === 0; })[0];
            take(item ? item.getAsFile() : null);
        });
        box.addEventListener('drop', function (event) {
            event.preventDefault();
            const file = Array.from((event.dataTransfer && event.dataTransfer.files) || [])
                .filter(function (f) { return f.type.indexOf('image/') === 0; })[0];
            take(file || null);
        });
        box.addEventListener('dragover', function (event) { event.preventDefault(); });
        box.addEventListener('input', function () { box.textContent = 'Ekran görüntüsünü buraya yapıştırın (Ctrl+V)'; });
        wrap.appendChild(box);
        wrap.appendChild(note);
        return wrap;
    }

    function showProgress(state, status, isError) {
        const body = ensurePanel();
        body.textContent = '';
        body.appendChild(el('div', 'idsfy-info', state.title));
        body.appendChild(el('div', 'idsfy-status' + (isError ? ' idsfy-error' : ''), status));
        const list = el('div', 'idsfy-list');
        showLog(list, state);
        body.appendChild(list);
        if (currentStep() >= 0 && Object.keys(spaceInputs()).length) body.appendChild(pasteBox(state));
        if (state.auto) {
            body.appendChild(button('Durdur', async function () {
                stopRequested = true;
                stopHeartbeat();
                state.auto = false;
                await saveState(state);
                showProgress(state, 'Durduruldu. IDS\'te elle sürdürebilirsiniz; eklenti bu reçeteye dokunmaz. ' +
                    'Kaldığı yerden sürdürmek için "Devam et".', false);
            }));
        } else {
            if (currentStep() >= 0 || postStep()) {
                body.appendChild(button('Devam et', async function () {
                    stopRequested = false;
                    state.auto = true;
                    state.submitted = -1;
                    state.tab = tabToken();
                    markManual(state);
                    const step = currentStep();
                    const entry = step >= 0 && state.log.filter(function (e) {
                        return e.step === activeSteps()[step].name && e.problems.length;
                    })[0];
                    const next = nextButton();
                    if (entry && next) {
                        // Kullanıcı sorunlu adımı denetleyip tamamladı: yeniden doldurup aynı sorunla
                        // durmak yerine adım olduğu gibi gönderilir; günlükte uyarı kapanır.
                        entry.resolved = true;
                        state.submitted = step;
                        state.submittedAt = Date.now();
                        await saveState(state);
                        showProgress(state, 'Sonraki adıma geçiliyor…', false);
                        next.click();
                        return;
                    }
                    // Reçete sonrası adımda (ör. Tara) kullanıcının elle yaptığı seçim korunur.
                    state.resumed = postStep();
                    await saveState(state);
                    run();
                }));
                const stepNow = currentStep();
                const nextNow = nextButton();
                if (stepNow >= 0 && nextNow) {
                    // Kullanıcı bu adımı elle doldurdu: sayfadaki seçimler olduğu gibi gönderilir,
                    // kayıttan doldurma sonraki adımda sürer.
                    body.appendChild(button('Elle bitirdim, sonraki adımdan sür', async function () {
                        stopRequested = false;
                        state.auto = true;
                        state.submitted = stepNow;
                        state.submittedAt = Date.now();
                        state.tab = tabToken();
                        markManual(state);
                        const stepName = activeSteps()[stepNow].name;
                        const entry = state.log.filter(function (e) { return e.step === stepName; })[0];
                        if (entry) entry.resolved = true;
                        else state.log.push({ step: stepName, problems: [], manual: true });
                        await saveState(state);
                        showProgress(state, 'Sonraki adıma geçiliyor…', false);
                        nextNow.click();
                    }));
                }
            }
            body.appendChild(button('Başka kayıt seç', async function () {
                await clearState();
                showSearch();
            }));
        }
    }

    // ---------- Sekme ve hasta eşlemesi ----------

    // Otomatik doldurma, onu başlatan sekmeye aittir; aynı reçete başka sekmede açılırsa
    // o sekme duruma dokunmaz.
    function tabToken() {
        let token = sessionStorage.getItem('idsfy-tab');
        if (!token) {
            token = Date.now() + '-' + Math.random().toString(36).slice(2);
            sessionStorage.setItem('idsfy-tab', token);
        }
        return token;
    }

    // Dolduran sekme ayrı bir anahtara düzenli kalp atışı yazar; başka bir sekme ancak bu atış
    // eskiyince (sekme kapanmış, yarıda bırakılmış) durumu devralır.
    let heartbeatTimer = null;

    function startHeartbeat() {
        if (heartbeatTimer) return;
        const beat = function () { setStored(HEARTBEAT_KEY, { tab: tabToken(), at: Date.now() }); };
        beat();
        heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    // "Durdur" doldurma sürerken basılmış olabilir: döngüler bu bayrağa bakar, sayfa ilerletilmeden
    // önce kayıtlı durum yeniden okunur. Durdurulunca eklenti o reçeteye dokunmaz; kullanıcı IDS'te
    // elle sürdürür, isterse "Devam et" ile kaldığı yerden yeniden başlatır.
    let stopRequested = false;

    async function shouldStop(state) {
        if (stopRequested) return true;
        const stored = await loadState();
        if (stored && stored.auto === false) {
            state.auto = false;
            return true;
        }
        return false;
    }

    async function otherTabAlive(tab) {
        const beat = await getStored(HEARTBEAT_KEY);
        return !!(beat && beat.tab === tab && Date.now() - beat.at < HEARTBEAT_STALE_MS);
    }

    function getStored(key) {
        return new Promise(function (resolve) {
            chrome.storage.local.get(key, function (stored) { resolve(stored[key]); });
        });
    }

    function setStored(key, value) {
        return new Promise(function (resolve) {
            const entry = {};
            entry[key] = value;
            chrome.storage.local.set(entry, resolve);
        });
    }

    // IDS hasta numarası -> kayıtlı form; hasta adının görünmediği sayfalarda (ürün seçimi)
    // doğru kaydı bulmak için tutulur.
    async function rememberPatient(patientId, docId) {
        if (!patientId) return;
        const map = (await getStored(PATIENTS_KEY)) || {};
        map[patientId] = docId;
        await setStored(PATIENTS_KEY, map);
    }

    // Yeni hasta sayfasında seçilen kayıt; yoksa IDS'teki hasta adıyla birebir eşleşen tek kayıt.
    // kind: 'refinement' | 'new' | undefined (sayfadan: refinement reçetesinde refinement kayıtları).
    async function recordForPatient(kind) {
        const records = (await ask({ type: 'ids-forms-list' })).records;
        const patientId = patientIdParam();
        const wanted = kind || (pagePackage() === 'refinement' ? 'refinement' : 'new');
        const fits = function (r) {
            return wanted === 'refinement' ? r.form_turu === 'refinement' : r.form_turu !== 'refinement';
        };
        const known = ((await getStored(PATIENTS_KEY)) || {})[patientId];
        const pick = await loadPick();
        const idsName = patientName();
        let record = known && records.find(function (r) { return r.id === known && fits(r); });
        if (!record) {
            record = pick && records.find(function (r) { return r.id === pick.id && fits(r); });
            if (record && idsName && matchScore(idsName, record) === 0) record = null;
        }
        if (!record && idsName) {
            // Adı birebir tutan kayıtlar; birden çoksa en yenisi (panelde adı görünür, değiştirilebilir).
            const exact = records.filter(function (r) { return fits(r) && matchScore(idsName, r) === 2; });
            exact.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
            if (exact.length) record = exact[0];
        }
        if (!record) return null;
        await rememberPatient(patientId, record.id);
        return {
            record: record, title: describeRecord(record),
            data: (await ask({ type: 'ids-form-get', id: record.id })).data
        };
    }

    // ---------- Tarama seçimi (hasta sihirbazı ve reçete için ortak) ----------

    function scanRadios() {
        return Array.from(document.querySelectorAll('input[type="radio"][id^="IOSCAN_"]'));
    }

    // Kod, IDS listesinde ya taramanın kimliğinde (IOSCAN_<kod>_...) ya da satır metnindeki
    // parantezli sipariş numarasında ("Soyad, Ad (101570094)") geçer.
    function scanHasCode(radio, code) {
        const wanted = code.toUpperCase();
        return radio.id.toUpperCase().indexOf('_' + wanted + '_') >= 0 ||
            labelOf(radio).toUpperCase().indexOf(wanted) >= 0;
    }

    function scanCode(raw) {
        // IDS araması kodlarda büyük-küçük harfe duyarlıdır; kod görünümlü değerler büyütülür.
        const code = String(raw || '').trim();
        return /^[a-z0-9]+$/i.test(code) && /\d/.test(code) ? code.toUpperCase() : code;
    }

    // Kodu arar ve tutan taramayı seçer. Sonuç: { chosen, exact, count }
    async function chooseScan(code) {
        const already = scanRadios().find(function (r) { return r.checked && scanHasCode(r, code); });
        if (already) return { chosen: already, exact: true, count: 1 };
        const box = document.getElementById('dentalRecords.patientName');
        const search = document.getElementById('search');
        if (!box || !search) return { chosen: null, exact: false, count: 0 };
        const runSearch = async function (term) {
            const before = scanRadios().map(function (r) { return r.id; }).join(',');
            setText(box, term);
            search.click();
            // Sonuç listesi değişene (ya da koda ait tarama görünene) kadar beklenir.
            for (let i = 0; i < 60; i++) {
                await sleep(250);
                const now = scanRadios();
                if (i > 2 && now.some(function (r) { return scanHasCode(r, code); })) break;
                if (i > 8 && now.map(function (r) { return r.id; }).join(',') !== before) break;
            }
            return scanRadios();
        };
        let results = await runSearch(code);
        // Ad ile arama (refinement formunda "Hasta adı / iTero sipariş kodu"): IDS araması birebir
        // metin arar (Türkçe karakterler dahil, ad-soyad sırası iTero'daki gibi). Tam metin sonuç
        // vermezse en uzun sözcükle yeniden aranır.
        if (!results.length && !/^[A-Z0-9]+$/.test(code)) {
            const word = code.split(/\s+/).sort(function (a, b) { return b.length - a.length; })[0];
            if (word && word !== code) results = await runSearch(word);
        }
        const matching = results.filter(function (r) { return scanHasCode(r, code); });
        const chosen = matching.length === 1 ? matching[0] : (results.length === 1 ? results[0] : null);
        if (chosen && !chosen.checked) chosen.click();
        return { chosen: chosen, exact: matching.length === 1, count: results.length };
    }

    // ---------- CBCT (Tara adımı) ----------
    // IDS'te CBCT kutusu işaretlenince "Yeni CBCT taraması yükleyin" bağlantısı (Align portalı,
    // auto.smarthub.invisalign.com, pid parametresi) ve "Yenile" düğmesi görünür. CBCT yoksa portal
    // yeni sekmede açılır (arka plan), cbct.js hastanın klasöründeki .dcm klasörünü yükler ve
    // idsCbctDone yazar; burada bu beklenir, sonra "Yenile" ile liste tazelenir (sayfa yenilenir ve
    // bu akış yeniden çalışır, bu kez CBCT listede bulunur).

    const CBCT_REQUEST_KEY = 'idsCbctRequest';
    const CBCT_DONE_KEY = 'idsCbctDone';
    const CBCT_WAIT_MS = 30 * 60000;

    async function waitUntil(check, timeoutMs) {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if (check()) return true;
            await sleep(300);
        }
        return !!check();
    }

    function cbctContainer() {
        return document.querySelector('.cbct-body-container');
    }

    // CBCT bölümünün durumu: 'none' (bölüm yok), 'loading' (liste henüz gelmedi; IDS listeyi kutu
    // işaretlendikten sonra sunucudan alır), 'empty' ("Bu hasta için hiçbir tarama yüklenmedi"),
    // 'listed' (seçilebilir CBCT kaydı var).
    function cbctState() {
        const box = cbctContainer();
        if (!box || box.offsetWidth === 0) return 'none';
        if (/hiçbir (CBCT|tarama)|no (CBCT|scan)/i.test(box.innerText)) return 'empty';
        if (box.querySelector('input[type="radio"], input[type="checkbox"], table tr, li, select')) return 'listed';
        return 'loading';
    }

    function cbctListed() {
        return cbctState() === 'listed';
    }

    function cbctLink() {
        return Array.from(document.querySelectorAll('a[href*="smarthub.invisalign.com"]')).find(function (a) {
            return /[?&]pid=\d+/.test(a.getAttribute('href') || '');
        }) || null;
    }

    // Sonuç: { ok, text, refreshing? }. refreshing: "Yenile"ye basıldı, sayfa yenilenecek.
    async function ensureCbct(say) {
        // Liste sunucudan gelene kadar beklenir; yoksa "liste boş" sanılıp yanlış karar verilir.
        await waitUntil(function () {
            const state = cbctState();
            return state === 'empty' || state === 'listed';
        }, 12000);
        const listState = cbctState();
        if (listState === 'listed') {
            selectCbct();
            return { ok: true, text: 'CBCT Tara işaretli, CBCT kaydı var.' };
        }
        if (listState !== 'empty') {
            return { ok: false, text: 'CBCT listesi yüklenemedi; "Yenile"ye basıp kontrol edin.' };
        }
        const link = cbctLink();
        if (!link) return { ok: false, text: 'CBCT Tara işaretlendi; CBCT yükleme bağlantısı bulunamadı, kaydı siz ekleyin.' };
        const pid = (/[?&]pid=(\d+)/.exec(link.getAttribute('href')) || [])[1];
        const refreshKey = 'idsfy-cbct-refresh-' + pid;
        const refreshes = Number(sessionStorage.getItem(refreshKey) || 0);
        // "Yenile": reçetede listeyi yerinde tazeler, sihirbazda formu gönderip sayfayı yeniler (o
        // durumda bu kod biter ve akış yeniden çalışır). Yüklenen CBCT'nin listeye düşmesi birkaç
        // deneme sürebilir; en çok 6 deneme (sayaç sayfa yenilemelerinde de korunur).
        const refreshAndCheck = async function () {
            const button = document.querySelector('button.cbct-refresh-button');
            if (!button) return { ok: false, text: 'CBCT yüklendi; "Yenile"ye basıp "İleri" ile geçin.' };
            while (Number(sessionStorage.getItem(refreshKey) || 0) < 6) {
                const count = Number(sessionStorage.getItem(refreshKey) || 0) + 1;
                sessionStorage.setItem(refreshKey, String(count));
                say('CBCT yüklendi; liste yenileniyor… (' + count + ')');
                button.click();
                await waitUntil(function () { return cbctState() === 'listed' || stopRequested; }, 12000);
                if (stopRequested) return { ok: false, text: 'Durduruldu.' };
                if (cbctState() === 'listed') {
                    selectCbct();
                    return { ok: true, text: 'CBCT yüklendi ve listelendi.' };
                }
            }
            return { ok: false, text: 'CBCT yüklendi ama IDS listesinde görünmedi; biraz bekleyip "Yenile"ye basın.' };
        };
        let done = await getStored(CBCT_DONE_KEY);
        const doneForPid = done && String(done.pid) === String(pid) && Date.now() - done.at < 15 * 60000;
        if (doneForPid && done.ok) return refreshAndCheck();
        if (doneForPid && !done.ok) {
            return { ok: false, text: 'CBCT yüklenemedi: ' + (done.text || '') + ' Kaydı siz ekleyin.' };
        }
        let request = await getStored(CBCT_REQUEST_KEY);
        const pending = request && String(request.pid) === String(pid) && Date.now() - request.at < CBCT_WAIT_MS;
        if (!pending) {
            await setStored(CBCT_DONE_KEY, null);
            request = {
                pid: pid, name: window.idsfyFolder.patientName() || patientName(), patientId: patientIdParam(), at: Date.now(),
                kind: pagePackage() === 'refinement' ? 'refinement' : 'new',
                choice: sessionStorage.getItem('idsfy-refinement-folder-' + formId()) || null
            };
            await setStored(CBCT_REQUEST_KEY, request);
            try {
                await ask({ type: 'ids-open', url: link.href });
            } catch (error) {
                return { ok: false, text: 'CBCT portalı açılamadı: ' + error.message + ' Bağlantıya siz tıklayın.' };
            }
        }
        say('CBCT, hasta klasöründen portal sekmesinde yükleniyor; bitmesi bekleniyor…');
        const started = Date.now();
        done = null;
        while (Date.now() - started < CBCT_WAIT_MS) {
            if (stopRequested) return { ok: false, text: 'Durduruldu.' };
            await sleep(2000);
            const latest = await getStored(CBCT_DONE_KEY);
            if (latest && String(latest.pid) === String(pid) && latest.at >= request.at) { done = latest; break; }
        }
        if (!done) return { ok: false, text: 'CBCT yüklemesi tamamlanmadı (portal sekmesine bakın); bitince "Yenile"ye basın.' };
        if (!done.ok) return { ok: false, text: 'CBCT yüklenemedi: ' + (done.text || '') + ' Kaydı siz ekleyin.' };
        return refreshAndCheck();
    }

    // Listelenen CBCT'lerden biri seçili değilse ilki seçilir (IDS seçim olmadan "İleri"yi açmaz).
    function selectCbct() {
        const box = cbctContainer();
        const inputs = box ? Array.from(box.querySelectorAll('input[type="radio"], input[type="checkbox"]')) : [];
        if (!inputs.length) return false;
        if (!inputs.some(function (r) { return r.checked; })) inputs[0].click();
        return true;
    }

    // Tarama adımının ortak mantığı. ids: sayfaya göre değişen alan kimlikleri.
    // Sonuç: { advance: bool, text, error }
    //  - Tarama her durumda kayıtlı koda göre seçilir.
    //  - CBCT işaretliyse kutu işaretlenir ve beklenir (CBCT kaydını asistan ekler).
    //  - "İntraoral tarama mevcut değilse" işaretliyse IDS'teki kutuya dokunulmaz, karar
    //    asistana bırakılır (beklenir).
    //  - Kod birebir tutan tek tarama seçildiyse ilerlenir; belirsizse beklenir.
    async function handleScan(get, ids, say) {
        const wantsCbct = Array.isArray(get('cbct_tara')) && get('cbct_tara').length > 0;
        const noScan = Array.isArray(get('intraoral_tarama_yok')) && get('intraoral_tarama_yok').length > 0;
        // CBCT kutusu önce işaretlenir ki IDS'in sayfayı yenilemesi tarama seçimini bozmasın.
        const cbctBox = document.getElementById(ids.cbct);
        if (wantsCbct && cbctBox && !cbctBox.checked) {
            cbctBox.click();
            await sleep(600);
        }
        // CBCT kaydı yoksa portal sekmesi açılıp hasta klasöründen yüklenir; bitene kadar beklenir.
        // IDS'te kutu zaten işaretliyse (sihirbazdan kalmış ya da elle) kayıtta olmasa da CBCT gerekir;
        // IDS kutu işaretliyken CBCT seçilmeden "İleri"yi açmaz.
        const cbctActive = !!cbctBox && (wantsCbct || cbctBox.checked);
        const cbct = cbctActive ? await ensureCbct(say || function () {}) : null;
        if (cbct && cbct.refreshing) return { advance: false, text: cbct.text, error: false, refreshing: true };
        const done = function (advance, text, error) {
            let message = text;
            if (cbct) {
                message += ' ' + cbct.text;
                if (!cbct.ok) advance = false;
            } else if (wantsCbct) {
                message += ' Kayıtlı formda CBCT işaretli ama bu pakette IDS\'te CBCT seçeneği yok.';
            }
            if (noScan) {
                message += ' Kayıtlı formda "İntraoral tarama mevcut değilse" de işaretli; gerekiyorsa o kutuyu siz işaretleyin.';
                advance = false;
            }
            return { advance: advance, text: message, error: !!error };
        };
        if (get('tarama_turu') === 'pvs') {
            const pvs = document.getElementById(ids.pvs);
            if (pvs && !pvs.checked) pvs.click();
            return done(true, 'PVS ölçü işaretlendi.');
        }
        const intraoral = document.getElementById(ids.intraoral);
        if (intraoral && !intraoral.checked) intraoral.click();
        const code = scanCode(get('itero_siparis_kodu'));
        if (!code) {
            const selected = scanRadios().find(function (r) { return r.checked; });
            return selected
                ? done(true, 'Seçili tarama: ' + labelOf(selected) + '.')
                : done(false, 'Kayıtlı formda iTero sipariş kodu yok; taramayı elle seçin.', true);
        }
        const found = await chooseScan(code);
        if (!found.chosen) {
            return done(false, found.count
                ? '"' + code + '" için ' + found.count + ' tarama listelendi; doğru olanı elle seçin.'
                : '"' + code + '" ile tarama bulunamadı; kodu kontrol edin.', true);
        }
        if (!found.exact) {
            return done(false, 'Tarama seçildi: ' + labelOf(found.chosen) + '. Kod birebir tutmadı; kontrol edip "İleri"ye basın.');
        }
        return done(true, 'Tarama seçildi: ' + labelOf(found.chosen) + '.');
    }

    // ---------- Reçetenin 10. adımdan sonraki adımları ----------
    // Tara, Fotoğraflar, Radyograf, Klinik Etkinlik ve İndirim kendiliğinden geçilir;
    // Özet'te durulur. "Gönder"e her zaman kullanıcı basar.

    function postStep() {
        if (document.getElementById(SCAN_PROBE)) return 'scan';
        if (document.getElementById('upload-photos')) return 'photos';
        if (document.getElementById('panoramicxTf')) return 'xray';
        if (document.getElementById('rxformsubmit')) return 'review';
        if (document.getElementById('staffDiscount')) return 'discount';
        const step = Number(new URLSearchParams(location.search).get('step'));
        if (step > 10 && currentStep() < 0 && document.querySelector('input[type="submit"]#form_0')) return 'info';
        return null;
    }

    const POST_NAMES = {
        scan: 'Tara', photos: 'Fotoğraflar', xray: 'Radyograf', info: 'Klinik Etkinlik',
        discount: 'İndirim', review: 'Özet'
    };

    // Reçete sonrası adımların sırası (refinement'ta Radyograf ve İndirim yok).
    function postOrder() {
        return activePackage.refinement
            ? ['scan', 'photos', 'info', 'review']
            : ['scan', 'photos', 'xray', 'info', 'discount', 'review'];
    }

    // Günlükteki tüm adım adlarının sırası (form adımları + sonraki adımlar).
    function logOrder() {
        return activeSteps().map(function (s) { return s.name; })
            .concat(postOrder().map(function (p) { return POST_NAMES[p]; }));
    }

    // Kullanıcı doldurmayı durdurup bazı adımları IDS'te elle geçtiyse, "Devam et" denen sayfadan
    // önceki ve günlükte olmayan adımlar "elle dolduruldu" olarak işaretlenir.
    function markManual(state) {
        const names = [];
        const steps = activeSteps();
        const step = currentStep();
        const post = postStep();
        if (step >= 0) {
            steps.slice(0, step).forEach(function (s) { if (!s.optional) names.push(s.name); });
        } else if (post) {
            steps.forEach(function (s) { if (!s.optional) names.push(s.name); });
            const order = postOrder();
            for (let i = 0; i < order.length && order[i] !== post; i++) names.push(POST_NAMES[order[i]]);
        }
        names.forEach(function (name) {
            if (!state.log.some(function (e) { return e.step === name; })) {
                state.log.push({ step: name, problems: [], manual: true });
            }
        });
    }

    function logPost(state, post, problems) {
        const name = POST_NAMES[post];
        state.log = state.log.filter(function (e) { return e.step !== name; });
        state.log.push({ step: name, problems: problems || [] });
    }

    function photoSlotsEmpty() {
        return document.querySelectorAll('input[type="file"][id$="-uploader-input"]').length;
    }

    async function clickWhenEnabled(button, timeoutMs) {
        const until = Date.now() + timeoutMs;
        while (button.disabled && Date.now() < until) {
            if (stopRequested) return false;
            await sleep(300);
        }
        if (button.disabled || stopRequested) return false;
        button.click();
        return true;
    }

    // Sonuç: true ise sayfa ilerletildi (durum kaydedildi), false ise beklemede kalındı.
    async function runPost(state, post) {
        const stop = async function (text, isError) {
            state.auto = false;
            if (isError && post !== 'review') {
                // Günlükte adım adı zaten başlık olduğundan metindeki "Tara: " öneki düşürülür.
                logPost(state, post, [text.replace(new RegExp('^' + POST_NAMES[post] + ': '), '')]);
            }
            await saveState(state);
            showProgress(state, text, isError);
            return false;
        };
        const advance = async function (button, text) {
            if (!button) return stop('"İleri" düğmesi bulunamadı (' + POST_NAMES[post] + ').', true);
            if (await shouldStop(state)) return stop('Durduruldu; bu adım geçilmedi.', false);
            logPost(state, post, []);
            state.submitted = 'post:' + post;
            state.submittedAt = Date.now();
            await saveState(state);
            showProgress(state, text, false);
            if (!(await clickWhenEnabled(button, 15000))) {
                if (stopRequested) return stop('Durduruldu; bu adım geçilmedi.', false);
                return stop(POST_NAMES[post] + ': "İleri" etkin değil; eksik olanı tamamlayıp siz ilerleyin.', true);
            }
            return true;
        };

        if (post === 'review') {
            const warnings = state.log.filter(function (entry) { return entry.problems.length && !entry.resolved; }).length;
            return stop('Reçete Özet adımına kadar dolduruldu. ' +
                (warnings ? warnings + ' adımda uyarı var, aşağıda. ' : '') +
                'Özeti kontrol edip "Gönder"e siz basın.', warnings > 0);
        }
        if (state.submitted === 'post:' + post && recentlySubmitted(state)) {
            return stop('IDS "' + POST_NAMES[post] + '" adımını kabul etmedi. Sayfadaki uyarıya bakıp elle tamamlayın.', true);
        }
        const resumed = state.resumed;
        state.resumed = null;
        if (post === 'scan') {
            showProgress(state, 'Tara adımı işleniyor…', false);
            // "Devam et" ile dönüldüyse ve bir tarama seçiliyse yeniden aranmaz, seçim kabul edilir.
            const selected = scanRadios().find(function (r) { return r.checked; });
            const cbctBoxEl = document.getElementById('cbct-rx');
            const cbctPending = !!cbctBoxEl && cbctBoxEl.checked && !cbctListed();
            if (resumed === 'scan' && selected && !cbctPending) {
                return advance(document.getElementById('next'), 'Seçili tarama: ' + labelOf(selected) + '. Sonraki adıma geçiliyor…');
            }
            const result = await handleScan(function (key) { return value(state.data, key); }, {
                cbct: 'cbct-rx', pvs: 'dentalRecords.impression', intraoral: 'dentalRecords.intraOralScan'
            }, function (text) { showProgress(state, text, false); });
            if (result.refreshing) {
                // "Yenile" sayfayı yeniler; otomatik akış kapatılmaz, yeniden çalışır.
                showProgress(state, result.text, false);
                return false;
            }
            if (!result.advance) return stop(result.text, result.error);
            return advance(document.getElementById('next'), result.text + ' Sonraki adıma geçiliyor…');
        }
        if (post === 'photos') {
            // Yuvalar sonradan çizilir ve önceden yüklenmiş fotoğraflar boş yuvaların yerine
            // biraz gecikmeyle gelir; boş yuva sayısı birkaç saniye değişmeden kalana kadar beklenir.
            let empty = -1;
            let stableSince = 0;
            for (let i = 0; i < 80; i++) {
                await sleep(250);
                if (stopRequested) return stop('Durduruldu.', false);
                if (!document.querySelector('input[type="file"][id$="-input"]')) continue;
                const now = photoSlotsEmpty();
                if (now === 0) break;
                if (now !== empty) {
                    empty = now;
                    stableSince = Date.now();
                } else if (Date.now() - stableSince > 4000) {
                    break;
                }
            }
            const next = document.getElementById('uploadButton');
            if (!photoSlotsEmpty()) return advance(next, 'Fotoğraflar yüklü. Sonraki adıma geçiliyor…');
            showProgress(state, 'Fotoğraflar eksik; hasta klasöründen yükleniyor (sağdaki panel)…', false);
            document.addEventListener('idsfy-photos-done', async function onDone() {
                document.removeEventListener('idsfy-photos-done', onDone);
                if (document.documentElement.dataset.idsfyPhotos !== 'ok') {
                    await stop('Fotoğraflarda kontrol gereken yuvalar var; düzeltip "İleri"ye siz basın.', true);
                    return;
                }
                const latest = await loadState();
                if (latest && latest.auto) await advance(next, 'Fotoğraflar yüklendi. Sonraki adıma geçiliyor…');
            });
            return false;
        }
        if (post === 'xray') {
            // Yükleme ve ilerleme xray.js'te; burada yalnızca durum gösterilir.
            logPost(state, post, []);
            await saveState(state);
            showProgress(state, 'Radyograf adımı işleniyor (sağdaki panel)…', false);
            return false;
        }
        if (post === 'discount') {
            const chosen = document.querySelector('input[type="radio"][name*="discount"]:checked');
            const none = document.getElementById('none');
            if (!chosen && none) none.click();
        }
        return advance(document.querySelector('input[type="submit"]#form_0'),
            POST_NAMES[post] + ' geçiliyor…');
    }

    async function run() {
        const state = await loadState();
        if (state) {
            setPackage(PACKAGES[state.pkg]);
            if (pagePackage() && pagePackage() !== activePackage.page) {
                showProgress(state, 'Bu reçete "' + pagePackage() + '" paketinde, kayıtlı form ise "' +
                    (state.pkg || '').split(':')[1] + '". Doldurma yapılmadı.', true);
                return;
            }
        }
        const step = currentStep();
        const post = postStep();
        if (!state) {
            if (step === 0 && await autoStart()) return;
            if (step >= 0) showSearch();
            return;
        }
        if (state.auto && state.tab && state.tab !== tabToken()) {
            // Öbür sekme hâlâ çalışıyorsa karışılmaz; kapanmış ya da yarıda bırakılmışsa doldurma
            // bu sekmede kaldığı adımdan sürer.
            if (await otherTabAlive(state.tab)) {
                const body = ensurePanel();
                body.textContent = '';
                body.appendChild(el('div', 'idsfy-info', state.title));
                body.appendChild(el('div', 'idsfy-status', 'Bu reçete başka bir sekmede dolduruluyor.'));
                body.appendChild(button('Bu sekmede devam et', async function () {
                    state.tab = tabToken();
                    await saveState(state);
                    run();
                }));
                return;
            }
            state.tab = tabToken();
            await saveState(state);
        }
        if (state.auto) startHeartbeat();
        if (step < 0) {
            if (!post) {
                if (state.log.length) showProgress(state, 'Doldurma bu sayfada çalışmaz.', false);
                return;
            }
            if (!state.auto) {
                showProgress(state, 'Beklemede: ' + POST_NAMES[post], false);
                return;
            }
            await runPost(state, post);
            return;
        }
        if (!state.auto) {
            showProgress(state, 'Beklemede: ' + activeSteps()[step].name, false);
            return;
        }
        // "İleri"den hemen sonra aynı adım geri geldiyse IDS adımı kabul etmemiştir. Reçeteye
        // sonradan yeniden girildiğinde aynı adımda olmak ret değildir; kaldığı yerden sürer.
        if (state.submitted === step && recentlySubmitted(state)) {
            state.auto = false;
            await saveState(state);
            showProgress(state, 'IDS "' + activeSteps()[step].name + '" adımını kabul etmedi. Sayfadaki uyarıya bakıp elle düzeltin.', true);
            return;
        }
        showProgress(state, 'Dolduruluyor: ' + activeSteps()[step].name, false);
        const result = await fillStep(step, state.data);
        state.log = state.log.filter(function (entry) { return entry.step !== result.step; });
        state.log.push(result);
        const next = nextButton();
        const blocked = result.problems.some(function (problem) { return problem.indexOf('IDS') === 0; });
        if (result.stop || blocked || !next) {
            state.auto = false;
            await saveState(state);
            showProgress(state, result.stop
                ? 'Bu adımda elle giriş gerekiyor (aşağıdaki not). Tamamlayıp "Devam et"e basın.'
                : blocked
                    ? 'Bu adımda bazı seçimler yapılamadı. Kontrol edip "Devam et"e ya da IDS\'te "İleri"ye basın.'
                    : '"İleri" düğmesi bulunamadı.', true);
            return;
        }
        if (await shouldStop(state)) {
            await saveState(state);
            showProgress(state, 'Durduruldu; bu adım gönderilmedi.', false);
            return;
        }
        state.submitted = step;
        state.submittedAt = Date.now();
        await saveState(state);
        showProgress(state, 'Sonraki adıma geçiliyor…', false);
        next.click();
    }

    // Az önce gönderilmiş mi (ret tespiti için): 45 saniye içinde ya da IDS "valid=false" döndürdüyse.
    function recentlySubmitted(state) {
        return (state.submittedAt && Date.now() - state.submittedAt < 45000) ||
            /[?&]valid=false/.test(location.search);
    }

    // Ürün seçimi eklentiyle yapıldıysa (aşağıda) doldurma 1. adımda kendiliğinden başlar.
    async function autoStart() {
        const flag = await getStored(AUTO_KEY);
        if (!flag || Date.now() - flag.at > AUTO_TTL_MS) return false;
        await setStored(AUTO_KEY, null);
        // Kullanıcı kararı: reçete her zaman kayıt seçimiyle başlar (hasta dosyasındaki gibi). Ürün
        // seçiminden / "Ek Hizalayıcıları başlat"tan gelen kayıt seçili gelir, "Formu doldur" beklenir.
        showSearch(null, flag.docId);
        return true;
    }

    // ---------- Klinik Koşullar adımı ----------
    // Kayıtlı formda karşılığı yoktur; hiçbir şey işaretlenmeden "İleri" ile geçilir.
    // Aynı hastada sayfaya geri dönülürse (ya da IDS boş geçişi kabul etmezse) yeniden
    // kendiliğinden geçilmez, düğme gösterilir.
    function skipClinicalConditions(patientId) {
        const next = document.querySelector('input.next-button');
        const body = ensurePanel();
        body.textContent = '';
        if (!next) {
            body.appendChild(el('div', 'idsfy-status idsfy-error', '"İleri" düğmesi bulunamadı.'));
            return;
        }
        const flag = 'idsfy-notes-' + patientId;
        if (sessionStorage.getItem(flag)) {
            body.appendChild(el('div', 'idsfy-status', 'Klinik Koşullar: bu adım kayıtlı formda yok.'));
            body.appendChild(button('Boş bırakıp devam et', function () { next.click(); }));
            return;
        }
        sessionStorage.setItem(flag, '1');
        body.appendChild(el('div', 'idsfy-status', 'Klinik Koşullar boş bırakılıp sonraki adıma geçiliyor…'));
        next.click();
    }

    // ---------- Hasta sihirbazının Tara adımı ----------

    const PACKAGE_SUFFIX = {
        'yetiskin:comprehensive': '_yetiskin_comp', 'yetiskin:moderate': '_yetiskin_moderate',
        'yetiskin:lite': '_yetiskin_lite', 'yetiskin:express': '_yetiskin_express',
        'ergen:comprehensive': '_ergen_comp', 'ergen:moderate': '_ergen_moderate',
        'ergen:lite': '_ergen_lite', 'ergen:express': '_ergen_express',
        'cocuk:first_comprehensive': '_cocuk_first'
    };

    // Kaydın paketine ait alan; eski kayıtlarda paket bilgisi eksikse ve tüm paketlerde
    // aynı değer varsa o değer kullanılır.
    function packageField(data, key) {
        const paket = data.tedavi_secenegi || data.tedavi_secenegi_ergen || data.tedavi_secenegi_cocuk_first;
        const suffix = PACKAGE_SUFFIX[data.hasta_tipi + ':' + paket];
        if (suffix && data[key + suffix] !== undefined) return data[key + suffix];
        const found = Object.keys(data).filter(function (name) { return name.indexOf(key + '_') === 0; })
            .map(function (name) { return JSON.stringify(data[name]); });
        const distinct = found.filter(function (v, i) { return found.indexOf(v) === i; });
        return distinct.length === 1 ? JSON.parse(distinct[0]) : undefined;
    }

    function statusPanel(text) {
        const body = ensurePanel();
        body.textContent = '';
        const status = el('div', 'idsfy-status', text);
        body.appendChild(status);
        return {
            body: body,
            say: function (message, isError) {
                status.textContent = message;
                status.classList.toggle('idsfy-error', !!isError);
            },
            title: function (title) { body.insertBefore(el('div', 'idsfy-info', title), status); }
        };
    }

    async function fillScan() {
        const ui = statusPanel('Kayıtlı form aranıyor…');
        let found;
        try {
            found = await recordForPatient();
        } catch (error) {
            ui.say('Kayıtlar okunamadı: ' + error.message, true);
            return;
        }
        if (!found) {
            ui.say('Bu hasta için kayıtlı form bulunamadı; taramayı elle seçin.', true);
            return;
        }
        ui.title(found.title);
        ui.say('Tarama aranıyor…');
        const result = await handleScan(function (key) { return packageField(found.data, key); }, {
            cbct: 'cbct', pvs: 'pvsImpressionsPVS_IMPRESSIONS', intraoral: 'intraOralScansINTRA_ORAL_SCANS'
        }, function (text) { ui.say(text); });
        if (result.refreshing) {
            ui.say(result.text);
            return;
        }
        // Sayfaya geri dönüldüğünde yeniden kendiliğinden geçilmez.
        const next = document.getElementById('next');
        const flag = 'idsfy-scan-' + new URLSearchParams(location.search).get('patientId');
        if (!result.advance || !next || sessionStorage.getItem(flag)) {
            ui.say(result.text + (result.advance ? ' Kontrol edip "İleri"ye basın.' : ''), result.error);
            return;
        }
        sessionStorage.setItem(flag, '1');
        ui.say(result.text + ' Sonraki adıma geçiliyor…');
        await sleep(1500);
        next.click();
    }

    // ---------- Hasta dosyası: reçeteyi başlat ----------
    // Hasta sihirbazının son adımından (Radyograf) gelindiyse "Başla" kendiliğinden
    // tıklanır; hasta dosyası başka bir yoldan açıldıysa yalnızca düğme gösterilir.
    // Hasta dosyasındaki "Başla" (yeni reçete) ve "Ek Hizalayıcılar" (refinement) bağlantıları
    // dispatch.action'a gider; ikincisinde formType=ADDITIONAL_ALIGNERS_INT_2_0 bulunur.
    function startPrescription(patientId) {
        const links = Array.from(document.querySelectorAll('a')).filter(function (a) {
            return /rx\/dispatch\.action/.test(a.getAttribute('onclick') || '');
        });
        const newLink = links.find(function (a) { return !/formType=/.test(a.getAttribute('onclick')); });
        const refLink = links.find(function (a) { return /formType=ADDITIONAL_ALIGNERS_INT_2_0/.test(a.getAttribute('onclick')); });
        if (!newLink && !refLink) return;
        const ui = statusPanel('Bu hasta için reçete başlatılabilir.');
        const flag = 'idsfy-start-' + patientId;
        const fromWizard = /editPatient\.action.*currentStep=XRAY/.test(document.referrer);
        if (newLink && fromWizard && !sessionStorage.getItem(flag)) {
            sessionStorage.setItem(flag, '1');
            ui.say('Reçete başlatılıyor…');
            newLink.click();
            return;
        }
        if (newLink) ui.body.appendChild(button('Reçeteyi başlat', function () { newLink.click(); }));
        if (!refLink) return;
        // Refinement: kayıtlı refinement formu varsa adı yazılır; düğmeye basılınca reçete açılır ve
        // doldurma 1. adımda kendiliğinden başlar (hasta dosyasına her girişte kendiliğinden başlamaz).
        recordForPatient('refinement').then(function (found) {
            if (found) ui.say('Kayıtlı refinement formu: ' + found.title);
            ui.body.appendChild(button('Ek Hizalayıcıları başlat', async function () {
                if (found) await setStored(AUTO_KEY, { docId: found.record.id, at: Date.now() });
                refLink.click();
            }));
        }).catch(function (error) {
            ui.say('Kayıtlar okunamadı: ' + error.message, true);
            ui.body.appendChild(button('Ek Hizalayıcıları başlat', function () { refLink.click(); }));
        });
    }

    // ---------- Hasta tipi / ürün tipi / tedavi seçeneği ----------
    // Tek sayfada üç aşama art arda gösterilir. Hasta tipi ve ürün tipi kayıtlı forma göre
    // tıklanır; paketi (tedavi seçeneği) kullanıcı seçer. Paket tıklanınca reçete sayfası açılır.

    const TYPE_TITLE = { yetiskin: /Yetişkin|Adult/i, ergen: /Ergen|Teen/i, cocuk: /Çocuk|Child|Kid/i };

    function selectButtons() {
        return Array.from(document.querySelectorAll('button.cardSelectButton, button.selectOption'))
            .filter(function (b) { return b.offsetWidth > 0; })
            .map(function (b) {
                let card = b;
                for (let i = 0; i < 6 && card && !card.querySelector('.cardHeader, a.expand'); i++) card = card.parentElement;
                const head = card && card.querySelector('.cardHeader, a.expand');
                return { button: b, title: head ? head.textContent.trim().replace(/\s+/g, ' ') : '' };
            });
    }

    async function chooseProduct(patientId) {
        const ui = statusPanel('Kayıtlı form aranıyor…');
        let found;
        try {
            found = await recordForPatient();
        } catch (error) {
            ui.say('Kayıtlar okunamadı: ' + error.message, true);
            return;
        }
        if (!found) {
            ui.say('Bu hasta için kayıtlı form bulunamadı; seçimleri elle yapın.', true);
            return;
        }
        ui.title(found.title);
        const record = found.record;
        const type = record.hasta_tipi;
        const info = packageOf(Object.assign({}, record, found.data));
        if (!info || info.refinement) {
            ui.say('Bu kayıt türü için ürün seçimi otomatik değil (Vivera, palatal, Flex, refinement); seçimleri elle yapın.', true);
            return;
        }
        const paket = info.paket;
        const productRe = info.child ? /First/i : /aligner/i;
        const pick = function (list, test) {
            return list.find(function (item) { return test.test(item.title); });
        };
        let lastStage = '';
        for (let i = 0; i < 80; i++) {
            await sleep(500);
            if (!/mauiProduct\.action$/.test(location.pathname)) return;
            const list = selectButtons();
            if (!list.length) continue;
            let stage, target;
            if (pick(list, /Comprehensive|Moderate|Lite|Express/i) && !(info.child && !pick(list, /Paket|Package/i))) {
                // Paketi kullanıcı seçer (kullanıcı kararı); reçete sayfası açılınca doldurmanın
                // kendiliğinden başlaması için kayıt işaretlenir.
                await setStored(AUTO_KEY, { docId: record.id, at: Date.now() });
                ui.say('Paketi siz seçin. Kayıtlı formdaki paket: ' + paket + '.');
                return;
            } else if (pick(list, /aligner|Vivera|Retainer/i)) {
                stage = 'ürün';
                target = pick(list, productRe);
            } else {
                stage = 'hasta tipi';
                target = pick(list, TYPE_TITLE[type]);
            }
            if (stage === lastStage) continue;
            if (!target) {
                ui.say('"' + stage + '" aşamasında kayıtlı formdaki seçenek bulunamadı; elle seçin.', true);
                return;
            }
            lastStage = stage;
            ui.say('Seçiliyor: ' + target.title);
            target.button.click();
        }
    }

    // ---------- Flex Rx açılışı: geleneksel reçeteye geçiş ----------
    // IDS reçeteyi Flex Rx görünümünde açar. Kayıt Flex değilse "Geleneksel Reçeteye
    // geçin" bağlantısı ve onay penceresindeki "Geç" tıklanır (reçete başına bir kez).
    async function switchToTraditional() {
        const link = document.querySelector('#switchToTraditionalHyperlinkArea a');
        if (!link || link.offsetWidth === 0) return false;
        const ui = statusPanel('Flex Rx açıldı; kayıtlı form kontrol ediliyor…');
        // Form başına ve paket başına bir kez: paket değiştirilince Flex görünümü yeniden açılır.
        const flag = 'idsfy-switch-' + formId() + '-' + (pagePackage() || '');
        const doSwitch = async function () {
            link.click();
            let go = null;
            for (let i = 0; i < 20 && !go; i++) {
                await sleep(250);
                const candidate = document.querySelector('#switch-flex-modal .next-button');
                if (candidate && candidate.offsetWidth > 0) go = candidate;
            }
            if (!go) {
                ui.say('Geçiş onayı açılmadı; "Geleneksel Reçeteye geçin"e siz basın.', true);
                return;
            }
            go.click();
        };
        let record = null;
        try {
            const flagged = await getStored(AUTO_KEY);
            const records = (await ask({ type: 'ids-forms-list' })).records;
            record = flagged && records.find(function (r) { return r.id === flagged.docId; });
            if (!record) {
                const exact = records.filter(function (r) { return matchScore(patientName(), r) === 2; });
                if (exact.length === 1) record = exact[0];
            }
        } catch (error) {
            ui.say('Kayıtlar okunamadı: ' + error.message, true);
            return true;
        }
        if (record && record.form_turu === 'yeni_hasta_flex') {
            ui.say('Kayıtlı form Flex Rx; Flex doldurma henüz desteklenmiyor.', true);
            return true;
        }
        if (!record || sessionStorage.getItem(flag)) {
            ui.say(record ? 'Flex Rx görünümü açık.' : 'Bu hasta için kayıtlı form bulunamadı.', !record);
            ui.body.appendChild(button('Geleneksel reçeteye geç', doSwitch));
            return true;
        }
        sessionStorage.setItem(flag, '1');
        ui.title(describeRecord(record));
        ui.say('Geleneksel reçeteye geçiliyor…');
        await doSwitch();
        return true;
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
        const params = new URLSearchParams(location.search);
        const path = location.pathname;
        if (/\/rx\/mauiProduct\.action$/.test(path)) {
            chooseProduct(params.get('patientId'));
        } else if (/\/rx\/i20\/(?:maui\/)?\w+\.action$/.test(path)) {
            switchToTraditional().then(function (handled) {
                if (handled) return;
                if (pagePackage()) run();
            });
        } else if (/\/rx\/secondary\/additionalAligners\.action$/.test(path)) {
            if (pagePackage()) run();
            else statusPanel('Bu reçete türü desteklenmiyor (yalnızca Ek Hizalayıcılar doldurulur).');
        } else if (/\/patient\/patientFile\.action$/.test(path)) {
            startPrescription(params.get('patientId'));
        } else if (/\/patient\/editPatient\.action$/.test(path)) {
            if (params.get('patientId') && params.get('currentStep') === 'NOTES') {
                skipClinicalConditions(params.get('patientId'));
            } else if (params.get('patientId') && params.get('currentStep') === 'DENTAL_RECORDS') {
                fillScan();
            } else if (!params.get('patientId') && document.getElementById(NAME_FIELDS.hasta_soyadi)) {
                showNewPatient();
            }
        }
    }
})();
