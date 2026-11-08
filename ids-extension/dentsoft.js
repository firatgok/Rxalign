// Dentsoft köprüsü: hasta kartındaki kimlik bilgilerini (ad, soyad, T.C. kimlik no, doğum tarihi,
// cinsiyet) eklenti deposuna alır. IDS'in "Yeni hasta" sayfasında rx.js bu bilgileri tek tıkla doldurur.
// Dentsoft'a hiçbir şey yazılmaz; yalnızca okunur.
(function () {
    'use strict';

    const KEY = 'dentsoftPatient';
    const IDS_NEW_PATIENT = 'https://vip.invisalign.com/v3/auth/patient/editPatient.action';

    function text(selector) {
        const field = document.querySelector(selector);
        return field ? String(field.value || '').trim() : '';
    }

    // Etiketi verilen metni içeren alanın yanındaki görünür metin kutusu (T.C. / Pasaport No için).
    function fieldByLabel(pattern) {
        const label = [...document.querySelectorAll('label')].find(function (l) { return pattern.test(l.innerText || ''); });
        if (!label) return '';
        let box = label.parentElement;
        for (let i = 0; i < 3 && box; i++) {
            const input = [...box.querySelectorAll('input[type="text"], input:not([type])')].find(function (f) { return f.offsetParent; });
            if (input) return String(input.value || '').trim();
            box = box.parentElement;
        }
        return '';
    }

    // Görünen doğum tarihi metni ("01 Nisan 2002 Pazartesi") gizli alan boşsa yedek olarak çözülür.
    const MONTHS = { ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12 };

    function parseVisibleDate(value) {
        const match = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/.exec(value || '');
        if (!match) return '';
        const month = MONTHS[match[2].toLocaleLowerCase('tr-TR')];
        if (!month) return '';
        return match[3] + '-' + String(month).padStart(2, '0') + '-' + match[1].padStart(2, '0');
    }

    function readPatient() {
        const birthday = text('input[name="PatientBirthday"]') || parseVisibleDate(fieldByLabel(/Doğum Tarihi/));
        const sex = text('select[name="PatientSex"]');
        const tc = fieldByLabel(/TC\s*\/?\s*Pasaport|T\.?C\.?\s*Kimlik/i) ||
            text('input[name*="Identity" i]') || text('input[name*="Tc" i]');
        return {
            ad: text('input[name="PatientFirstName"]'),
            soyad: text('input[name="PatientLastName"]'),
            tc: tc.replace(/\s+/g, ''),
            dogum: birthday,            // yyyy-aa-gg
            cinsiyet: sex === '2' ? 'erkek' : (sex === '1' ? 'kadin' : ''),
            kaynak: location.href,
            at: Date.now()
        };
    }

    function toast(message, isError) {
        let box = document.getElementById('idsfy-dentsoft-toast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'idsfy-dentsoft-toast';
            box.className = 'idsfy-dentsoft-toast';
            document.body.appendChild(box);
        }
        box.textContent = message;
        box.classList.toggle('idsfy-dentsoft-error', !!isError);
        box.classList.add('idsfy-show');
        clearTimeout(box._timer);
        box._timer = setTimeout(function () { box.classList.remove('idsfy-show'); }, 6000);
    }

    function describe(p) {
        const parts = [p.soyad + ', ' + p.ad];
        if (p.dogum) parts.push(p.dogum.split('-').reverse().join('/'));
        if (p.cinsiyet) parts.push(p.cinsiyet === 'erkek' ? 'Erkek' : 'Kadın');
        return parts.join(' · ');
    }

    function onExport() {
        const patient = readPatient();
        if (!patient.ad || !patient.soyad) {
            toast('Hasta adı okunamadı. Hasta kartının "Bilgi" sekmesinde olduğunuzdan emin olun.', true);
            return;
        }
        const missing = [];
        if (!patient.tc) missing.push('T.C. kimlik no');
        if (!patient.dogum) missing.push('doğum tarihi');
        if (!patient.cinsiyet) missing.push('cinsiyet');
        chrome.storage.local.set({ [KEY]: patient }, function () {
            toast('IDS\'e aktarıldı: ' + describe(patient) +
                (missing.length ? ' (eksik: ' + missing.join(', ') + ')' : '') +
                '. IDS\'te Yeni hasta sayfasında "Dentsoft bilgileriyle doldur"a basın.');
            // IDS Yeni hasta sayfasını yeni sekmede aç (kullanıcı tıklamasıyla).
            // Adlandırılmış pencere: rx.js bu sekmenin "IDS'e aktar" ile açıldığını window.name'den anlar
            // ve kimlik alanlarını yalnızca burada kendiliğinden doldurur.
            window.open(IDS_NEW_PATIENT, 'idsfy-dentsoft');
        });
    }

    function mount() {
        if (document.getElementById('idsfy-dentsoft-btn')) return;
        if (!document.querySelector('input[name="PatientFirstName"]')) return;
        const btn = document.createElement('button');
        btn.id = 'idsfy-dentsoft-btn';
        btn.type = 'button';
        btn.className = 'idsfy-dentsoft-btn';
        btn.textContent = 'IDS\'e aktar';
        btn.title = 'Ad, soyad, T.C. kimlik no, doğum tarihi ve cinsiyeti IDS Yeni hasta formu için hazırlar';
        btn.addEventListener('click', onExport);
        document.body.appendChild(btn);
    }

    mount();
    // Dentsoft sekmeler arasında içeriği sonradan yüklediği için kısa süre izlenir.
    const observer = new MutationObserver(function () { mount(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 15000);
})();
