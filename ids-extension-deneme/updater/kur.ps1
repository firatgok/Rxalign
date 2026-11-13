# IDS Yardimcisi guncelleyici kurulumu (bu bilgisayarda, bu kullanici icin bir kez).
# Chrome ve Edge'e yerel mesajlasma sunucusunu tanitir: HKCU kayitlari + updater-host.json.
# Eklenti klasoru = bu dosyanin ust klasoru; guncellemeler oraya acilir.
$ErrorActionPreference = 'Stop'
$extensionId = 'bgepiaaakgecaoehcgjakjcoaejcoiip'
$hostName = 'com.rxalign.idsupdater'
$updaterDir = $PSScriptRoot
$extensionDir = Split-Path -Parent $updaterDir

# Onceki guncellemeden kalan yeni betik varsa yerine konur.
$pending = Join-Path $updaterDir 'updater.ps1.new'
if (Test-Path -LiteralPath $pending) {
    [IO.File]::Copy($pending, (Join-Path $updaterDir 'updater.ps1'), $true)
    [IO.File]::Delete($pending)
}

$batPath = Join-Path $updaterDir 'updater.bat'
if (-not (Test-Path -LiteralPath $batPath)) { throw ('updater.bat bulunamadi: ' + $batPath) }
$manifest = [ordered]@{
    name = $hostName
    description = 'IDS Yardimcisi guncelleyici'
    path = $batPath
    type = 'stdio'
    allowed_origins = @('chrome-extension://' + $extensionId + '/')
}
$jsonPath = Join-Path $updaterDir 'updater-host.json'
$json = $manifest | ConvertTo-Json
[IO.File]::WriteAllText($jsonPath, $json, (New-Object Text.UTF8Encoding $false))

# rxalign-ids:// baglanti turu: Rxalign arsivindeki "IDS'te ac" dugmesi, eklentinin kurulu OLMADIGI tarayicida basilinca
# bu baglantiyi cagirir; Windows eklentinin kurulu oldugu tarayiciyi kopru sayfasiyla (ids-ac.html) acar.
function Find-Browser($which) {
    if ($which -eq 'edge') { $exe = 'msedge.exe'; $rel = 'Microsoft\Edge\Application\msedge.exe' }
    else { $exe = 'chrome.exe'; $rel = 'Google\Chrome\Application\chrome.exe' }
    $roots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\'
    )
    foreach ($r in $roots) {
        try {
            $p = (Get-ItemProperty -LiteralPath ($r + $exe) -ErrorAction Stop).'(default)'
            if ($p) { $p = $p.Trim('"'); if (Test-Path -LiteralPath $p) { return $p } }
        } catch {}
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($base) { $p = Join-Path $base $rel; if (Test-Path -LiteralPath $p) { return $p } }
    }
    return $null
}

function Register-Protocol($which) {
    $exe = Find-Browser $which
    if (-not $exe) { throw ('tarayici bulunamadi: ' + $which) }
    $key = 'HKCU:\Software\Classes\rxalign-ids'
    $cmdKey = $key + '\shell\open\command'
    New-Item -Path $cmdKey -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:IDS Yardimcisi'
    Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
    # "--" tarayicinin anahtar okumasini bitirir: baglantidan gelen metin anahtar olarak yorumlanamaz.
    Set-ItemProperty -Path $cmdKey -Name '(default)' -Value ('"' + $exe + '" -- "https://rxalign.fgoapps.com/ids-ac.html#%1"')
    return $exe
}

$keys = @(
    ('HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName),
    ('HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\' + $hostName)
)
foreach ($key in $keys) {
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value $jsonPath
}

# Baglanti turu: Chrome varsa Chrome, yoksa Edge (eklenti sonradan kendi tarayicisina gore yeniden kaydeder).
$protocolExe = $null
try { $protocolExe = Register-Protocol 'chrome' } catch { try { $protocolExe = Register-Protocol 'edge' } catch {} }

Write-Host ''
Write-Host 'IDS Yardimcisi guncelleyici kuruldu.'
if ($protocolExe) { Write-Host ('IDS''te ac baglantisi: ' + $protocolExe) }
Write-Host ('Eklenti klasoru : ' + $extensionDir)
Write-Host ('Kayit           : ' + ($keys -join ', '))
Write-Host ''
Write-Host 'Simdi Chrome''da chrome://extensions ya da Edge''de edge://extensions sayfasini acin, Gelistirici modu'
Write-Host 'acikken "Paketlenmemis oge yukle" (Edge: "Acilmisi yukle") ile yukaridaki eklenti klasorunu secin (eklenti zaten'
Write-Host ('yukluyse kartindaki Yenile simgesine basin). Eklenti kimligi: ' + $extensionId)
