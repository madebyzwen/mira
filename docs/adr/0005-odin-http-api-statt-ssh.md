# 0005 – Odin-API als HTTP-Dienst statt SSH-Agent

- Status: angenommen
- Datum: 2026-11-05
- Weicht ab von: [Architekturbriefing](../vorgaben/2026-11-05-architekturbriefing.md), Abschnitt 6

## Kontext

Das Briefing sah einen „MIRA Node Agent“ vor, der über einen eingeschränkten
SSH-Zugang pro Anfrage gestartet wird, und schloss einen dauerhaften
HTTP-Dienst aus, „sofern er technisch nicht erforderlich ist“.

Bei der Planung zeigte sich, dass genau die anspruchsvollen Funktionen mit SSH
umständlich werden: Messwerte im Sekundentakt (Handshake pro Abfrage oder
dauerhaft offene Sitzung), Downloads mit Fortschritt und Abbruch
(abgekoppelte Prozesse plus Statusdateien) und die laufende Beobachtung der
llama.cpp-Aktivität.

## Entscheidung

Auf Odin läuft eine kleine **HTTP-API als nativer systemd-Dienst** (nicht in Docker):

- Lauscht nur auf der LAN-Schnittstelle im Server-VLAN; die 10-GbE-Direktverbindung
  bleibt ausschließlich für den Fileshare.
- Zugriff nur von Asgard: Regel in der OPNsense und lokale Firewall auf Odin.
- **TLS mit festgelegtem Zertifikat** und **Token pro Anfrage** (auf Odin nur der Hash).
- Nur fest definierte Endpunkte, unprivilegierter Benutzer, privilegierte Aktionen
  ausschließlich über exakte sudo-Regeln.
- Entscheidungslogik bleibt in MIRA; die API liefert Daten und führt aus.

Details: [Odin-API](../architektur/odin-api.md).

**Sprache (entschieden 2026-11-05): TypeScript auf Node.js 22**, Fastify wie im
MIRA-Backend. Die API nutzt dieselben zod-Verträge aus `shared/`; Node.js wird
direkt auf Odin installiert (nicht in Docker). Verworfen: Go – sparsamer und ohne
Laufzeitumgebung, aber zweite Sprache und keine gemeinsamen Verträge.

## Alternativen

- **SSH mit Forced Command** (Briefing): sehr gute, bewährte Authentifizierung ohne
  zusätzlichen Port, aber umständlich für lange Aufgaben und häufige Messungen.
- **API in Docker**: bräuchte weitreichende Freigaben (Host-PID, `/proc`, `/sys`,
  `systemctl`), dadurch weniger sicher und komplizierter.

## Konsequenzen

- Ein zusätzlicher Port auf Odin – abgesichert durch Netzwerkregeln, TLS und Token.
- Authentifizierung und Verschlüsselung müssen selbst sauber umgesetzt und getestet
  werden (Test-Container `odin-sim`).
- MIRA benötigt keine SSH-Schlüssel; der Admin-Zugang per SSH bleibt unberührt.
- Downloads, Fortschritt und Aktivitätserkennung werden deutlich einfacher.
