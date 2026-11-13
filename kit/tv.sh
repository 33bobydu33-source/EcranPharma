#!/system/bin/sh
# Écran Benauge : partie qui s'exécute SUR la télé (envoyée par installer / restaurer).
# Ordre des opérations et retour arrière repris du kit unbloat-android-tv (xMazaki, licence MIT).
APP=fr.benauge.ecran
ACT=$APP/.MainActivity
GTV=com.google.android.tungsten.setupwraith      # écran de secours de Google TV
ETAT=${BENAUGE_ETAT:-/data/local/tmp/benauge_etat.txt}

# Pubs, télémétrie et mode démo TCL : rien d'utile à l'écran de la pharmacie
TCL="com.tcl.bi com.tcl.bootadservice com.tcl.messagebox com.tcl.logkit com.tcl.esticker com.tcl.showmode com.tcl.exhibit com.tcl.useragreement com.tcl.tvweishi com.tcl.notereminder com.tcl.tv.tclhome_passive"

accueil() { cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tr -d '\r' | sed -e 's/^ *//' -e 's/ *$//' | grep -E '^[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+$' | tail -n 1; }
actif() { pm list packages -e | tr -d '\r' | grep -qx "package:$1"; }
couper() { if actif "$1"; then pm disable-user --user 0 "$1" >/dev/null 2>&1; if ! actif "$1"; then echo "PKG $1" >> "$ETAT"; echo "   coupé : $1"; fi; fi; }
role() { sdk=$(getprop ro.build.version.sdk | tr -d '\r'); if [ "${sdk:-0}" -ge 29 ] 2>/dev/null; then cmd role add-role-holder android.app.role.HOME "$1" >/dev/null 2>&1; fi; }
# Vrai si le Wi-Fi de la télé a été enregistré par l'écran de secours Google : le couper effacerait ce Wi-Fi
wifi_secours() {
  w=$(dumpsys wifi 2>/dev/null)
  if echo "$w" | grep -q "Configured networks Begin"; then w=$(echo "$w" | sed -n '/Configured networks Begin/,/Configured networks End/p'); fi
  echo "$w" | grep -Eq '(cname|creatorName)=com\.google\.android\.tungsten\.setupwraith'
}
ethernet() { ip -o -4 addr show 2>/dev/null | grep -q '^[0-9]*: *eth'; }
retablir() {   # réactive dans l'ordre inverse : l'accueil d'origine revient avant l'écran de secours
  inv=""; orig=""
  if [ -f "$ETAT" ]; then
    while read -r t v; do case "$t" in PKG) inv="$v $inv" ;; HOME) orig="$v" ;; esac; done < "$ETAT"
  fi
  for p in $inv; do pm enable "$p" >/dev/null 2>&1 && echo "   rétabli : $p"; done
  rm -f "$ETAT"
}

case "$1" in
installer)
  echo "1. Pubs et mode démo TCL"
  for p in $TCL; do couper "$p"; done
  [ "$2" = "accueil" ] || { echo "Terminé."; exit 0; }
  echo "2. Écran d'accueil"
  orig=$(accueil); case "$orig" in "$APP"/*|android/*) orig="" ;; esac
  grep -q '^HOME ' "$ETAT" 2>/dev/null || { [ -n "$orig" ] && echo "HOME $orig" >> "$ETAT"; }
  garder=0
  if actif "$GTV" && wifi_secours && ! ethernet; then garder=1; fi
  if [ $garder = 1 ]; then
    echo "   Le Wi-Fi de la télé a été enregistré pendant sa toute première configuration."
    echo "   Couper l'accueil Google effacerait ce Wi-Fi : je ne coupe donc rien."
    cmd package set-home-activity "$ACT" >/dev/null 2>&1; role "$APP"; input keyevent KEYCODE_HOME; sleep 5
    case "$(accueil)" in "$APP"/*) echo "OK : l'écran Benauge est l'écran d'accueil (sans rien couper)." ;;
      *) echo "A FAIRE : sur la télé, Paramètres > Réseau, « Oublier » le Wi-Fi et les autres réseaux enregistrés,"
         echo "reconnecte-toi en retapant le mot de passe, puis relance l'installation. (Ou branche la télé en Ethernet.)" ;; esac
    exit 0
  fi
  # l'écran de secours AVANT l'accueil d'origine : dans l'autre ordre la télé peut tourner en boucle
  couper "$GTV"
  [ -n "$orig" ] && couper "${orig%%/*}"
  cmd package set-home-activity "$ACT" >/dev/null 2>&1; role "$APP"; input keyevent KEYCODE_HOME; sleep 5
  case "$(accueil)" in
    "$APP"/*) echo "OK : l'écran Benauge est l'écran d'accueil de la télé."
              echo "Attends 15 secondes avant d'éteindre ou de redémarrer la télé." ;;
    *) echo "La télé refuse l'écran Benauge comme accueil (retenu : $(accueil))."
       echo "Je remets tout comme avant, rien n'est perdu :"
       if [ -n "$orig" ]; then pm enable "${orig%%/*}" >/dev/null 2>&1 && echo "   rétabli : ${orig%%/*}"; fi
       pm enable "$GTV" >/dev/null 2>&1 && echo "   rétabli : $GTV"
       grep -v -e "^PKG $GTV\$" -e "^PKG ${orig%%/*}\$" -e '^HOME ' "$ETAT" > "$ETAT.t" 2>/dev/null; mv "$ETAT.t" "$ETAT"
       input keyevent KEYCODE_HOME
       echo "L'appli reste installée : elle se lance depuis les applis de la télé." ;;
  esac ;;
restaurer)
  if [ -f "$ETAT" ]; then retablir
  else pm enable com.google.android.apps.tv.launcherx >/dev/null 2>&1; pm enable "$GTV" >/dev/null 2>&1; orig=""; fi
  if [ -n "$orig" ]; then cmd package set-home-activity "$orig" >/dev/null 2>&1; role "${orig%%/*}"; fi
  input keyevent KEYCODE_HOME
  echo "L'accueil d'origine de la télé est rétabli." ;;
*) echo "usage : installer [accueil] | restaurer" ;;
esac
