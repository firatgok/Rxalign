# IDS Yardimcisi guncelleyici - Chrome yerel mesajlasma sunucusu (native messaging host).
# Eklentinin arka plani 4 baytlik uzunluk + JSON ile konusur; her calismada tek mesaj islenir. Eylemler:
#   ping     -> { ok, version, dir }
#   download -> { ok, path, size }  (zip gecici klasore indirilir)
#   install  -> { ok, version }     (zip acilip eklenti klasorunun uzerine kopyalanir)
# Bu dosya ASCII tutulur (PowerShell 5.1, BOM'suz UTF-8'de Turkce karakteri bozar).
# Silme islemleri .NET ile yapilir: Remove-Item, kisa (8.3) gecici klasor yollarinda hata verir.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$updaterDir = $PSScriptRoot
$dir = Split-Path -Parent $updaterDir
$tempDir = [IO.Path]::GetTempPath()
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

# Onceki guncellemenin biraktigi yeni betik varsa yerine konur (calisan betik degistirilmez, bir sonraki calisma yenisini kullanir).
$pendingScript = Join-Path $updaterDir 'updater.ps1.new'
if (Test-Path -LiteralPath $pendingScript) {
    try { [IO.File]::Copy($pendingScript, (Join-Path $updaterDir 'updater.ps1'), $true); [IO.File]::Delete($pendingScript) } catch {}
}

function Read-Message {
    $lenBytes = New-Object byte[] 4
    $n = $stdin.Read($lenBytes, 0, 4)
    if ($n -lt 4) { return $null }
    $len = [BitConverter]::ToInt32($lenBytes, 0)
    if ($len -le 0 -or $len -gt 1048576) { return $null }
    $buf = New-Object byte[] $len
    $read = 0
    while ($read -lt $len) {
        $r = $stdin.Read($buf, $read, $len - $read)
        if ($r -le 0) { break }
        $read += $r
    }
    $text = [Text.Encoding]::UTF8.GetString($buf, 0, $read)
    return ($text | ConvertFrom-Json)
}

function Write-Message($obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 5
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $stdout.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Get-ExtensionVersion {
    $manifest = Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw | ConvertFrom-Json
    return $manifest.version
}

function Get-TempZip($version) {
    return Join-Path $tempDir ('ids-yardimcisi-' + $version + '.zip')
}

function Download-Zip($url, $version) {
    if ($url -notmatch '^https://') { throw 'zip adresi https degil' }
    $zip = Get-TempZip $version
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    return $zip
}

function Install-Zip($zip) {
    $stage = Join-Path $tempDir ('ids-yardimcisi-stage-' + [Guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
    $items = @(Get-ChildItem -LiteralPath $stage -Force)
    if ($items.Count -eq 1 -and $items[0].PSIsContainer) { $stage = $items[0].FullName }
    if (-not (Test-Path -LiteralPath (Join-Path $stage 'manifest.json'))) { throw 'zip icinde manifest.json yok' }
    Get-ChildItem -LiteralPath $stage -Force | ForEach-Object {
        if ($_.PSIsContainer -and $_.Name -eq 'updater') {
            # Calisan betik (updater.ps1) .new olarak birakilir; updater.bat ve makineye ozel
            # updater-host.json yerinde kalir; kur.ps1 gibi digerleri dogrudan kopyalanir.
            $target = Join-Path $dir 'updater'
            if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
            Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object {
                $name = $_.Name
                if ($name -eq 'updater-host.json') { return }
                if ($name -eq 'updater.ps1') {
                    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target 'updater.ps1.new') -Force
                } elseif ($name -eq 'updater.bat') {
                    if (-not (Test-Path -LiteralPath (Join-Path $target $name))) {
                        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $name) -Force
                    }
                } else {
                    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $name) -Recurse -Force
                }
            }
        } else {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dir $_.Name) -Recurse -Force
        }
    }
    try { [IO.Directory]::Delete($stage, $true) } catch {}
}

function Remove-OldTemp {
    # Onceki surumlerden kalan gecici zip ve acilmis klasorler temizlenir.
    try {
        foreach ($f in [IO.Directory]::GetFiles($tempDir, 'ids-yardimcisi-*.zip')) { try { [IO.File]::Delete($f) } catch {} }
        foreach ($d in [IO.Directory]::GetDirectories($tempDir, 'ids-yardimcisi-stage-*')) { try { [IO.Directory]::Delete($d, $true) } catch {} }
    } catch {}
}

try {
    $msg = Read-Message
    if ($null -eq $msg) { exit 0 }
    switch ($msg.action) {
        'ping' {
            Write-Message @{ ok = $true; version = (Get-ExtensionVersion); dir = $dir; updater = '1.1' }
        }
        'download' {
            Remove-OldTemp
            $zip = Download-Zip $msg.url $msg.version
            Write-Message @{ ok = $true; path = $zip; size = ([IO.FileInfo]$zip).Length }
        }
        'install' {
            $zip = Get-TempZip $msg.version
            if (-not (Test-Path -LiteralPath $zip)) { $zip = Download-Zip $msg.url $msg.version }
            Install-Zip $zip
            Remove-OldTemp
            Write-Message @{ ok = $true; version = (Get-ExtensionVersion) }
        }
        default {
            Write-Message @{ ok = $false; error = ('bilinmeyen eylem: ' + $msg.action) }
        }
    }
} catch {
    Write-Message @{ ok = $false; error = $_.Exception.Message }
}
