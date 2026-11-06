# Stufe 3 – Messwert-Historie

- Status: 🧪 umgesetzt, Abnahme auf Asgard ausstehend (freigegeben 2026-11-06, MIRA 0.4.0 / Odin-API 0.1.3)
- Grundlage: [Datenmodell](../architektur/datenmodell.md), Stufe 2 (Odin-Monitor)

## Ziel

MIRA speichert die Messwerte von Odin dauerhaft und zeigt in der Odin-Ansicht
**echte Verlaufsdiagramme** (24 h / 7 Tage / 30 Tage) statt Beispieldaten.
Die Datenbank wird automatisch gesichert. Auf Asgard genügt ein Update des Stacks;
auf Odin ist kein Eingriff nötig (Odin-API 0.1.3 ist empfohlen, siehe Ergebnis).

## Festlegungen (2026-11-06)

| | Festlegung |
| --- | --- |
| Erfassung | MIRA fragt Odin **alle 2 Sekunden** ab – im Backend, **unabhängig davon, ob die Weboberfläche offen ist**. Messwerte landen immer in der Datenbank. |
| Verbindung | Die TLS-Verbindung zu Odin bleibt offen und wird wiederverwendet; das Zertifikat wird je Verbindung geprüft, das Token erst danach gesendet. |
| Live-Anzeige | Widgets im Browser aktualisieren sich alle 2 Sekunden, solange die Seite sichtbar ist (Werte aus dem Speicher von MIRA). |
| Datenbank | nur verdichtet: 1 Datensatz je Minute (Mittel- und Höchstwert von ~30 Messungen) plus Stundenwerte. Die Historie ist daher bis zu einer Minute verzögert, die Live-Anzeige nicht. |
| „Offline“ | nach **10 Sekunden** ohne Antwort (statt nach zwei Fehlversuchen) |
| Aufbewahrung | Minutenwerte 7 Tage, Stundenwerte 365 Tage |
| Sicherung | täglich 03:30 (Ortszeit), die letzten 7 bleiben erhalten, in `data/backups/` |

Für später (Stufe 5/9) notiert: Häufige Abfragen dürfen einen schlafenden Odin nicht
wecken – Wake-on-LAN an `eno1` muss auf „nur Magic Packet“ stehen; MIRA pausiert die
Abfragen, wenn es Odin selbst schlafen gelegt hat.

## Umfang

### 1. Speicherung (Modul `systems`)

| Tabelle | Auflösung | Aufbewahrung (Standard) | Inhalt |
| --- | --- | --- | --- |
| `server_samples` | 1 Minute | 7 Tage | Mittel- und Höchstwerte je Minute: CPU, GPU, RAM, VRAM, Last, Temperaturen |
| `server_samples_hourly` | 1 Stunde | 365 Tage | verdichtet aus den Minutenwerten |

- Der Odin-Monitor fragt alle 2 s ab; je Minute wird **ein** Datensatz geschrieben
  (Mittelwert und Höchstwert der Abfragen dieser Minute).
- Ist Odin nicht erreichbar oder schläft, entstehen **Lücken** – es wird nichts erfunden
  oder interpoliert.
- Größenordnung: rund 10 000 Minuten- und 8 760 Stundenwerte, zusammen wenige MB.

### 2. Hintergrundaufgaben (Core)

Kleiner Scheduler im Core (feste Intervalle, Protokollierung, Fehler beenden nichts):

- **alle 10 Minuten:** Stundenwerte der letzten 48 Stunden (neu) berechnen, alte Daten
  gemäß Aufbewahrung löschen. Die Neuberechnung ist wiederholbar und holt Ausfälle nach.
- **stündlich:** abgelaufene Sessions und Audit-Einträge löschen (bisheriger Wartungs-Timer).
- **täglich 03:30:** Datenbank sichern (SQLite-Backup-API, konsistent auch im laufenden Betrieb)
  nach `/data/backups/mira-JJJJ-MM-TT.db`; die letzten **7** Sicherungen bleiben erhalten.

Konfigurierbar: `MIRA_HISTORY_RAW_DAYS` (7), `MIRA_HISTORY_HOURLY_DAYS` (365),
`MIRA_BACKUP_KEEP` (7), `MIRA_BACKUP_TIME` (03:30).

### 3. API

`GET /api/v1/systems/odin/history?range=24h|7d|30d`

| Zeitraum | Quelle | Punkte |
| --- | --- | --- |
| 24 h | Minutenwerte, zu 5-Minuten-Werten zusammengefasst | 288 |
| 7 Tage | Stundenwerte | 168 |
| 30 Tage | Stundenwerte, zu 4-Stunden-Werten zusammengefasst | 180 |

Je Punkt: Zeitpunkt, CPU- und GPU-Auslastung (Mittelwert); fehlende Zeiträume als Lücke.

### 4. Oberfläche

- Odin-Ansicht: Diagramm „Auslastung“ mit echten Daten; Kennzeichnung „Beispieldaten“ entfällt.
- Zeitachse aus den echten Zeitpunkten; Lücken werden als Unterbrechung der Linie gezeigt.
- Solange noch zu wenig Daten vorliegen: Hinweis „Verlauf wird aufgebaut …“.

### 5. Tests

Verdichtung, Mittel-/Höchstwerte, Lücken, Löschen nach Aufbewahrung, History-Endpunkt je
Zeitraum, Scheduler, Sicherung und Rotation, Erhalt der Daten über einen Neustart.

## Erfolgskriterien

