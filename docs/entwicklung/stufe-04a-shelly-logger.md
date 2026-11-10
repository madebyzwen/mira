# Stufe 4a – Shelly-Logger

- Status: 🔍 umgesetzt, Abnahme und Inbetriebnahme ausstehend (2026-11-10)
- Entscheidung: [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md) – ersetzt die Planung in [Stufe 4](stufe-04-shelly.md)
- Code: [`shelly-logger/`](../../shelly-logger/) · Betriebshandbuch: [`shelly-logger/README.md`](../../shelly-logger/README.md)
- Folgt: [Stufe 4b – MIRA-Integration](stufe-04b-shelly-mira-integration.md) (eigene Freigabe)

## Ziel

Ein eigenständiger Container erfasst den Stromverbrauch des KI-Servers über den Shelly
Plug – dauerhaft, unabhängig von MIRA und vom KI-Server, mit eigener SQLite-Datenbank und
einer kleinen internen Lese-API. Die MIRA-Oberfläche bleibt in dieser Stufe unverändert.

## Festlegungen

| | Festlegung |
| --- | --- |
| Abfrage | lokal, nur lesend; `PM1.GetStatus` (reines Messgerät) bzw. `Switch.GetStatus` (Plug mit Relais) – wird über `GET /shelly` und `Shelly.GetStatus` erkannt; Gen1 wird nicht unterstützt |
| Takt | 1000 ms (Standard), 2000 ms per `LOGGER_POLL_INTERVAL_MS`; nie zwei Anfragen gleichzeitig, keine Zusatzversuche; Keep-Alive; Zeitlimit 800 ms |
| Live-Wert | im Speicher mit Messzeitpunkt; älter als 5 s → `stale` bzw. `offline`, nie als aktuell ausgegeben |
| Verdichtung | je 30 s (an :00/:30 ausgerichtet, damit exakt auf lokaler Mitternacht): Mittel (zeitgewichtet), Min, Max, Anzahl, abgedeckte Zeit, Spannung, Energie, Qualität |
| Energie | nur aus dem Zählerstand `aenergy.total` – nie aus der Leistung hochgerechnet; Zähler-Reset, unplausible Sprünge (> 3 680 W) und Ausfälle werden erkannt |
| Ausfälle | keine erfundenen Werte (nie 0 W/0 Wh); Energie über einen Ausfall wird als **rekonstruiert** getrennt gespeichert (Summe sicher, Verteilung unbekannt), je Kalendertag zeitanteilig |
| Neustart | laufendes Intervall wird beim Beenden geschrieben; der zuletzt verbuchte Zählerstand liegt in derselben Transaktion – keine Doppelzählung |
| Statistik | Tagessummen in `Europe/Berlin` (DST-sicher); Woche ab Montag, Monat, Jahr aus den Tagessummen; auch abgeschlossene Zeiträume (`date=`) |
| Aufbewahrung | keine automatische Löschung; tägliche Sicherung (SQLite-Backup-API), die letzten 7 |
| Netz | keine veröffentlichten Ports; API im internen Netz `mira-intern`; zum Shelly über eigenes Bridge-Netz und Asgards Adresse; OPNsense: `<ASGARD_IP>` → `<SHELLY_IP>`, TCP 80 |
| Betrieb | eigenes Image `ghcr.io/madebyzwen/mira-shelly-logger`, Tags `shelly-logger-vX.Y.Z`; unprivilegiert (UID 1000), read-only, keine Capabilities, Healthcheck |

## Umsetzung

| Was | Wo |
| --- | --- |
| Shelly-Client (Keep-Alive, Zeitlimit, Digest SHA-256, Erkennung) | `shelly-logger/src/shelly/client.ts` |
| Abfrage-Takt und Live-Wert | `shelly-logger/src/poller.ts` |
| 30-s-Verdichtung, Energie, Ausfälle | `shelly-logger/src/aggregator.ts` |
| Datenbank, Tagessummen, Sicherung | `shelly-logger/src/store.ts` |
| Kalender in Europe/Berlin | `shelly-logger/src/time.ts` |
| Verbrauch, Verlauf, Datenbankstatistik | `shelly-logger/src/reports.ts` |
| Lese-API | `shelly-logger/src/server.ts`, Verträge `shared/src/shellyLogger.ts` |
| Image, CI | `shelly-logger/Dockerfile`, `.github/workflows/ci.yml` (Job „Docker-Image Shelly-Logger“) |
| Stack (Vorschlag) | `deploy/shelly-logger-stack.yml` |
| Simulierter Shelly, Lasttest | `shelly-logger/test/fakeShelly.ts`, `shelly-logger/scripts/loadtest.ts` |

