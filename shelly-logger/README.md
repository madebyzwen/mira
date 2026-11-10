# MIRA Shelly-Logger

Eigenständiger Container, der den Stromverbrauch des KI-Servers über einen Shelly Plug
erfasst – dauerhaft, unabhängig von MIRA und vom KI-Server, mit eigener SQLite-Datenbank
und einer kleinen internen Lese-API. Entscheidung: [ADR 0010](../docs/adr/0010-shelly-logger-als-eigener-container.md),
Stufe: [4a](../docs/entwicklung/stufe-04a-shelly-logger.md).

- **Nur lesend:** ausschließlich Status-Abfragen über das lokale Netz. Keine Cloud, keine
  Schaltbefehle, keine Zähler-Resets, keine Konfigurationsänderungen am Shelly.
- **Ein Takt:** eine Abfrage je Sekunde (umstellbar auf 2 s), nie zwei gleichzeitig.
- **Live-Wert im Speicher**, verdichtete Werte alle 30 Sekunden in SQLite, **keine automatische Löschung**.
- **Keine Benutzeroberfläche**, keine veröffentlichten Ports.

## Inhalt

- [Aufbau](#aufbau)
- [Konfiguration](#konfiguration)
- [Inbetriebnahme](#inbetriebnahme)
- [API](#api)
- [Datenformat](#datenformat)
- [Betrieb](#betrieb)
- [Entwicklung und Tests](#entwicklung-und-tests)

## Aufbau

```
Shelly Plug (IoT-VLAN) ◀── HTTP GET, 1×/s ── Poller ──▶ Live-Wert (RAM) ──▶ GET /api/v1/live
   (lokale RPC-API)          (Keep-Alive,          │
                              Zeitlimit 800 ms)    └─▶ 30-s-Verdichtung ──▶ SQLite ──▶ Verbrauch, Verlauf
```

| Baustein | Aufgabe |
| --- | --- |
| Shelly-Client | `GET /shelly` (Geräteinfo), `GET /rpc/Shelly.GetStatus` (Erkennung), `GET /rpc/PM1.GetStatus?id=0` bzw. `Switch.GetStatus?id=0` (Messwerte); Digest-Anmeldung (SHA-256, Benutzer `admin`) |
| Poller | ein Takt, nächste Abfrage erst nach Ende der vorigen; Fehler werden nur bei Zustandswechsel protokolliert |
| Verdichtung | je 30 s ein Datensatz; Energie aus dem Zählerstand des Shelly |
| Auswertung | Tag, Woche, Monat, Jahr in `Europe/Berlin` aus Tagessummen; zwischengespeichert |
| API | Fastify, nur `GET`; optional Bearer-Token |

**Netz auf Asgard** (siehe [`deploy/shelly-logger-stack.yml`](../deploy/shelly-logger-stack.yml)):

| Netz | Zweck |
| --- | --- |
| `server` (vorhandenes macvlan-Netz, wie MIRA) | eigene feste IP `<LOGGER_IP>` im Server-Netz – nur der Weg zum Shelly; auf dieser Adresse ist **kein Port offen** |
| `mira-intern` (`internal: true`, festes Subnetz) | Lese-API für MIRA (ab Stufe 4b) – der Logger lauscht nur hier (`LOGGER_HOST`); keine Verbindung nach außen |

Es werden keine Ports veröffentlicht. Aus dem Heimnetz ist die API nicht erreichbar, und die
Firewall-Regel zum Shelly gilt nur für die Adresse des Loggers, nicht für ganz Asgard.

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `LOGGER_SHELLY_URL` | – (Pflicht) | Adresse des Shelly, z. B. `http://<SHELLY_IP>` (der Shelly bietet lokal nur HTTP) |
| `LOGGER_SHELLY_PASSWORD_FILE` | – | Datei mit dem Passwort der lokalen Shelly-Oberfläche; leer = ohne Passwort |
| `LOGGER_SHELLY_COMPONENT` | erkannt | Messkomponente erzwingen: `pm1:0` oder `switch:0` |
| `LOGGER_POLL_INTERVAL_MS` | `1000` | Abfrageintervall (500–60 000), z. B. `2000` |
| `LOGGER_REQUEST_TIMEOUT_MS` | `800` | Zeitlimit je Abfrage |
| `LOGGER_STALE_AFTER_MS` | `5000` | Ab diesem Alter gilt der Live-Wert als veraltet; Lücken darüber gelten als Ausfall |
| `LOGGER_MAX_POWER_W` | `3680` | Plausibilitätsgrenze (16 A × 230 V) für Zählersprünge |
| `LOGGER_TIMEZONE` | `Europe/Berlin` | Zeitzone für Tage, Wochen, Monate, Jahre und die Sicherungszeit |
| `LOGGER_DATA_DIR` | `/data` | Datenbank `shelly-logger.db`, Sicherungen in `backups/` |
| `LOGGER_HOST` / `LOGGER_PORT` | `0.0.0.0` / `8090` | Adresse der API im Container; im Stack die feste Adresse im internen Netz, damit auf der macvlan-Adresse kein Port offen ist |
| `LOGGER_API_TOKEN_FILE` | – | Datei mit einem Token; gesetzt = alle Endpunkte außer `/health` verlangen `Authorization: Bearer <Token>` |
| `LOGGER_BACKUP_TIME` / `LOGGER_BACKUP_KEEP` | `03:45` / `7` | tägliche Sicherung (Ortszeit) und Anzahl aufbewahrter Sicherungen |
| `LOGGER_LOG_LEVEL` | `info` | Protokollierungsstufe |

Geheimnisse nur als Datei ([ADR 0006](../docs/adr/0006-geheimnisse-als-dateien.md)), nie im Repository.

## Inbetriebnahme

> Erst nach ausdrücklicher Freigabe. Änderungen an Shelly, OPNsense und Asgard nimmt der Betreiber selbst vor.

### 1. Shelly vorbereiten

1. **Feste Adresse** im IoT-VLAN (DHCP-Reservierung in der OPNsense).
2. **Passwort** für die lokale Oberfläche setzen (Weboberfläche des Shelly → Einstellungen →
   Authentifizierung). Der Logger meldet sich als `admin` an.
3. Geräteinfo prüfen – ohne Anmeldung: `http://<SHELLY_IP>/shelly`. Erwartet: `"gen": 2` oder höher;
   `"auth_en": true`, wenn ein Passwort gesetzt ist.

### 2. OPNsense: genau eine Regel

| Feld | Wert |
| --- | --- |
| Aktion | Erlauben |
| Schnittstelle | Server-Netz (eingehend) – dort liegt die macvlan-Adresse des Loggers |
| Quelle | `<LOGGER_IP>` (einzelne Adresse) |
| Ziel | `<SHELLY_IP>` (einzelne Adresse) |
| Protokoll / Port | TCP / 80 |

Alles andere vom und zum IoT-VLAN bleibt gesperrt. Der Logger braucht keinen Internetzugang.
`<LOGGER_IP>` ist eine freie, feste Adresse im Server-Netz außerhalb des DHCP-Bereichs (wie `<MIRA_IP>`).

### 3. Asgard: Ordner und Passwort-Datei (per SSH)

```bash
APPDATA=<APPDATA_PFAD>/mira-shelly-logger
mkdir -p "$APPDATA/data" "$APPDATA/secrets"
chmod 700 "$APPDATA/secrets"
read -rs -p "Shelly-Passwort: " PW; echo; printf '%s\n' "$PW" > "$APPDATA/secrets/shelly_password.txt"; unset PW
chmod 600 "$APPDATA/secrets/shelly_password.txt"
sudo chown -R 1000:1000 "$APPDATA"
```

### 4. Image

Das Image `ghcr.io/madebyzwen/mira-shelly-logger` entsteht bei jedem Push auf `main` (`:main`)
und bei Tags `shelly-logger-vX.Y.Z` (`:X.Y.Z`, `:latest`). Es ist wie das MIRA-Image öffentlich
abrufbar – Asgard braucht keine Anmeldung bei der Registry.

### 5. Stack in Portainer

Stacks → Add stack → Name `mira-shelly-logger` → Web editor: Inhalt von
[`deploy/shelly-logger-stack.yml`](../deploy/shelly-logger-stack.yml), Umgebungsvariablen:

| Variable | Beispiel |
| --- | --- |
| `LOGGER_APPDATA` | `<APPDATA_PFAD>/mira-shelly-logger` |
| `LOGGER_IP` | `<LOGGER_IP>` – feste Adresse im Server-Netz (Pflicht) |
| `LOGGER_NETWORK` | `macvlan_server` – Name des vorhandenen macvlan-Netzes (wie `MIRA_NETWORK`) |
| `LOGGER_SHELLY_URL` | `http://<SHELLY_IP>` |
| `LOGGER_VERSION` | `0.1.1` (Standard `latest`) |
| `LOGGER_POLL_INTERVAL_MS` | `1000` |
| `MIRA_INTERN_SUBNET` / `LOGGER_INTERN_IP` | `172.31.250.0/28` / `172.31.250.10` – nur ändern, falls das Subnetz auf Asgard schon belegt ist |

Der MIRA-Stack bleibt unverändert; MIRA tritt dem Netz `mira-intern` erst in Stufe 4b bei.
Der macvlan-Container kann – wie MIRA – Asgard selbst nicht erreichen; das ist hier nicht nötig.

### 6. Prüfen

```bash
docker logs mira-shelly-logger                     # „Shelly erkannt“, keine Warnungen
docker exec mira-shelly-logger sh -c 'wget -qO- http://$LOGGER_HOST:8090/api/v1/live'
docker exec mira-shelly-logger sh -c 'wget -qO- http://$LOGGER_HOST:8090/health'
```

Live-Werte mit der Shelly-App vergleichen. Nach 24 Stunden muss der Tagesverbrauch
(`/api/v1/consumption?period=day`) zum Zählerfortschritt des Shelly passen.

**Last im Betrieb beobachten:** `/health` enthält Frequenz, Antwortzeiten des Shelly, Fehler der
letzten Minute sowie CPU und RAM des Loggers. Eine Stunde lang minütlich mitschreiben:

```bash
for i in $(seq 60); do docker exec mira-shelly-logger sh -c 'wget -qO- http://$LOGGER_HOST:8090/health'; echo; sleep 60; done > logger-health.jsonl
```

Sind Fehler häufig oder die Antwortzeiten nahe am Zeitlimit, `LOGGER_POLL_INTERVAL_MS=2000` setzen
und den Stack neu starten – ohne Codeänderung.

## API

Alle Antworten sind JSON; Zeitpunkte ISO-8601 in UTC, Energie in Wh, Leistung in W. Fehlende
Werte sind `null`, nie 0. Verträge (zod): [`shared/src/shellyLogger.ts`](../shared/src/shellyLogger.ts).
Nur `GET`; andere Methoden → `405`. Ungültige Parameter → `400 { "error": "invalid_request" }`.

| Endpunkt | Inhalt | Quelle |
| --- | --- | --- |
| `GET /health` | Zustand, Version, Abfragestatistik (letzte 60 s), CPU/RAM – ohne Token, für den Healthcheck | Speicher |
| `GET /api/v1/live` | aktueller Messwert mit Zeitpunkt, Alter und Zustand | Speicher (nie SQLite) |
| `GET /api/v1/consumption?period=day\|week\|month\|year[&date=JJJJ-MM-TT]` | Verbrauch im Zeitraum, der `date` enthält (ohne `date`: aktueller); mit Aufteilung | Tagessummen (zwischengespeichert) |
| `GET /api/v1/history?range=1h\|24h\|7d\|30d` | Leistungsverlauf im Raster von MIRA | 30-s-Intervalle |
| `GET /api/v1/database/stats` | Größe (inkl. WAL/SHM), Anzahl Intervalle, ältester/neuester Zeitpunkt | jede Minute aktualisiert |

**Zustände** (`state`): `online` (Wert jünger als `LOGGER_STALE_AFTER_MS`), `stale` (zu alt, keine
Fehlermeldung), `offline` (Abfragen schlagen fehl), `unknown` (noch keine Messung). Alte Werte
bleiben sichtbar, aber immer mit `measuredAt`, `ageMs` und Zustand – nie als „aktuell“.

**Fehlercodes** (`lastError`): `timeout`, `unreachable`, `unauthorized`, `invalid_response`,
`unsupported_device` (Gen1), `no_meter` (keine Messkomponente).

Beispiel `GET /api/v1/live`:

```json
{
  "state": "online",
  "measuredAt": "2026-11-10T16:56:20.094Z",
  "ageMs": 907,
  "powerW": 99,
  "voltageV": 230.4,
  "currentA": 0.43,
  "energyCounterWh": 12345.815,
  "lastError": null,
  "device": { "id": "shellyplugpmg3-…", "model": "S3PM-001PCEU16", "generation": 3, "firmware": "1.5.0", "component": "pm1:0" },
  "pollIntervalMs": 1000,
  "staleAfterMs": 5000
}
```

`energyCounterWh` ist der Zählerstand des Shelly – **nicht** der Verbrauch eines Zeitraums.

Beispiel `GET /api/v1/consumption?period=week` (gekürzt):

```json
{
  "period": "week", "timezone": "Europe/Berlin",
  "from": "2026-11-08T23:00:00.000Z", "to": "2026-11-15T23:00:00.000Z", "complete": false,
  "energyWh": 4120.5, "measuredWh": 4102.3, "reconstructedWh": 18.2, "coverage": 0.9987,
  "breakdown": [ { "label": "2026-11-09", "from": "…", "to": "…", "energyWh": 2210.1, "measuredWh": 2210.1, "reconstructedWh": 0, "coverage": 1 } ]
}
```

- `measuredWh`: aus lückenlos erfassten 30-s-Intervallen.
- `reconstructedWh`: Zählerdifferenz über einen Ausfall – die Summe ist sicher, die zeitliche Verteilung nicht.
- `coverage`: Anteil der vergangenen Zeit mit Messwerten.
- `complete: false`: laufender Zeitraum – es zählt nur, was bis jetzt erfasst ist, einschließlich des noch nicht geschriebenen Intervalls.
- Aufteilung: Woche und Monat nach Tagen, Jahr nach Monaten, Tag ohne Aufteilung.

## Datenformat

Datenbank `shelly-logger.db` (SQLite, WAL). Zeitpunkte als **UTC-Millisekunden**; Kalendertage
(`daily_energy.day`) in `LOGGER_TIMEZONE`. Es wird **nichts automatisch gelöscht**.

| Tabelle | Spalten |
| --- | --- |
| `power_samples` | `interval_start` (an :00/:30 ausgerichtet), `interval_end`, `avg_w` (zeitgewichtet), `min_w`, `max_w`, `sample_count`, `covered_ms`, `avg_voltage`, `energy_wh`, `quality` |
| `energy_gaps` | `gap_start`, `gap_end`, `energy_wh` – Energie über Messausfälle, je Kalendertag aufgeteilt |
| `daily_energy` | `day`, `measured_wh`, `reconstructed_wh`, `covered_ms`, `sample_count`, `updated_at` |
| `meter_state` | zuletzt verbuchter Zählerstand (`ts`, `total_wh`) und `device_id` |

**So entstehen die Werte:**

- **Leistung:** Jede Messung gilt bis zur nächsten, höchstens zwei Abfrageintervalle lang.
  Daraus ergibt sich das zeitgewichtete Mittel. Nicht abgedeckte Zeit bleibt unbekannt (`covered_ms`).
- **Energie:** Nur aus dem Zähler (`aenergy.total`), als Differenz aufeinanderfolgender Stände,
  nie Leistung × Zeit:
  - Ein **Rücksprung** des Zählers (Reset bzw. Neustart des Shelly) wird erkannt; danach zählt der neue Stand ab 0.
  - Ein **Sprung über der Plausibilitätsgrenze** wird nicht verbucht.
  - Eine **Lücke** über 5 s zwischen zwei Intervallen wird als `energy_gaps` (rekonstruiert) gespeichert.
- **Qualität:**
  - `ok`: ≥ 90 % des Intervalls abgedeckt
  - `partial`: Teilintervall, z. B. Start, Beenden oder kurzer Ausfall
  - `counter_reset`
  - `implausible`
- **Neustart:** Beim Beenden wird das laufende Intervall geschrieben. Ein Teilintervall nach dem
  Neustart wird mit dem vorhandenen zusammengeführt. Der Zählerstand wird in derselben
  Transaktion gespeichert, deshalb wird nichts doppelt gezählt.
- **Tagessummen** werden nach jedem Intervall für die betroffenen Tage neu berechnet. Das ist
  wiederholbar. Wochen, Monate und Jahre ergeben sich aus den Tagessummen.
- **Zeitumstellung:** Tage mit 23 bzw. 25 Stunden werden vollständig gezählt. Die 30-s-Raster
  fallen immer exakt auf lokale Mitternacht.

**Wachstum:** etwa 82 Byte je Intervall, also etwa 82 MiB je Jahr bei 2 880 Intervallen am Tag.
Ein 30-Tage-Verlauf aus 86 400 Intervallen ist in rund 30 ms berechnet.

## Betrieb

| Aufgabe | Vorgehen |
| --- | --- |
| Protokoll | `docker logs mira-shelly-logger` – nur Start, Erkennung, Zustandswechsel, Sicherung und Fehler; nicht jede Abfrage |
| Update | `LOGGER_VERSION` setzen → „Update the stack“ mit „Re-pull image“. Die Lücke während des Neustarts wird aus dem Zähler rekonstruiert. |
| Intervall 2 s | `LOGGER_POLL_INTERVAL_MS=2000`, Stack aktualisieren |
| Beenden | `docker stop` sendet SIGTERM: laufende Abfrage abwarten, Intervall schreiben, Datenbank schließen (`stop_grace_period: 20s`) |
| KI-Server schläft oder ist aus | kein Fehler – der Shelly misst weiter (wenige W bzw. 0 W) |
| Shelly nicht erreichbar | Zustand `offline`, `lastError` nennt den Grund; die Messung setzt automatisch wieder ein, die Energie der Lücke wird rekonstruiert |
| Anderer Shelly | wird an der Geräte-ID erkannt; der alte Zählerstand wird nicht verrechnet |
| Datenbankgröße | `GET /api/v1/database/stats` |

### Sicherung und Wiederherstellung

Täglich um `LOGGER_BACKUP_TIME` (Standard 03:45, Ortszeit) erzeugt der Logger im laufenden Betrieb
eine konsistente Kopie (SQLite-Backup-API) unter `data/backups/shelly-logger-JJJJ-MM-TT.db`. Die
letzten 7 bleiben erhalten. Jede Sicherung ist eine einzelne, eigenständige Datei. Für zusätzliche
Sicherheit `backups/` in die Sicherung von Asgard aufnehmen.

Wiederherstellen:

1. Stack stoppen.
2. Im Ordner `data/` die defekte Datenbank beiseitelegen:
   `mkdir -p defekt && mv shelly-logger.db* defekt/`
3. Sicherung zurückkopieren: `cp backups/shelly-logger-JJJJ-MM-TT.db shelly-logger.db && chown 1000:1000 shelly-logger.db`
4. Stack starten. Die Zeit seit der Sicherung wird aus dem Zählerstand als rekonstruierte Energie ergänzt.
   Die Leistungswerte dieser Zeit fehlen.

### Bereinigung

Eine automatische Löschung gibt es bewusst nicht. Eine spätere, manuelle Bereinigung (z. B. alte
30-s-Intervalle nach Jahren) ist vorgesehen, gehört aber noch nicht zum Umfang. Die Tagessummen
bleiben in jedem Fall erhalten.

## Entwicklung und Tests

```bash
npm run test -w @mira/shelly-logger           # 47 Tests gegen einen simulierten Shelly
npm run typecheck -w @mira/shelly-logger
npm run fake-shelly -w @mira/shelly-logger    # simulierter Shelly auf http://127.0.0.1:8099
LOGGER_SHELLY_URL=http://127.0.0.1:8099 LOGGER_DATA_DIR=./data npm run dev -w @mira/shelly-logger
docker build -f shelly-logger/Dockerfile -t mira-shelly-logger .
```

**Lasttest** (startet den Logger als eigenen Prozess, belastet die API wie MIRA und schreibt einen Bericht):

```bash
npm run build -w @mira/shared && npm run build -w @mira/shelly-logger
npm run loadtest -w @mira/shelly-logger -- --built --duration 240 --interval 1000 --report docs/lasttest-1000ms.md
# gegen einen echten Shelly (nur lesend), von einem Rechner mit Zugriff auf das IoT-VLAN:
npm run loadtest -w @mira/shelly-logger -- --built --shelly http://<SHELLY_IP> --password-file pw.txt --duration 600
```

Ergebnisse mit dem simulierten Shelly: [1000 ms](docs/lasttest-1000ms.md), [2000 ms](docs/lasttest-2000ms.md).