| Kriterium |
| --- |
| Nach einigen Minuten Betrieb zeigt das 24-h-Diagramm echte CPU-/GPU-Werte von Odin. |
| 7-Tage- und 30-Tage-Ansicht nutzen die Stundenwerte. |
| Zeiten, in denen Odin aus war oder schlief, erscheinen als Lücke. |
| Messwerte überstehen Neustart und Update des Containers. |
| Die Datenbank wächst nicht unbegrenzt (Löschen nach Aufbewahrung nachgewiesen). |
| Täglich entsteht eine Sicherung; ältere als die letzten 7 werden entfernt. |
| Alle Tests grün; Auslieferung als neues Release (Update nur in Portainer). |

## Ergebnis

### Umsetzung

| Baustein | Datei |
| --- | --- |
| Scheduler (Intervall- und Tagesaufgaben, startet erst mit dem Server, Fehler werden protokolliert) | `backend/core/scheduler.ts` |
| Sicherung (SQLite-Backup-API → temporäre Datei → umbenennen, Rotation) | `backend/core/backup.ts` |
| Tabellen `server_samples`, `server_samples_hourly` (Migration 2 des Moduls `systems`) | `backend/modules/systems/migrations.ts` |
| Minuten-Verdichtung im Speicher, ein `INSERT` je Minute | `backend/modules/systems/sampleAggregator.ts` |
| Stunden-Verdichtung, Aufbewahrung, Verlaufsabfrage mit festen Zeitfenstern | `backend/modules/systems/history.ts` |
| Keep-Alive-Verbindung mit Zertifikatsprüfung vor der ersten Anfrage | `backend/modules/systems/odinClient.ts` |
| Zeitbasierte Offline-Erkennung, jede Messung → Verdichtung | `backend/modules/systems/odinMonitor.ts` |
| Verlaufsdiagramm mit Lücken, Achsen aus echten Zeitpunkten | `frontend/src/components/charts/TimeSeriesChart.tsx`, `frontend/src/lib/historyTicks.ts` |

### Entscheidungen und Erkenntnisse

| Thema | Lösung |
| --- | --- |
| Zeitstempel | In der Datenbank UTC (ISO-8601, Minuten- bzw. Stundenbeginn); die Oberfläche beschriftet in Ortszeit. Damit gibt es bei der Zeitumstellung keine doppelten oder fehlenden Stunden in den Daten. |
| Mittelwerte über mehrere Datensätze | gewichtet nach Anzahl der Messungen (`samples`) – eine Minute mit 5 Messungen zählt weniger als eine volle mit 30 |
| Sicherung im WAL-Modus | Die Kopie wird vor dem Umbenennen auf `journal_mode = DELETE` umgestellt: jede Sicherung ist **eine** eigenständige Datei, ohne `-wal`/`-shm`. |
| Zeitzone | Ohne `TZ` läuft der Container in UTC (Sicherung um 04:30 bzw. 05:30 Ortszeit). Der Stack setzt `TZ=Europe/Berlin`; node:22-alpine bringt die Zeitzonendaten selbst mit. |
| Keep-Alive und Pinning | Eine neue TLS-Verbindung wird erst nach erfolgreicher Prüfung des Fingerprints an Anfragen übergeben – das Token erreicht nie einen fremden Server (Test). Danach nutzen alle Abfragen dieselbe Verbindung (Test: 1 TLS-Verbindung für mehrere Abfragen). |
| Hängendes Netzlaufwerk auf Odin (Odin-API 0.1.3) | Ein hängender `statfs` belegt dauerhaft einen der 4 Threads des libuv-Pools. Bei Abfragen alle 2 s wäre die Odin-API nach wenigen Sekunden blockiert. Jetzt läuft je Einhängepunkt höchstens ein Aufruf; weitere Anfragen warten auf diesen (max. 1,5 s) und melden die Belegung als unbekannt. |

### Tests

Backend 58, Odin-API 25 – alle grün. Neu: Minuten-Verdichtung (Mittel/Max, Messungen
ohne GPU), Verlauf je Zeitraum mit Lücken, gewichtete und wiederholbare
Stunden-Verdichtung, Aufbewahrung, Scheduler (Tagestermin, Start erst nach `start()`,
Fehler), Sicherung (konsistente Kopie, Rotation, gleicher Tag ersetzt), Wiederverwendung
der TLS-Verbindung, History-Endpunkt (Anmeldung, ungültiger Zeitraum, Punktzahl),
hängendes Netzlaufwerk (nur ein `statfs`).

### Inbetriebnahme

1. Stack in Portainer aktualisieren: neuen Inhalt von `deploy/portainer-stack.yml`
   (neu: `TZ`) einfügen, `MIRA_VERSION` auf `0.4.0` → „Update the stack“ mit „Re-pull image“.
2. Nach einigen Minuten zeigt das 24-h-Diagramm die ersten Werte; 7/30 Tage nach spätestens 10 Minuten.
3. Am Folgetag prüfen: `MIRA_APPDATA/data/backups/` enthält `mira-JJJJ-MM-TT.db`.
4. Optional (empfohlen): Odin-API auf 0.1.3 aktualisieren (gleiches Verfahren wie 0.1.1 → 0.1.2).

## Nicht enthalten

- Verlauf des Stromverbrauchs (Stufe 4, nutzt denselben Mechanismus).
- Wiederherstellung über die Oberfläche (Wiederherstellung zunächst per Anleitung).
- Dashboard (Stufe 6).
