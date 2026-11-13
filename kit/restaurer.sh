#!/bin/sh
# Écran Benauge : remet la TV comme avant (macOS / Linux).
cd "$(dirname "$0")"
printf "Adresse IP de la TV (ou IP:port) : "; read IP
case "$IP" in *:*) ;; *) IP="$IP:5555" ;; esac
adb connect "$IP"
tr -d '\r' < tv.sh > .tv.tmp && adb -s "$IP" push .tv.tmp /data/local/tmp/benauge.sh >/dev/null; rm -f .tv.tmp
adb -s "$IP" shell sh /data/local/tmp/benauge.sh restaurer
echo "Pour retirer l'appli : adb -s $IP uninstall fr.benauge.ecran"
