# IDS Yardimcisi guncelleyici kurulumu (bu bilgisayarda, bu kullanici icin bir kez).
# Chrome'a yerel mesajlasma sunucusunu tanitir: HKCU kaydi + updater-host.json.
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

$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value $jsonPath

Write-Host ''
Write-Host 'IDS Yardimcisi guncelleyici kuruldu.'
Write-Host ('Eklenti klasoru : ' + $extensionDir)
Write-Host ('Kayit           : ' + $key)
Write-Host ''
Write-Host 'Simdi Chrome''da chrome://extensions sayfasini acin, Gelistirici modu acikken'
Write-Host '"Paketlenmemis oge yukle" ile yukaridaki eklenti klasorunu secin (eklenti zaten'
Write-Host ('yukluyse kartindaki Yenile simgesine basin). Eklenti kimligi: ' + $extensionId)
