# 0007 – Wake-on-LAN über die OPNsense-API

- Status: ersetzt durch [0011](0011-energiesteuerung-polkit-und-direktes-wake-on-lan.md) (2026-11-10, sobald 0011 angenommen ist)
- Datum: 2026-11-05

> **Nachtrag 2026-11-06:** MIRA erhält per macvlan eine eigene IP im Server-Netz
> des KI-Servers. Damit ist WoL direkt aus dem Container möglich; diese ADR wird vor
> Stufe 5 neu bewertet und voraussichtlich durch eine direkte Lösung ersetzt.

## Kontext

Ein schlafender KI-Server ist nur per Wake-on-LAN erreichbar. Das Magic Packet ist ein
Broadcast und bleibt in seinem VLAN. Asgard liegt in einem anderen VLAN als der KI-Server;
außerdem erreicht ein Broadcast aus einem Docker-Container im Bridge-Netz das LAN
nicht. Im Netz läuft eine OPNsense.

## Vorschlag

MIRA löst Wake-on-LAN über die API des OPNsense-Plugins **os-wol** aus. Dafür wird
in der OPNsense ein eigener API-Benutzer angelegt, der ausschließlich die
WoL-Berechtigung hat; Schlüssel und Secret liegen als Dateien auf Asgard
([ADR 0006](0006-geheimnisse-als-dateien.md)).

## Alternativen

- **Asgard erhält eine Schnittstelle im Server-VLAN** und der Container nutzt
  Host-Netzwerk oder macvlan: robust, aber Eingriff in Netzwerk und Container-Isolation.
- **Directed Broadcast** über den Router: meist bewusst deaktiviert, nicht empfohlen.

## Konsequenzen (bei Annahme)

- Keine Änderung an Asgards Netzwerk und keine Sonderrechte für den Container.
- Abhängigkeit von der OPNsense-API; MIRA benötigt Zugriff `<ASGARD_IP>` → OPNsense, TCP 443.
