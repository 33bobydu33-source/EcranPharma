@echo off
chcp 65001 >nul
where adb >nul 2>nul
if errorlevel 1 set "PATH=%~dp0platform-tools;%PATH%"
set /p IP=Adresse IP de la TV : 
adb connect %IP%:5555
adb -s %IP%:5555 shell pm enable com.google.android.apps.tv.launcherx
adb -s %IP%:5555 shell pm enable com.google.android.tungsten.setupwraith
echo L'accueil Google TV est retabli. Pour retirer l'appli : adb uninstall fr.benauge.ecran
pause
