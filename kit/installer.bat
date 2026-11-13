@echo off
chcp 65001 >nul
echo ============================================
echo   Ecran Benauge : installation sur la TV
echo ============================================
echo.
echo Avant de commencer, sur la TV :
echo   Parametres ^> Systeme ^> A propos : 7 appuis sur "Build" (mode developpeur)
echo   Parametres ^> Systeme ^> Options pour les developpeurs : activer "Debogage USB" (ou "Debogage sans fil")
echo.
where adb >nul 2>nul
if errorlevel 1 (
  if exist "%~dp0platform-tools\adb.exe" ( set "PATH=%~dp0platform-tools;%PATH%" ) else (
    echo adb est introuvable. Telecharge "SDK Platform-Tools" de Google et decompresse le dossier
    echo "platform-tools" a cote de ce fichier, puis relance.
    pause & exit /b 1
  )
)
if not exist "%~dp0EcranBenauge.apk" ( echo Place EcranBenauge.apk a cote de ce fichier, puis relance. & pause & exit /b 1 )
if not exist "%~dp0tv.sh" ( echo Le fichier tv.sh doit rester a cote de ce fichier. & pause & exit /b 1 )
set "PAIR="
set /p PAIR=Appairage par code (Debogage sans fil ^> Associer avec un code) ? Tape IP:port, sinon Entree : 
if not "%PAIR%"=="" adb pair %PAIR%
set /p IP=Adresse IP de la TV (ou IP:port affiche par le debogage sans fil) : 
echo %IP% | find ":" >nul
if errorlevel 1 set "IP=%IP%:5555"
adb connect %IP%
echo Accepte la demande qui s'affiche sur la TV, puis appuie sur une touche.
pause >nul
adb -s %IP% install -r "%~dp0EcranBenauge.apk"
if errorlevel 1 ( echo Installation refusee. Sur la TV, choisis "Installer quand meme", puis relance. & pause & exit /b 1 )
adb -s %IP% shell appops set fr.benauge.ecran SYSTEM_ALERT_WINDOW allow
adb -s %IP% shell am start -n fr.benauge.ecran/.MainActivity
adb -s %IP% push "%~dp0tv.sh" /data/local/tmp/benauge_crlf.sh >nul
adb -s %IP% shell "tr -d '\r' < /data/local/tmp/benauge_crlf.sh > /data/local/tmp/benauge.sh; rm /data/local/tmp/benauge_crlf.sh"
echo.
echo L'appli est installee et lancee.
echo.
set /p ACC=La mettre comme ecran d'accueil de la TV, pour qu'elle demarre toute seule ? (o/n) : 
if /i "%ACC%"=="o" (
  adb -s %IP% shell sh /data/local/tmp/benauge.sh installer accueil
  echo Pour revenir en arriere : lance restaurer.bat
) else (
  adb -s %IP% shell sh /data/local/tmp/benauge.sh installer
)
pause
