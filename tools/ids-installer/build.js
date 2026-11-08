// IDS Yardımcısı kurulum dosyası üretir (Inno Setup 6): yayındaki zip'in içeriğini paketler, deneme klasörünü değil.
//   node tools/ids-installer/build.js [--out KLASÖR] [--iss DOSYA] [--version 0.34.0]
// Çıktı: tools/ids-installer/build_out/IDS-Yardimcisi-Kurulum-<sürüm>.exe (git'e girmez). Rehber resimleri yoksa make_guide.py üretir
// (gerçek Chrome ve Edge'in geçici profilde açılmış eklenti sayfasından; py + playwright + pillow gerekir).
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const here = __dirname;
const root = path.resolve(here, '..', '..');
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };

function findIscc() {
    const bases = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env['ProgramFiles(x86)'], process.env.ProgramFiles];
    for (const b of bases) {
        if (!b) continue;
        const c = path.join(b, 'Inno Setup 6', 'ISCC.exe');
        if (fs.existsSync(c)) return c;
    }
    throw new Error('Inno Setup 6 (ISCC.exe) bulunamadı');
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
}

const outDir = path.resolve(arg('--out', path.join(here, 'build_out')));
const iss = path.resolve(arg('--iss', path.join(here, 'ids-yardimcisi.iss')));
const latest = JSON.parse(fs.readFileSync(path.join(root, 'ids-extension-release', 'latest.json'), 'utf8'));
const zip = path.join(root, 'ids-extension-release', 'ids-yardimcisi-' + latest.version + '.zip');
if (!fs.existsSync(zip)) throw new Error('yayın zip dosyası yok: ' + zip);

// Zip geçici klasöre açılır, gizli ve makineye özel dosya taşımadığı denetlenir.
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ids-kurulum-'));
try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', "Expand-Archive -LiteralPath '" + zip + "' -DestinationPath '" + stage + "' -Force"], { stdio: 'inherit' });
    let ext = stage;
    const top = fs.readdirSync(stage);
    if (top.length === 1 && fs.statSync(path.join(stage, top[0])).isDirectory()) ext = path.join(stage, top[0]);
    const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
    if (manifest.version !== latest.version) throw new Error('zip sürümü latest.json ile aynı değil');
    const bad = walk(ext).filter((f) => /\.pem$|updater-host\.json$|\.new$/i.test(f));
    if (bad.length) throw new Error('pakete girmemesi gereken dosyalar: ' + bad.join(', '));

    const img = path.join(here, 'installer_img');
    if (!fs.existsSync(path.join(img, 'ext_guide_100.bmp'))) {
        execFileSync('py', [path.join(here, 'make_guide.py'), img], { stdio: 'inherit' });
    }
    const version = arg('--version', latest.version);
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync(findIscc(), ['/Qp', '/DAppVersion=' + version, '/DExtDir=' + ext, '/DOutputDir=' + outDir, '/DImgDir=' + img, iss], { stdio: 'inherit' });
    const exe = path.join(outDir, 'IDS-Yardimcisi-Kurulum-' + version + '.exe');
    const data = fs.readFileSync(exe);
    console.log('Kurulum dosyası: ' + exe);
    console.log('Eklenti sürümü ' + manifest.version + ', ' + (data.length / 1048576).toFixed(1) + ' MB, sha256 ' + crypto.createHash('sha256').update(data).digest('hex'));
} finally {
    fs.rmSync(stage, { recursive: true, force: true });
}
