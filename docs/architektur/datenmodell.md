# Datenmodell (konzeptionell)

SQLite, eine Datenbank für alle Module. Jedes Modul besitzt seine Tabellen und
Migrationen (siehe [ADR 0003](../adr/0003-sqlite-mit-modulmigrationen.md)).
Zeitstempel als ISO-8601 in UTC. Geheimnisse werden **nicht** in SQLite
gespeichert, sondern als Datei referenziert ([ADR 0006](../adr/0006-geheimnisse-als-dateien.md)).

Legende: ✅ umgesetzt · 🔜 geplant (Stufe) · ⏸ zurückgestellt

## Core

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `schema_migrations` | modul, version, name, applied_at | ✅ Stufe 1 |
| `users` | id, username (eindeutig, ohne Groß-/Kleinschreibung), display_name, password_hash (scrypt), created_at, last_login_at | ✅ Stufe 1 |
| `sessions` | id, user_id → users, token_hash (SHA-256), created_at, last_seen_at, expires_at, ip, user_agent | ✅ Stufe 1 |
| `settings` | modul, key, value (JSON), updated_at – Konfiguration und kleine Zustände der Module (z. B. `core.update_check`: Ergebnis und Zählung der Update-Prüfungen, zuletzt vom KI-Server gemeldete Version des MIRA-Agents) | ✅ Stufe 1 (Tabelle), genutzt ab A-004 |
| `audit_log` | ts, actor, modul, action, target, result, ip, details (JSON) | ✅ Stufe 1 |
| `notifications` | id, key (eindeutig je Thema, z. B. `update:mira`), ref (Stand, z. B. Version), level, title, message, links (JSON), created_at, read_at, dismissed_at – Glocke in der Kopfzeile; gelesene/ausgeblendete nach 90 Tagen gelöscht | ✅ A-004 (Core-Migration 2) |
| `jobs` | id, modul, typ, system_id, status, progress, payload, result, error, Zeitstempel | 🔜 Stufe 5/8 |

## Modul `systems`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `systems` | id, slug, name, kind (`server` \| `power_meter`), description, created_at – der KI-Server als erster Eintrag (fester Slug `ai-server`, Name aus `MIRA_AI_SERVER_NAME`) | ✅ Stufe 2 |
| `server_connections` | system_id, api_url, zertifikats-Fingerprint, token_ref (Datei), wol-Parameter – bis die Verbindung über die Oberfläche bearbeitbar ist, kommen die Werte aus `MIRA_AI_SERVER_*` | 🔜 später |
| `system_state` | system_id, state (`online`/`offline`/`unknown`; `sleeping`/`windows` ab Stufe 5), since, last_seen_at, last_error | ✅ Stufe 2 |
| `server_samples` | system_id, ts (Minutenbeginn, UTC), samples, cpu/gpu Mittel + Max, ram/vram, load1, Temperaturen CPU/GPU/NVMe Mittel + Max – 1 Datensatz je Minute, 7 Tage | ✅ Stufe 3 |
| `server_samples_hourly` | wie `server_samples`, je Stunde (nach Messungen gewichtet), 365 Tage | ✅ Stufe 3 |
| `energy_prices` | gültig ab, Preis ct/kWh – Kosten bleiben bei Tarifwechsel richtig; der Strompreis bleibt in MIRA, nicht im Shelly-Logger | 🔜 Stufe 4b |

Die Messwerte des Shelly speichert **nicht** MIRA, sondern der eigenständige Shelly-Logger in
seiner eigenen Datenbank ([ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md)).
MIRA liest sie ab Stufe 4b über dessen Lese-API. Die früher hier geplanten Tabellen
`power_meters`, `power_samples`, `power_samples_hourly` und `power_energy_daily` entfallen in MIRA.

## Shelly-Logger (eigene Datenbank `shelly-logger.db`)

Zeitpunkte als UTC-Millisekunden; Kalendertage in `Europe/Berlin`. Es wird nichts automatisch gelöscht.
Einzelheiten: [`shelly-logger/README.md`](../../shelly-logger/README.md#datenformat).

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `power_samples` | 30-s-Intervall: Beginn/Ende, Leistung Mittel (zeitgewichtet)/Min/Max, Anzahl Messungen, abgedeckte Zeit, Spannung, Energie (Wh, aus der Zählerdifferenz), Qualität (`ok`/`partial`/`counter_reset`/`implausible`) | ✅ Stufe 4a |
| `energy_gaps` | Energie über Messausfälle aus der Zählerdifferenz (Summe sicher, Verteilung unbekannt), je Kalendertag aufgeteilt | ✅ Stufe 4a |
| `daily_energy` | Tagessummen: gemessen, rekonstruiert, abgedeckte Zeit, Anzahl Intervalle – Grundlage für Woche, Monat, Jahr | ✅ Stufe 4a |
| `meter_state` | zuletzt verbuchter Zählerstand und Geräte-ID – verhindert Doppelzählung nach Neustart | ✅ Stufe 4a |
| `sleep_inhibits` | system_id, grund, bis, erstellt_von – sperrt automatischen Schlafmodus | 🔜 Stufe 9 |

## Modul `llm`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `llm_models` | Zwischenspeicher der letzten Auflistung (system_id, pfad, größe, quantisierung, familie, geändert, gesehen_am). Maßgeblich bleibt das Dateisystem auf dem KI-Server. | 🔜 Stufe 7 |

Downloads nutzen die Core-Tabelle `jobs`; Zielverzeichnisse stehen in `settings`.

## Modul `agents`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `agents` | id, name, typ, endpunkt, aktiv, config | ⏸ Stufe 10 (zurückgestellt) |

## Modul `dashboard`

Keine eigenen Tabellen – nur Einträge in `settings` (z. B. Sichtbarkeit von Widgets).

## Aufbewahrung

| Daten | Regel | Status |
| --- | --- | --- |
| Audit-Log | `MIRA_AUDIT_RETENTION_DAYS`, Standard 365 Tage, stündliche Bereinigung | ✅ Stufe 1 |
| Sessions | abgelaufene Sessions stündlich entfernt | ✅ Stufe 1 |
| Messwerte | Rohdaten kurz, verdichtete Werte bis 12 Monate (Werte offen) | 🔜 Stufe 3 |

## Backup

SQLite im WAL-Modus nicht per einfacher Dateikopie sichern, solange MIRA läuft.
Geplant: Sicherung über die SQLite-Backup-API (eigener Befehl/Job) – Konzept
folgt spätestens mit Stufe 3, wenn Messwerte gespeichert werden.