## Geprüft (2026-11-10)

- **47 automatisierte Tests** gegen einen simulierten Shelly (Gen3 Plug PM), u. a.: Takt 1000 ms
  und 2000 ms, keine parallelen Abfragen bei langsamen Antworten, hängende Antworten, Digest-
  Anmeldung, Mittel/Min/Max (zeitgewichtet), fehlende Messwerte, Zähler-Reset, unplausible
  Sprünge, Ausfall über Mitternacht, Neustart mitten im Intervall und nach längerer Pause,
  Gerätewechsel, Tages-/Wochen-/Monats-/Jahreswechsel, 23- und 25-Stunden-Tage,
  KI-Server im Ruhezustand bzw. aus (0 W gemessen ≠ Lücke), API-Verträge, Token,
  Live-Abfrage ohne Datenbank, Datenbankwachstum und Persistenz, Sicherung.
- **Container** gehärtet wie im Stack (read-only, `cap_drop: ALL`, UID 1000): Erkennung mit
  Passwort, Live-Werte, Healthcheck „healthy“, `docker stop` geordnet (Exit 0, Teilintervall
  geschrieben, WAL übernommen).
- **Lasttest** (simulierter Shelly, gebauter Stand): [1000 ms](../../shelly-logger/docs/lasttest-1000ms.md),
  [2000 ms](../../shelly-logger/docs/lasttest-2000ms.md).

| Kennzahl | 1000 ms | 2000 ms |
| --- | --- | --- |
| Tatsächliche Frequenz | 0,995 Hz, 0 Fehler | 0,499 Hz, 0 Fehler |
| CPU des Loggers | Ø 0,8 % eines Kerns | Ø 0,7 % |
| RAM (RSS) | ≈ 90 MB | ≈ 90 MB |
| Live-API p50 / p95 | 5,5 / 7,9 ms | – |
| Schreiblast | eine Transaktion je 30 s | eine Transaktion je 30 s |
| Datenbankwachstum | ≈ 82 Byte je Intervall → ≈ 82 MiB je Jahr | gleich |

Die **Antwortzeiten des echten Shelly** sind erst am Gerät messbar. Nach der Freigabe liefert
`/health` im Betrieb Frequenz, Antwortzeiten, Fehler, CPU und RAM. Das Mitschreiben über eine
Stunde ist im [Betriebshandbuch](../../shelly-logger/README.md#6-prüfen) beschrieben. Alternativ kann der
Lasttest mit `--shelly http://<SHELLY_IP>` laufen, auch er nur lesend.

## Gerät (bestätigt 2026-11-10)

| | |
| --- | --- |
| Modell | Shelly Plug PM Gen3 (`S3PL-30116EU`, App `PlugPMG3`), reines Messgerät ohne Relais |
| Firmware | 2.1.1 |
| Messkomponente | `pm1:0` → `GET /rpc/PM1.GetStatus?id=0` (Felder `apower`, `voltage`, `current`, `aenergy.total` wie erwartet) |
| Anmeldung | Passwort gesetzt (`auth_en: true`), Digest mit Anmeldedomäne = Geräte-ID |
| Netz | IoT-VLAN, feste Adresse (`<SHELLY_IP>`, nur im Stack und in der OPNsense) |

Die aufgezeichneten Antworten liegen anonymisiert als Testfall in
`shelly-logger/test/fixtures/plug-pm-gen3.json`.

## Abnahme

- [ ] Gerät erkannt (Modell, Generation, Komponente) und Live-Werte plausibel im Vergleich zur Shelly-App
- [ ] Lasttest am echten Shelly: Frequenz ≈ 1 Hz, Fehlerrate ≈ 0, Antwortzeiten deutlich unter 800 ms – sonst 2000 ms
- [ ] Nach 24 h: Tagesverbrauch entspricht dem Zählerfortschritt des Shelly
- [ ] Neustart des Containers und Neustart von Asgard ohne Doppelzählung
- [ ] Sicherung vorhanden (`data/backups/`)
- [ ] KI-Server im Ruhezustand: Messung läuft weiter, Zustand „online“

## Offene Angaben (vom Betreiber)

| Angabe | Wofür |
| --- | --- |
| ~~Ausgabe von `/shelly`, Passwort, feste IP~~ | ✅ geklärt (siehe Gerät) |
| Ablageort `LOGGER_APPDATA` auf Asgard | Stack |
| Sichtbarkeit des Images in der GitHub Container Registry | Asgard muss das Image ohne Anmeldung laden können |
