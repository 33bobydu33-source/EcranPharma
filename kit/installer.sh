#!/bin/sh
# Écran Benauge : installation sur la TV (macOS / Linux). Il faut adb (SDK Platform-Tools).
cd "$(dirname "$0")"
printf "Adresse IP de la TV : "; read IP
adb connect "$IP:5555"
printf "Accepte la demande sur la TV, puis Entrée. "; read _
adb -s "$IP:5555" install -r EcranBenauge.apk
adb -s "$IP:5555" shell appops set fr.benauge.ecran SYSTEM_ALERT_WINDOW allow
adb -s "$IP:5555" shell am start -n fr.benauge.ecran/.MainActivity
printf "La mettre comme écran d'accueil de la TV ? (o/n) : "; read H
if [ "$H" = "o" ]; then
  adb -s "$IP:5555" shell cmd package set-home-activity fr.benauge.ecran/.MainActivity
  adb -s "$IP:5555" shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
  adb -s "$IP:5555" shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
fi
