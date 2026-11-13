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
set /p IP=Adresse IP de la TV (Parametres ^> Reseau) : 
adb connect %IP%:5555
echo Accepte la demande qui s'affiche sur la TV, puis appuie sur une touche.
pause >nul
adb -s %IP%:5555 install -r "%~dp0EcranBenauge.apk"
adb -s %IP%:5555 shell appops set fr.benauge.ecran SYSTEM_ALERT_WINDOW allow
adb -s %IP%:5555 shell am start -n fr.benauge.ecran/.MainActivity
echo.
echo L'appli est installee et lancee.
echo.
set /p HOME=La mettre comme ecran d'accueil de la TV, pour qu'elle demarre toute seule ? (o/n) : 
if /i "%HOME%"=="o" (
  adb -s %IP%:5555 shell cmd package set-home-activity fr.benauge.ecran/.MainActivity
  adb -s %IP%:5555 shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
  adb -s %IP%:5555 shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
  echo Fait. Pour revenir en arriere : lance restaurer.bat
)
pause
