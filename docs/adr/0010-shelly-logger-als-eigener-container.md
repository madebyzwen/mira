# 0010 – Shelly-Logger als eigener Container mit eigener Datenbank

- Status: angenommen
- Datum: 2026-11-10
- Ersetzt: die Festlegung „Modul in MIRA, kein eigener Container“ im Konzept
  [Stufe 4 (Shelly)](../entwicklung/stufe-04-shelly.md) vom 2026-11-06
- Ergänzt: [ADR 0001](0001-modularer-monolith-typescript-fastify.md) (modularer Monolith) um eine begründete Ausnahme

> **Nachtrag 2026-11-10 (vor der Inbetriebnahme):** Der Netzweg zum Shelly wurde geändert. Der Logger
> erhält – wie MIRA – eine **eigene feste IP im macvlan-Netz** des Server-VLANs; die Firewall-Regel gilt
> nur für diese Adresse (`<LOGGER_IP>` → `<SHELLY_IP>`, TCP 80) statt für ganz Asgard. Damit auf der
> macvlan-Adresse kein Port offen ist, lauscht die API nur auf ihrer festen Adresse im internen Netz
> `mira-intern` (`LOGGER_HOST`). Das eigene Bridge-Netz entfällt. Ab Logger 0.1.1.

## Kontext

Der Stromverbrauch des KI-Servers wird über einen Shelly Plug gemessen. Das bisherige
Konzept sah vor, dass MIRA den Shelly als Fachmodul selbst abfragt. Die Anforderungen
haben sich verschärft:

- Die Messung muss **lückenlos weiterlaufen**, auch wenn MIRA neu startet, aktualisiert
  wird oder ausfällt – Verbrauchszahlen sind die Grundlage für Kosten und sollen über Jahre
  vollständig bleiben.
- Abfrage im **Sekundentakt**, Verdichtung alle 30 Sekunden, Tages- bis Jahreswerte,
  **keine automatische Löschung**.
- Die Live-Ansicht in MIRA darf durch das sekündliche Polling nicht träger werden.

Ein Update von MIRA (Stack neu starten) unterbräche die Messung jedes Mal.

## Entscheidung

- Ein eigenständiger Container **`mira-shelly-logger`** erfasst die Messwerte dauerhaft auf
  Asgard – unabhängig von MIRA und vom KI-Server.
- Er hat eine **eigene SQLite-Datenbank** (`shelly-logger.db`) in einem eigenen Verzeichnis.
  Nur dieser Prozess schreibt hinein; kein Container teilt eine SQLite-Datei mit einem anderen.
- MIRA bindet ihn ab Stufe 4b **ausschließlich lesend** über eine kleine interne HTTP-API an
  (Live-Werte, Verbrauch, Verlauf, Datenbankstatistik). Der Strompreis und die Kosten bleiben in MIRA.
- Gleiche Technik wie MIRA (Node.js 22, TypeScript, Fastify, SQLite), eigenes Paket im
  Monorepository (`shelly-logger/`), eigenes Image `ghcr.io/madebyzwen/mira-shelly-logger`
  mit eigener Versionsnummer (Tags `shelly-logger-vX.Y.Z`).
- Netz: keine veröffentlichten Ports. Die API ist nur im internen Docker-Netz `mira-intern`
  (`internal: true`) erreichbar; der Weg zum Shelly führt über ein eigenes Bridge-Netz und
  Asgards Adresse. In der Firewall genau eine Regel `<ASGARD_IP>` → `<SHELLY_IP>`, TCP 80.
- Zugriff auf den Shelly nur lokal und nur lesend (Status-Abfragen); keine Cloud, keine
  Schaltbefehle, keine Zähler-Resets, keine Konfigurationsänderungen.

## Alternativen

- **Modul in MIRA (bisherige Planung):** ein Prozess, ein Datenmodell – aber jede
  Wartung von MIRA unterbricht die Messung; das sekündliche Polling liefe im selben
  Prozess wie die Weboberfläche. Verworfen.
- **Gemeinsame SQLite-Datei für Logger und MIRA:** spart die API, aber zwei schreibende
  Prozesse auf einer Datei führen zu Sperren und Beschädigungsrisiken. Verworfen.
- **Zeitreihendatenbank (InfluxDB, Prometheus o. Ä.):** mächtig, aber ein zusätzlicher
  Datenbankserver für eine einzige Messreihe. Verworfen.
- **Push vom Shelly (Webhooks/MQTT):** würde Konfigurationsänderungen am Shelly und einen
  Broker erfordern; Polling ist einfacher und ausschließlich lesend. Verworfen.
- **macvlan mit eigener IP für den Logger:** präzisere Firewall-Regel je Container, aber die
  API müsste gezielt nur auf dem internen Netz lauschen. Für eine einzelne, eng begrenzte
  Regel (eine Ziel-IP, ein Port) genügt die Bridge über Asgards Adresse.

## Konsequenzen

- Ein zweiter Container im Betrieb (eigener Stack, eigenes Image, eigene Updates und
  Sicherungen). Die Sicherung erfolgt wie bei MIRA täglich per SQLite-Backup-API.
- MIRA bekommt in Stufe 4b eine kleine Client-Anbindung an die Logger-API statt eigener
  Shelly-Tabellen; die im Datenmodell geplanten `power_*`-Tabellen in MIRA entfallen.
- Die Messwert-Historie des KI-Servers in MIRA (Stufe 3) bleibt unverändert.
- Die API-Verträge liegen in `shared/` und gelten für beide Seiten.
