@echo off
chcp 65001 >nul
where adb >nul 2>nul
if errorlevel 1 set "PATH=%~dp0platform-tools;%PATH%"
set /p IP=Adresse IP de la TV (ou IP:port) : 
echo %IP% | find ":" >nul
if errorlevel 1 set "IP=%IP%:5555"
adb connect %IP%
adb -s %IP% push "%~dp0tv.sh" /data/local/tmp/benauge_crlf.sh >nul
adb -s %IP% shell "tr -d '\r' < /data/local/tmp/benauge_crlf.sh > /data/local/tmp/benauge.sh; rm /data/local/tmp/benauge_crlf.sh"
adb -s %IP% shell sh /data/local/tmp/benauge.sh restaurer
echo Pour retirer l'appli : adb -s %IP% uninstall fr.benauge.ecran
pause
