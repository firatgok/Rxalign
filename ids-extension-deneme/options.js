const input = document.getElementById('apiKey');
const status = document.getElementById('status');
const folder = window.idsfyFolder;

chrome.storage.local.get('anthropicApiKey').then(function (data) {
    if (data.anthropicApiKey) input.placeholder = 'Kayıtlı (değiştirmek için yenisini yazın)';
});

document.getElementById('save').addEventListener('click', function () {
    const key = input.value.trim();
    if (!key) {
        status.textContent = 'Anahtar boş.';
        return;
    }
    chrome.storage.local.set({ anthropicApiKey: key }).then(function () {
        input.value = '';
        input.placeholder = 'Kayıtlı (değiştirmek için yenisini yazın)';
        status.textContent = 'Kaydedildi.';
    });
});


// ---------- Rxalign hesabı (Firestore okumaları için giriş) ----------

const rxAccount = document.getElementById('rxAccount');
const rxForm = document.getElementById('rxSignInForm');
const rxEmail = document.getElementById('rxEmail');
const rxPassword = document.getElementById('rxPassword');
const rxSignInButton = document.getElementById('rxSignIn');
const rxSignOutButton = document.getElementById('rxSignOut');
const rxTestButton = document.getElementById('rxTest');
const rxStatus = document.getElementById('rxStatus');

function rxSend(message) {
    return chrome.runtime.sendMessage(message).then(function (reply) {
        if (!reply || !reply.ok) throw new Error(reply ? reply.error : 'yanıt yok');
        return reply;
    });
}

function showAccount(auth) {
    if (auth) {
        rxAccount.textContent = auth.email + ' olarak giriş yapıldı (' + new Date(auth.signedInAt).toLocaleDateString('tr-TR') +
            (auth.source === 'site' ? ', oturum Rxalign sitesinden alındı' : '') + ')';
        rxAccount.className = 'ok';
        rxForm.style.display = 'none';
        rxSignOutButton.style.display = '';
    } else {
        rxAccount.textContent = 'giriş yapılmadı';
        rxAccount.className = 'warn';
        rxForm.style.display = '';
        rxSignOutButton.style.display = 'none';
    }
}

function rxNote(text, ok) {
    rxStatus.textContent = text;
    rxStatus.className = ok ? 'ok' : 'warn';
}

rxSignInButton.addEventListener('click', async function () {
    rxSignInButton.disabled = true;
    rxNote('giriş yapılıyor…', true);
    try {
        const reply = await rxSend({ type: 'ids-auth-signin', email: rxEmail.value, password: rxPassword.value });
        rxPassword.value = '';
        showAccount(reply.auth);
        rxNote('Giriş yapıldı.', true);
    } catch (error) {
        rxNote(error.message, false);
    }
    rxSignInButton.disabled = false;
});

rxPassword.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') rxSignInButton.click();
});

rxSignOutButton.addEventListener('click', async function () {
    try {
        await rxSend({ type: 'ids-auth-signout' });
        showAccount(null);
        rxNote('Çıkış yapıldı.', true);
    } catch (error) {
        rxNote(error.message, false);
    }
});

rxTestButton.addEventListener('click', async function () {
    rxTestButton.disabled = true;
    rxNote('deneniyor…', true);
    try {
        const reply = await rxSend({ type: 'ids-auth-test' });
        rxNote(reply.result.authenticated
            ? 'Kayıtlı formlar giriş yapılmış hesapla okunuyor.'
            : 'Kayıtlı formlar şu an girişsiz de okunuyor (bulut kuralları henüz kapatılmamış); yine de giriş yapın.', reply.result.authenticated);
    } catch (error) {
        rxNote('Okunamadı: ' + error.message, false);
    }
    rxTestButton.disabled = false;
});

rxSend({ type: 'ids-auth-state' }).then(function (reply) { showAccount(reply.auth); }).catch(function (error) {
    rxAccount.textContent = 'okunamadı: ' + error.message;
    rxAccount.className = 'warn';
});

// ---------- Ana klasör (eklenti kökeninde saklanır; siteler bridge.html üzerinden okur) ----------

const rootName = document.getElementById('rootName');
const rootPermission = document.getElementById('rootPermission');
const rootStatus = document.getElementById('rootStatus');

async function showRoot() {
    const info = await folder.rootStatus();
    if (!info.root) {
        rootName.textContent = 'seçilmedi';
        rootPermission.textContent = '';
        return;
    }
    rootName.textContent = info.root;
    rootPermission.textContent = info.permission === 'granted' ? '(okuma izni var)' : '(okuma izni gerekiyor)';
    rootPermission.className = info.permission === 'granted' ? 'ok' : 'warn';
}

document.getElementById('pickRoot').addEventListener('click', async function () {
    try {
        await folder.pickRoot();
        rootStatus.textContent = 'Kaydedildi.';
        rootStatus.className = 'ok';
        await chrome.storage.local.set({ idsfyRootGrantedAt: Date.now() });
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        rootStatus.textContent = 'Seçilemedi: ' + error.message;
        rootStatus.className = 'warn';
    }
    showRoot();
});

