#!/usr/bin/env bash
# MIRA-Agent – Deinstallation auf dem KI-Server
#
#   sudo ./uninstall.sh           Dienst und Programm entfernen, Konfiguration behalten
#   sudo ./uninstall.sh --purge   zusätzlich Konfiguration, Zertifikat, Token und Benutzer entfernen
set -euo pipefail

PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo ausführen." >&2; exit 1; }

# ÜBERGANG (Stufe 3a): auch Reste einer Installation unter dem früheren Namen entfernen
for unit in mira-agent mira-agent-firewall mira-odin-api mira-odin-api-firewall; do
  if [ -f "/etc/systemd/system/$unit.service" ]; then
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$unit.service"
  fi
done
for table in mira_agent mira_odin_api; do
  nft delete table inet "$table" 2>/dev/null || true
done
systemctl daemon-reload
rm -rf /opt/mira-agent /opt/mira-odin-api
echo "Dienst, Firewall-Regel und Programm entfernt."

if [ "$PURGE" -eq 1 ]; then
  rm -rf /etc/mira-agent /etc/mira-odin-api
  if getent passwd mira-agent >/dev/null; then userdel mira-agent; fi
  echo "Konfiguration, Zertifikat, Token und Benutzer mira-agent entfernt."
else
  echo "Konfiguration in /etc/mira-agent bleibt erhalten (vollständig entfernen mit --purge)."
fi
echo "Node.js wurde nicht verändert (ggf. selbst entfernen: apt remove nodejs)."
