#!/usr/bin/env bash
# MIRA Odin-API – Installation auf Odin
#
# Aufruf (als root, im entpackten Paketverzeichnis):
#   sudo ./install.sh --listen <ODIN_IP> --allow <ASGARD_IP> [--port 8443]
#
# Optionen:
#   --listen IP       Adresse, auf der die API lauscht (LAN-Schnittstelle im Server-VLAN)
#   --allow IP        Einzige Adresse, die zugreifen darf (Asgard); mehrfach angebbar
#   --port PORT       API-Port (Standard 8443)
#   --rotate-token    neues Zugriffstoken erzeugen (altes wird ungültig)
#   --rotate-cert     neues Zertifikat erzeugen (Fingerprint in MIRA anpassen!)
#   --yes             keine Rückfragen (z. B. Installation von Node.js)
#
# Das Skript ist wiederholbar: Vorhandenes Zertifikat, Token und Konfiguration
# bleiben erhalten, sofern nicht ausdrücklich erneuert.
set -euo pipefail

APP_DIR=/opt/mira-odin-api
CONF_DIR=/etc/mira-odin-api
SERVICE=mira-odin-api
FW_SERVICE=mira-odin-api-firewall
USER_NAME=mira-agent
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

LISTEN=""
ALLOW=()
PORT=8443
ROTATE_TOKEN=0
ROTATE_CERT=0
ASSUME_YES=0