document.getElementById('grantRoot').addEventListener('click', async function () {
    try {
        const granted = await folder.grant();
        rootStatus.textContent = granted ? 'İzin verildi; IDS sekmesine dönebilirsiniz.' : 'İzin verilmedi.';
        rootStatus.className = granted ? 'ok' : 'warn';
        if (granted) await chrome.storage.local.set({ idsfyRootGrantedAt: Date.now() });
    } catch (error) {
        rootStatus.textContent = 'İzin alınamadı: ' + error.message;
        rootStatus.className = 'warn';
    }
    showRoot();
});

showRoot();

// ---------- Fotoğraf kırpma ----------

const cropBox = document.getElementById('cropPhotos');
const cropStatus = document.getElementById('cropStatus');
chrome.storage.local.get('idsfyCropPhotos').then(function (data) {
    cropBox.checked = data.idsfyCropPhotos !== false;
});
cropBox.addEventListener('change', function () {
    chrome.storage.local.set({ idsfyCropPhotos: cropBox.checked }).then(function () {
        cropStatus.textContent = cropBox.checked ? 'Kırpma açık.' : 'Kırpma kapalı; fotoğraflar olduğu gibi yüklenir.';
    });
});

// ---------- Güncelleme ----------

const autoBox = document.getElementById('autoInstall');
chrome.storage.local.get('autoInstall').then(function (data) {
    autoBox.checked = data.autoInstall !== false;
});
autoBox.addEventListener('change', function () {
    chrome.storage.local.set({ autoInstall: autoBox.checked });
});

const versionEl = document.getElementById('version');
const updaterStatus = document.getElementById('updaterStatus');
const updateStatus = document.getElementById('updateStatus');
const checkButton = document.getElementById('checkUpdate');
const installButton = document.getElementById('installUpdate');

versionEl.textContent = chrome.runtime.getManifest().version;

function send(message) {
    return chrome.runtime.sendMessage(message).then(function (reply) {
        if (!reply || !reply.ok) throw new Error(reply ? reply.error : 'yanıt yok');
        return reply;
    });
}

function when(stamp) {
    return stamp ? ' (son denetim ' + new Date(stamp).toLocaleString('tr-TR') + ')' : '';
}

function describeUpdate(update) {
    if (!update || !update.status) {
        return { text: update && update.error ? update.error + when(update.checkedAt) : 'henüz denetlenmedi', ok: !(update && update.error) };
    }
    const error = update.error ? ' — ' + update.error : '';
    switch (update.status) {
        case 'current': return { text: 'güncel (' + update.version + ')' + when(update.checkedAt) + error, ok: !update.error };
        case 'downloaded': return { text: update.version + ' indirildi, kurulmayı bekliyor' + when(update.checkedAt), ok: true };
        case 'manual': return { text: update.version + ' sürümü var; otomatik indirilemedi' + error + '. Guncelleyiciyi-Kur.bat çalıştırıldıktan sonra yeniden denetleyin ya da zip\'i elle kurun: ' + (update.url || ''), ok: false };
        case 'installed': return { text: update.version + ' kuruldu; eklenti yeniden başlıyor', ok: true };
        default: return { text: update.status + when(update.checkedAt) + error, ok: !update.error };
    }
}

function showUpdate(update) {
    const info = describeUpdate(update);
    updateStatus.textContent = info.text;
    updateStatus.className = info.ok ? 'ok' : 'warn';
    installButton.style.display = update && update.status === 'downloaded' ? '' : 'none';
}

async function showUpdater() {
    try {
        const reply = await send({ type: 'ids-update-ping' });
        updaterStatus.textContent = 'kurulu (eklenti klasörü: ' + reply.updater.dir + ')';
        updaterStatus.className = 'ok';
    } catch (error) {
        updaterStatus.textContent = error.message + ' — eklenti klasöründeki Guncelleyiciyi-Kur.bat dosyasını bir kez çalıştırın.';
        updaterStatus.className = 'warn';
    }
}

checkButton.addEventListener('click', async function () {
    checkButton.disabled = true;
    updateStatus.textContent = 'denetleniyor…';
    updateStatus.className = '';
    try {
        const reply = await send({ type: 'ids-update-check' });
        showUpdate(reply.update);
    } catch (error) {
        updateStatus.textContent = 'denetlenemedi: ' + error.message;
        updateStatus.className = 'warn';
    }
    checkButton.disabled = false;
    showUpdater();
});

installButton.addEventListener('click', async function () {
    installButton.disabled = true;
    updateStatus.textContent = 'kuruluyor…';
    try {
        const reply = await send({ type: 'ids-update-install' });
        updateStatus.textContent = reply.result.version + ' kuruldu; eklenti yeniden başlıyor, bu sayfa kapanabilir.';
        updateStatus.className = 'ok';
    } catch (error) {
        updateStatus.textContent = 'kurulamadı: ' + error.message;
        updateStatus.className = 'warn';
        installButton.disabled = false;
    }
});

chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.idsUpdate) showUpdate(changes.idsUpdate.newValue);
});

send({ type: 'ids-update-state' }).then(function (reply) { showUpdate(reply.update); }).catch(function () {});
showUpdater();
