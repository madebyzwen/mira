# 0007 – Wake-on-LAN über die Firewall-API

- Status: **vorgeschlagen** (Entscheidung vor Stufe 5)
- Datum: 2026-11-05

> **Nachtrag 2026-11-06:** MIRA erhält per macvlan eine eigene IP im Server-Netz
> des KI-Servers. Damit ist WoL direkt aus dem Container möglich; diese ADR wird vor
> Stufe 5 neu bewertet und voraussichtlich durch eine direkte Lösung ersetzt.

## Kontext

Ein schlafender KI-Server ist nur per Wake-on-LAN erreichbar. Das Magic Packet ist ein
Broadcast und bleibt in seinem VLAN. Asgard liegt in einem anderen VLAN als der KI-Server;
außerdem erreicht ein Broadcast aus einem Docker-Container im Bridge-Netz das LAN
nicht. Im Netz läuft eine Firewall mit API.

## Vorschlag

MIRA löst Wake-on-LAN über die Wake-on-LAN-Funktion der Firewall (API) aus. Dafür wird
in der Firewall ein eigener API-Benutzer angelegt, der ausschließlich die
WoL-Berechtigung hat; Schlüssel und Secret liegen als Dateien auf Asgard
([ADR 0006](0006-geheimnisse-als-dateien.md)).

## Alternativen

- **Asgard erhält eine Schnittstelle im Server-VLAN** und der Container nutzt
  Host-Netzwerk oder macvlan: robust, aber Eingriff in Netzwerk und Container-Isolation.
- **Directed Broadcast** über den Router: meist bewusst deaktiviert, nicht empfohlen.

## Konsequenzen (bei Annahme)

- Keine Änderung an Asgards Netzwerk und keine Sonderrechte für den Container.
- Abhängigkeit von der Firewall-API; MIRA benötigt Zugriff `<ASGARD_IP>` → Firewall, TCP 443.
