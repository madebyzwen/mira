# 0011 – Energiesteuerung: polkit statt sudo, Wake-on-LAN direkt aus MIRA

- Status: vorgeschlagen (Entscheidung mit Freigabe von [Stufe 5a](../entwicklung/stufe-05a-schlafen-aufwecken-neustart.md))
- Datum: 2026-11-10
- Ersetzt: [ADR 0007](0007-wake-on-lan-ueber-opnsense.md) (Wake-on-LAN über die OPNsense-API)
- Ändert: die in [MIRA-Agent](../architektur/agent.md) geplanten sudo-Regeln für Energieaktionen

## Kontext

MIRA soll den KI-Server schlafen legen, neu starten und wieder aufwecken. Zwei frühere
Annahmen passen nicht mehr:

1. **sudo für den Agent:** Geplant waren exakte Regeln in `/etc/sudoers.d/mira-agent`. Der
   Agent läuft aber als gehärteter systemd-Dienst mit `NoNewPrivileges=yes` – damit kann er
   kein setuid-Programm wie `sudo` nutzen. Die Härtung aufzuweichen, wäre ein Rückschritt.
2. **Wake-on-LAN über die OPNsense:** Nötig, solange MIRA in einem anderen Netz als der
   KI-Server lag. Seit 2026-11-06 hat MIRA per macvlan eine eigene Adresse im selben Netz.

## Entscheidung

- **Schlafen und Neustart über logind mit polkit:** Der Agent ruft `systemctl suspend` bzw.
  `systemctl reboot` als Benutzer `mira-agent` auf; logind fragt polkit. Eine eigene Regel
  (`/etc/polkit-1/rules.d/50-mira-agent.rules`, von `install.sh` angelegt) erlaubt dem Benutzer
  `mira-agent` **ausschließlich** diese Aktionen:
  - `org.freedesktop.login1.suspend`, `…suspend-multiple-sessions`
  - `org.freedesktop.login1.reboot`, `…reboot-multiple-sessions`

  Bewusst **nicht** erlaubt sind `…-ignore-inhibit` (eine aktive Sperre, z. B. eines laufenden
  Jobs, verhindert den Schlaf) und das Ausschalten (`power-off`, späterer Ausbau).
  Der Dienst behält `NoNewPrivileges=yes` und alle übrigen Härtungen.
- **Wake-on-LAN direkt aus MIRA:** MIRA sendet das Magic Packet selbst als UDP-Broadcast ins
  Server-Netz (macvlan). Keine OPNsense-API, keine zusätzlichen Zugangsdaten.
- Schreibende Endpunkte des Agents (`POST /v1/power/…`) nutzen dasselbe Token und dieselbe
  Netzfreigabe wie die lesenden; MIRA protokolliert jede Aktion im Audit-Log.

## Alternativen

- **sudo mit exakten Regeln:** erfordert `NoNewPrivileges=no` für den ganzen Dienst – verworfen.
- **Eigener, privilegierter Hilfsdienst** (z. B. per systemd-Socket): mehr bewegliche Teile für
  zwei Aktionen – verworfen; polkit ist genau für diese Freigabe gedacht.
- **Wake-on-LAN über die OPNsense-API (ADR 0007):** zusätzlicher API-Schlüssel mit Rechten an
  der Firewall – nicht mehr nötig.

## Konsequenzen

- `install.sh` legt die polkit-Regel an und entfernt sie bei `uninstall.sh`.
- Auf dem KI-Server muss Wake-on-LAN aktiv sein (BIOS, `Wake-on: g` dauerhaft für `eno1`).
- MIRA braucht die MAC-Adresse und die Broadcast-Adresse des Server-Netzes.
- Das Herunterfahren und der Neustart in Windows folgen später (Stufe 5) mit eigener Prüfung,
  ob Wake-on-LAN auch aus dem ausgeschalteten Zustand funktioniert.
