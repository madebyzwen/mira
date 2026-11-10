#!/usr/bin/env bash
# MIRA-Agent – Installation auf dem KI-Server
#
# Aufruf (als root, im entpackten Paketverzeichnis):
#   sudo ./install.sh --listen <KI_SERVER_IP> --allow <MIRA_IP> [--port 8443]
#
# Optionen:
#   --listen IP       Adresse, auf der der Agent lauscht (LAN-Schnittstelle im Server-VLAN)
#   --allow IP        Einzige Adresse, die zugreifen darf (MIRA); mehrfach angebbar
#   --port PORT       Port des Agents (Standard 8443)
#   --rotate-token    neues Zugriffstoken erzeugen (altes wird ungültig)
#   --rotate-cert     neues Zertifikat erzeugen (Fingerprint in MIRA anpassen!)
#   --yes             keine Rückfragen (z. B. Installation von Node.js)
#
# Das Skript ist wiederholbar: Vorhandenes Zertifikat, Token und Konfiguration
# bleiben erhalten, sofern nicht ausdrücklich erneuert. Eine Installation unter dem
# früheren Namen wird erkannt und übernommen (Konfiguration und Token bleiben,
# das Zertifikat wird neu erzeugt).
set -euo pipefail

APP_DIR=/opt/mira-agent
CONF_DIR=/etc/mira-agent
SERVICE=mira-agent
FW_SERVICE=mira-agent-firewall
NFT_TABLE=mira_agent
PROGRAM=mira-agent.mjs
USER_NAME=mira-agent
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---- ÜBERGANG (Stufe 3a): Installation unter dem früheren Namen – wird mit dem Aufräumen entfernt
LEGACY_APP_DIR=/opt/mira-odin-api
LEGACY_CONF_DIR=/etc/mira-odin-api
LEGACY_SERVICE=mira-odin-api
LEGACY_FW_SERVICE=mira-odin-api-firewall
LEGACY_NFT_TABLE=mira_odin_api
LEGACY_TOKEN_FILE=odin_api_token.txt
# ---- Ende ÜBERGANG

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
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1 (siehe --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausführen."
[ -f "$SRC_DIR/$PROGRAM" ] || die "$PROGRAM nicht gefunden – Skript im entpackten Paket ausführen."

is_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

# Übernahme: alte Installation vorhanden, neue noch nicht
MIGRATE=0
if [ ! -f "$CONF_DIR/config.json" ] && [ -f "$LEGACY_CONF_DIR/config.json" ]; then
  MIGRATE=1
  info "Installation unter dem früheren Namen gefunden ($LEGACY_CONF_DIR) – sie wird übernommen."
fi

# Werte aus vorhandener Konfiguration übernehmen, falls nicht angegeben
if [ -f "$CONF_DIR/config.json" ] || [ "$MIGRATE" -eq 1 ]; then
  info "Vorhandene Konfiguration wird beibehalten."
  [ -z "$LISTEN" ] || echo "HINWEIS: --listen/--allow/--port werden ignoriert, solange die Konfiguration existiert (ggf. dort anpassen)."
else
  [ -n "$LISTEN" ] || die "--listen <KI_SERVER_IP> fehlt."
  [ ${#ALLOW[@]} -gt 0 ] || die "--allow <MIRA_IP> fehlt."
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
install -o root -g root -m 644 "$SRC_DIR/$PROGRAM" "$APP_DIR/$PROGRAM"
install -d -o root -g "$USER_NAME" -m 750 "$CONF_DIR"

# ---------------------------------------------------------------- ÜBERGANG: Konfiguration und Token übernehmen
if [ "$MIGRATE" -eq 1 ]; then
  info "Übernehme Konfiguration und Token aus $LEGACY_CONF_DIR; das Zertifikat wird neu erzeugt."
  LEGACY_TOKEN_HASH=$(node -p "require('$LEGACY_CONF_DIR/config.json').tokenHashFile")
  [ -f "$LEGACY_TOKEN_HASH" ] || die "Token-Hash $LEGACY_TOKEN_HASH der bisherigen Installation fehlt."
  install -o root -g "$USER_NAME" -m 640 "$LEGACY_TOKEN_HASH" "$CONF_DIR/token.sha256"
  # Alle Einstellungen bleiben, nur die Dateipfade zeigen in das neue Verzeichnis
  node -e '
    const fs = require("node:fs");
    const [src, dst, dir] = process.argv.slice(1);
    const c = JSON.parse(fs.readFileSync(src, "utf8"));
    c.tls = { certFile: `${dir}/tls.crt`, keyFile: `${dir}/tls.key` };
    c.tokenHashFile = `${dir}/token.sha256`;
    fs.writeFileSync(dst, JSON.stringify(c, null, 2) + "\n");
  ' "$LEGACY_CONF_DIR/config.json" "$CONF_DIR/config.json" "$CONF_DIR"
  chown root:"$USER_NAME" "$CONF_DIR/config.json"
  chmod 640 "$CONF_DIR/config.json"
fi

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
    -subj "/CN=mira-agent" -addext "subjectAltName=IP:$CONF_LISTEN" \
    -keyout "$CONF_DIR/tls.key" -out "$CONF_DIR/tls.crt" 2>/dev/null
  NEW_CERT=1
fi
chown root:"$USER_NAME" "$CONF_DIR/tls.key" "$CONF_DIR/tls.crt"
chmod 640 "$CONF_DIR/tls.key"
chmod 644 "$CONF_DIR/tls.crt"
FINGERPRINT=$(openssl x509 -in "$CONF_DIR/tls.crt" -noout -fingerprint -sha256 | cut -d= -f2)

# ---------------------------------------------------------------- Token (nur der Hash bleibt auf dem KI-Server)
TOKEN=""
if [ ! -f "$CONF_DIR/token.sha256" ] || [ "$ROTATE_TOKEN" -eq 1 ]; then
  info "Erzeuge Zugriffstoken."
  TOKEN=$(openssl rand -hex 32)
  printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1 > "$CONF_DIR/token.sha256"
fi
chown root:"$USER_NAME" "$CONF_DIR/token.sha256"
chmod 640 "$CONF_DIR/token.sha256"

# ---------------------------------------------------------------- Firewall (nur der Port des Agents)
if command -v nft >/dev/null; then
  info "Richte Firewall-Regel ein: Port $CONF_PORT nur von $CONF_ALLOW."
  ALLOW_SET=$(node -p "require('$CONF_DIR/config.json').allowedClients.join(', ')")
  cat > "$CONF_DIR/firewall.nft" <<EOF
# Erzeugt von install.sh – betrifft ausschließlich den Port des MIRA-Agents.
table inet $NFT_TABLE
delete table inet $NFT_TABLE
table inet $NFT_TABLE {
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
  echo "HINWEIS: nft nicht gefunden – keine lokale Firewall-Regel. Der Agent prüft die Absenderadresse trotzdem selbst."
  FW_ENABLED=0
fi

# ---------------------------------------------------------------- Vorabprüfung als Dienstbenutzer
info "Prüfe Konfiguration als $USER_NAME."
if ! runuser -u "$USER_NAME" -- "$NODE_BIN" "$APP_DIR/$PROGRAM" --config "$CONF_DIR/config.json" --check; then
  if [ "$MIGRATE" -eq 1 ]; then
    rm -rf "$APP_DIR" "$CONF_DIR" "/etc/systemd/system/$FW_SERVICE.service"
    die "Konfiguration fehlerhaft – die bisherige Installation bleibt unverändert in Betrieb."
  fi
  die "Konfiguration fehlerhaft – siehe Meldung oben ($CONF_DIR/config.json)."
fi

# ---------------------------------------------------------------- systemd
info "Installiere systemd-Dienst $SERVICE."
sed "s|__NODE_BIN__|$NODE_BIN|" "$SRC_DIR/$SERVICE.service" > "/etc/systemd/system/$SERVICE.service"
chmod 644 "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload

# ÜBERGANG: bisherigen Dienst beenden – er belegt denselben Port
if [ "$MIGRATE" -eq 1 ]; then
  info "Beende den bisherigen Dienst $LEGACY_SERVICE."
  systemctl disable --now "$LEGACY_SERVICE" "$LEGACY_FW_SERVICE" >/dev/null 2>&1 || true
  nft delete table inet "$LEGACY_NFT_TABLE" 2>/dev/null || true
fi

if [ "$FW_ENABLED" -eq 1 ]; then
  systemctl enable "$FW_SERVICE" >/dev/null 2>&1
  systemctl restart "$FW_SERVICE"
fi
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  if [ "$MIGRATE" -eq 1 ]; then
    # ÜBERGANG: zurück zur bisherigen Installation
    systemctl disable --now "$SERVICE" "$FW_SERVICE" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$SERVICE.service" "/etc/systemd/system/$FW_SERVICE.service"
    rm -rf "$APP_DIR" "$CONF_DIR"
    systemctl daemon-reload
    systemctl enable --now "$LEGACY_FW_SERVICE" >/dev/null 2>&1 || true
    systemctl enable --now "$LEGACY_SERVICE" >/dev/null 2>&1 || true
    die "Dienst $SERVICE läuft nicht – die bisherige Installation wurde wieder gestartet."
  fi
  die "Dienst läuft nicht."
fi

# ÜBERGANG: Reste der bisherigen Installation entfernen
if [ "$MIGRATE" -eq 1 ]; then
  info "Entferne die bisherige Installation ($LEGACY_APP_DIR, $LEGACY_CONF_DIR)."
  rm -f "/etc/systemd/system/$LEGACY_SERVICE.service" "/etc/systemd/system/$LEGACY_FW_SERVICE.service"
  systemctl daemon-reload
  rm -rf "$LEGACY_APP_DIR" "$LEGACY_CONF_DIR"
fi

# ---------------------------------------------------------------- Zusammenfassung
cat <<EOF

────────────────────────────────────────────────────────────────────
 MIRA-Agent läuft
────────────────────────────────────────────────────────────────────
 Adresse:            https://$CONF_LISTEN:$CONF_PORT
 Zugriff erlaubt:    $CONF_ALLOW
 Zertifikat SHA-256: $FINGERPRINT
EOF
if [ -n "$TOKEN" ]; then
  cat <<EOF
 Zugriffstoken:      $TOKEN

 !! Das Token wird nur JETZT angezeigt. Auf dem KI-Server liegt nur sein Hash.
EOF
else
  echo " Zugriffstoken:      unverändert (neues Token mit --rotate-token)"
fi
cat <<EOF

 In MIRA (Portainer-Stack) eintragen:
   MIRA_AI_SERVER_URL=https://$CONF_LISTEN:$CONF_PORT
   MIRA_AI_SERVER_CERT_FINGERPRINT=$FINGERPRINT
   Token in <MIRA_APPDATA>/secrets/ai_server_token.txt speichern
EOF
if [ "$MIGRATE" -eq 1 ]; then
  cat <<EOF

 Übernommen: Konfiguration und Token sind unverändert, das Zertifikat ist NEU.
   Auf dem MIRA-Host die bisherige Token-Datei umbenennen:
     $LEGACY_TOKEN_FILE  →  ai_server_token.txt
   und im Stack den neuen Fingerprint eintragen (siehe oben).
EOF
fi
cat <<EOF

 Liegt MIRA ($CONF_ALLOW) in einem anderen Netz als der KI-Server, zusätzlich in
 der Firewall $CONF_ALLOW → $CONF_LISTEN, TCP $CONF_PORT erlauben.
 Status:   systemctl status $SERVICE   ·   Protokoll: journalctl -u $SERVICE -f
────────────────────────────────────────────────────────────────────
EOF
[ "$NEW_CERT" -eq 1 ] && [ "$ROTATE_CERT" -eq 1 ] && echo "ACHTUNG: Neues Zertifikat – Fingerprint in MIRA aktualisieren."
exit 0
