#!/bin/sh
# Écran Benauge : installation sur la TV (macOS / Linux). Il faut adb (SDK Platform-Tools).
cd "$(dirname "$0")"
[ -f EcranBenauge.apk ] || { echo "Place EcranBenauge.apk à côté de ce fichier, puis relance."; exit 1; }
printf "Appairage par code (Débogage sans fil > Associer avec un code) ? Tape IP:port, sinon Entrée : "; read PAIR
[ -n "$PAIR" ] && adb pair "$PAIR"
printf "Adresse IP de la TV (ou IP:port affiché par le débogage sans fil) : "; read IP
case "$IP" in *:*) ;; *) IP="$IP:5555" ;; esac
adb connect "$IP"
printf "Accepte la demande sur la TV, puis Entrée. "; read _
adb -s "$IP" install -r EcranBenauge.apk || { echo "Installation refusée. Sur la TV, choisis « Installer quand même », puis relance."; exit 1; }
adb -s "$IP" shell appops set fr.benauge.ecran SYSTEM_ALERT_WINDOW allow
adb -s "$IP" shell am start -n fr.benauge.ecran/.MainActivity
tr -d '\r' < tv.sh > .tv.tmp && adb -s "$IP" push .tv.tmp /data/local/tmp/benauge.sh >/dev/null; rm -f .tv.tmp
printf "La mettre comme écran d'accueil de la TV, pour qu'elle démarre toute seule ? (o/n) : "; read H
if [ "$H" = "o" ]; then adb -s "$IP" shell sh /data/local/tmp/benauge.sh installer accueil
else adb -s "$IP" shell sh /data/local/tmp/benauge.sh installer; fi
