// IDS Yardımcısı sürüm yayını.
//   node tools/release.js            -> zip + latest.json üretir (ids-extension-release/), Downloads'a kopyalar
//   node tools/release.js --push     -> ayrıca commit + push (birkaç dakika içinde eklentiler güncellemeyi görür)
//   node tools/release.js --notes "…" -> latest.json'a sürüm notu
// Zip saf Node ile yazılır (deflate, CRC32); updater-host.json ve anahtar dosyaları dışarıda kalır.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'ids-extension');
const releaseDir = path.join(root, 'ids-extension-release');
const SITE = 'https://raw.githubusercontent.com/firatgok/Rxalign/main/ids-extension-release/'; // depo herkese açık; rxalign.fgoapps.com'un HTTPS sertifikası olmadığından site adresi kullanılmıyor
const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_FILES = new Set(['updater-host.json', 'updater.ps1.new', 'updater.bat.new', '.DS_Store']);

const args = process.argv.slice(2);
const push = args.includes('--push');
const notesIndex = args.indexOf('--notes');
const notes = notesIndex >= 0 ? args[notesIndex + 1] || '' : '';

const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const version = manifest.version;

function listFiles(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            out.push(...listFiles(path.join(dir, entry.name), prefix + entry.name + '/'));
        } else if (!SKIP_FILES.has(entry.name)) {
            out.push({ name: prefix + entry.name, file: path.join(dir, entry.name) });
        }
    }
    return out;
}

// Basit zip yazıcı (yerel başlık + merkezi dizin, deflate).
function dosTime(date) {
    const t = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
    const d = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
    return { t, d };
}

function buildZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const now = dosTime(new Date());
    for (const entry of entries) {
        const data = fs.readFileSync(entry.file);
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const useDeflate = deflated.length < data.length;
        const body = useDeflate ? deflated : data;
        const crc = zlib.crc32(data) >>> 0;
        const method = useDeflate ? 8 : 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 adlar
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(now.t, 10);
        local.writeUInt16LE(now.d, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, body);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(now.t, 12);
        central.writeUInt16LE(now.d, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + body.length;
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, ...centrals, end]);
}

const entries = listFiles(ext, '');
const zip = buildZip(entries);
fs.mkdirSync(releaseDir, { recursive: true });
const zipName = 'ids-yardimcisi-' + version + '.zip';
fs.writeFileSync(path.join(releaseDir, zipName), zip);
const latest = {
    version: version,
    url: SITE + zipName,
    notes: notes,
    at: new Date().toISOString()
};
fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
// Eski sürüm zip'leri silinir (yalnızca sonuncusu kalır).
for (const f of fs.readdirSync(releaseDir)) {
    if (/^ids-yardimcisi-.*\.zip$/.test(f) && f !== zipName) fs.unlinkSync(path.join(releaseDir, f));
}
const downloads = path.join(process.env.USERPROFILE || '', 'Downloads', zipName);
try { fs.copyFileSync(path.join(releaseDir, zipName), downloads); } catch (e) { /* yoksa geç */ }
console.log('Sürüm ' + version + ': ' + entries.length + ' dosya, ' + zip.length + ' bayt -> ' + path.join(releaseDir, zipName));
console.log('latest.json: ' + latest.url);

if (push) {
    const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
    run('git add ids-extension-release');
    run('git commit -q -m "IDS Yardımcısı ' + version + ' yayını' + (notes ? ': ' + notes.replace(/"/g, '') : '') + '\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"');
    run('git push -q origin main');
    console.log('Yayınlandı: ' + latest.url);
}
