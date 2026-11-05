#!/usr/bin/env bash
# MIRA Odin-API – Deinstallation auf Odin
#
#   sudo ./uninstall.sh           Dienst und Programm entfernen, Konfiguration behalten
#   sudo ./uninstall.sh --purge   zusätzlich Konfiguration, Zertifikat, Token und Benutzer entfernen
set -euo pipefail

PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo ausführen." >&2; exit 1; }

for unit in mira-odin-api mira-odin-api-firewall; do
  if systemctl list-unit-files "$unit.service" >/dev/null 2>&1; then
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$unit.service"
  fi
done
nft delete table inet mira_odin_api 2>/dev/null || true
systemctl daemon-reload
rm -rf /opt/mira-odin-api
echo "Dienst, Firewall-Regel und Programm entfernt."

if [ "$PURGE" -eq 1 ]; then
  rm -rf /etc/mira-odin-api
  if getent passwd mira-agent >/dev/null; then userdel mira-agent; fi
  echo "Konfiguration, Zertifikat, Token und Benutzer mira-agent entfernt."
else
  echo "Konfiguration in /etc/mira-odin-api bleibt erhalten (vollständig entfernen mit --purge)."
fi
echo "Node.js wurde nicht verändert (ggf. selbst entfernen: apt remove nodejs)."
