@echo off
rem IDS Yardimcisi guncelleyici: Chrome bu dosyayi yerel mesajlasma sunucusu olarak baslatir.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0updater.ps1"