die() { echo "FEHLER: $*" >&2; exit 1; }
info() { echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --listen) LISTEN="${2:-}"; shift 2 ;;
    --allow) ALLOW+=("${2:-}"); shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --rotate-token) ROTATE_TOKEN=1; shift ;;
    --rotate-cert) ROTATE_CERT=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1 (siehe --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausführen."
[ -f "$SRC_DIR/odin-api.mjs" ] || die "odin-api.mjs nicht gefunden – Skript im entpackten Paket ausführen."

is_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

# Werte aus vorhandener Konfiguration übernehmen, falls nicht angegeben
if [ -f "$CONF_DIR/config.json" ]; then
  info "Vorhandene Konfiguration $CONF_DIR/config.json wird beibehalten."
  [ -z "$LISTEN" ] || echo "HINWEIS: --listen/--allow/--port werden ignoriert, solange die Konfiguration existiert (ggf. dort anpassen)."
else
  [ -n "$LISTEN" ] || die "--listen <ODIN_IP> fehlt."
  [ ${#ALLOW[@]} -gt 0 ] || die "--allow <ASGARD_IP> fehlt."
  is_ipv4 "$LISTEN" || die "--listen muss eine IPv4-Adresse sein."
  for a in "${ALLOW[@]}"; do is_ipv4 "$a" || die "--allow muss eine IPv4-Adresse sein: $a"; done
  [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || die "--port muss zwischen 1024 und 65535 liegen."
  ip -o -4 addr show | grep -qw "$LISTEN" || die "Die Adresse $LISTEN ist auf diesem System nicht konfiguriert."
fi

# ---------------------------------------------------------------- Node.js
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  info "Node.js ≥ 22 wird benötigt (gefunden: ${NODE_MAJOR:-keins})."
  if [ "$ASSUME_YES" -ne 1 ]; then
    read -r -p "Node.js aus den Ubuntu-Paketquellen installieren (apt install nodejs)? [j/N] " answer
    [[ "$answer" =~ ^[jJyY]$ ]] || die "Abgebrochen – Node.js fehlt."
  fi
  apt-get update -q
  apt-get install -y -q nodejs
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  [ "$NODE_MAJOR" -ge 22 ] || die "Installiertes Node.js ist zu alt ($NODE_MAJOR)."
fi
NODE_BIN="$(command -v node)"

# ---------------------------------------------------------------- Benutzer und Dateien
if ! getent passwd "$USER_NAME" >/dev/null; then
  info "Lege Dienstbenutzer $USER_NAME an (ohne Login, ohne sudo)."
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$USER_NAME"
fi

info "Installiere Programm nach $APP_DIR."
install -d -o root -g root -m 755 "$APP_DIR"
install -o root -g root -m 644 "$SRC_DIR/odin-api.mjs" "$APP_DIR/odin-api.mjs"
install -d -o root -g "$USER_NAME" -m 750 "$CONF_DIR"

# ---------------------------------------------------------------- Konfiguration
if [ ! -f "$CONF_DIR/config.json" ]; then
  info "Schreibe $CONF_DIR/config.json."
  # ergibt "a","b" – das Template enthält bereits die eckigen Klammern
  ALLOW_JSON=$(printf '"%s",' "${ALLOW[@]}"); ALLOW_JSON="${ALLOW_JSON%,}"
  sed -e "s|__LISTEN__|$LISTEN|" -e "s|__PORT__|$PORT|" -e "s|\"__ALLOW__\"|$ALLOW_JSON|" \
    "$SRC_DIR/config.example.json" > "$CONF_DIR/config.json"
  chown root:"$USER_NAME" "$CONF_DIR/config.json"
  chmod 640 "$CONF_DIR/config.json"
fi
CONF_LISTEN=$(node -p "require('$CONF_DIR/config.json').listen.host")
CONF_PORT=$(node -p "require('$CONF_DIR/config.json').listen.port ?? 8443")
CONF_ALLOW=$(node -p "require('$CONF_DIR/config.json').allowedClients.join(', ')")

# ---------------------------------------------------------------- Zertifikat
NEW_CERT=0
if [ ! -f "$CONF_DIR/tls.crt" ] || [ "$ROTATE_CERT" -eq 1 ]; then
  info "Erzeuge selbst signiertes Zertifikat (EC P-256, 10 Jahre)."
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 3650 -nodes \
    -subj "/CN=mira-odin-api" -addext "subjectAltName=IP:$CONF_LISTEN" \
    -keyout "$CONF_DIR/tls.key" -out "$CONF_DIR/tls.crt" 2>/dev/null
  NEW_CERT=1
fi
chown root:"$USER_NAME" "$CONF_DIR/tls.key" "$CONF_DIR/tls.crt"
chmod 640 "$CONF_DIR/tls.key"
chmod 644 "$CONF_DIR/tls.crt"
FINGERPRINT=$(openssl x509 -in "$CONF_DIR/tls.crt" -noout -fingerprint -sha256 | cut -d= -f2)

# ---------------------------------------------------------------- Token (nur der Hash bleibt auf Odin)
TOKEN=""
if [ ! -f "$CONF_DIR/token.sha256" ] || [ "$ROTATE_TOKEN" -eq 1 ]; then
  info "Erzeuge Zugriffstoken."
  TOKEN=$(openssl rand -hex 32)
  printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1 > "$CONF_DIR/token.sha256"
fi
chown root:"$USER_NAME" "$CONF_DIR/token.sha256"
chmod 640 "$CONF_DIR/token.sha256"

# ---------------------------------------------------------------- Firewall (nur der API-Port)
if command -v nft >/dev/null; then
  info "Richte Firewall-Regel ein: Port $CONF_PORT nur von $CONF_ALLOW."
  ALLOW_SET=$(node -p "require('$CONF_DIR/config.json').allowedClients.join(', ')")
  cat > "$CONF_DIR/firewall.nft" <<EOF
# Erzeugt von install.sh – betrifft ausschließlich den Port der MIRA Odin-API.
table inet mira_odin_api
delete table inet mira_odin_api
table inet mira_odin_api {
  chain input {
    type filter hook input priority -10; policy accept;
    tcp dport $CONF_PORT ip saddr != { $ALLOW_SET } drop
    tcp dport $CONF_PORT meta nfproto ipv6 drop
  }
}
EOF
  chmod 644 "$CONF_DIR/firewall.nft"
  install -o root -g root -m 644 "$SRC_DIR/$FW_SERVICE.service" "/etc/systemd/system/$FW_SERVICE.service"
  FW_ENABLED=1
else
  echo "HINWEIS: nft nicht gefunden – keine lokale Firewall-Regel. Die API prüft die Absenderadresse trotzdem selbst."
  FW_ENABLED=0
fi

# ---------------------------------------------------------------- Vorabprüfung als Dienstbenutzer
info "Prüfe Konfiguration als $USER_NAME."
runuser -u "$USER_NAME" -- "$NODE_BIN" "$APP_DIR/odin-api.mjs" --config "$CONF_DIR/config.json" --check \
  || die "Konfiguration fehlerhaft – siehe Meldung oben ($CONF_DIR/config.json)."

# ---------------------------------------------------------------- systemd
info "Installiere systemd-Dienst $SERVICE."
sed "s|__NODE_BIN__|$NODE_BIN|" "$SRC_DIR/$SERVICE.service" > "/etc/systemd/system/$SERVICE.service"
chmod 644 "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
if [ "$FW_ENABLED" -eq 1 ]; then
  systemctl enable "$FW_SERVICE" >/dev/null 2>&1
  systemctl restart "$FW_SERVICE"
fi
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 30 --no-pager; die "Dienst läuft nicht."; }

# ---------------------------------------------------------------- Zusammenfassung
cat <<EOF

────────────────────────────────────────────────────────────────────
 MIRA Odin-API läuft
────────────────────────────────────────────────────────────────────
 Adresse:            https://$CONF_LISTEN:$CONF_PORT
 Zugriff erlaubt:    $CONF_ALLOW
 Zertifikat SHA-256: $FINGERPRINT
EOF
if [ -n "$TOKEN" ]; then
  cat <<EOF
 Zugriffstoken:      $TOKEN

 !! Das Token wird nur JETZT angezeigt. Auf Odin liegt nur sein Hash.
EOF
else
  echo " Zugriffstoken:      unverändert (neues Token mit --rotate-token)"
fi
cat <<EOF

 Auf Asgard (MIRA) eintragen:
   MIRA_ODIN_API_URL=https://$CONF_LISTEN:$CONF_PORT
   MIRA_ODIN_CERT_FINGERPRINT=$FINGERPRINT
   Token in deploy/secrets/odin_api_token.txt speichern (MIRA_ODIN_TOKEN_FILE)

 OPNsense: Zugriff von Asgard auf $CONF_LISTEN, TCP $CONF_PORT erlauben.
 Status:   systemctl status $SERVICE   ·   Protokoll: journalctl -u $SERVICE -f
────────────────────────────────────────────────────────────────────
EOF
[ "$NEW_CERT" -eq 1 ] && [ "$ROTATE_CERT" -eq 1 ] && echo "ACHTUNG: Neues Zertifikat – Fingerprint in MIRA aktualisieren."
exit 0
