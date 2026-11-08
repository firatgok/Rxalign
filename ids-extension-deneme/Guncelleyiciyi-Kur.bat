@echo off
rem IDS Yardimcisi: otomatik guncelleme icin guncelleyiciyi bu bilgisayara kurar.
rem Bu dosyayi eklenti klasorunun icinden (zip'i actiginiz yerden) calistirin.
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0updater\kur.ps1"
echo.
pause
