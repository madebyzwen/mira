# Datenmodell (konzeptionell)

SQLite, eine Datenbank für alle Module. Jedes Modul besitzt seine Tabellen und
Migrationen (siehe [ADR 0003](../adr/0003-sqlite-mit-modulmigrationen.md)).
Zeitstempel als ISO-8601 in UTC. Geheimnisse werden **nicht** in SQLite
gespeichert, sondern als Datei referenziert ([ADR 0006](../adr/0006-geheimnisse-als-dateien.md)).

Legende: ✅ umgesetzt · 🔜 geplant (Stufe)

## Core

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `schema_migrations` | modul, version, name, applied_at | ✅ Stufe 1 |
| `users` | id, username (eindeutig, ohne Groß-/Kleinschreibung), display_name, password_hash (scrypt), created_at, last_login_at | ✅ Stufe 1 |
| `sessions` | id, user_id → users, token_hash (SHA-256), created_at, last_seen_at, expires_at, ip, user_agent | ✅ Stufe 1 |
| `settings` | modul, key, value (JSON), updated_at – Konfiguration aller Module | ✅ Stufe 1 (Tabelle) |
| `audit_log` | ts, actor, modul, action, target, result, ip, details (JSON) | ✅ Stufe 1 |
| `jobs` | id, modul, typ, system_id, status, progress, payload, result, error, Zeitstempel | 🔜 Stufe 5/8 |

## Modul `systems`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `systems` | id, slug, name, kind (`server` \| `power_meter`), description, created_at – Odin als erster Eintrag | ✅ Stufe 2 |
| `server_connections` | system_id, api_url, zertifikats-Fingerprint, token_ref (Datei), wol-Parameter – bis die Verbindung über die Oberfläche bearbeitbar ist, kommen die Werte aus `MIRA_ODIN_*` | 🔜 später |
| `system_state` | system_id, state (`online`/`offline`/`unknown`; `sleeping`/`windows` ab Stufe 5), since, last_seen_at, last_error | ✅ Stufe 2 |
| `server_samples` | system_id, ts (Minutenbeginn, UTC), samples, cpu/gpu Mittel + Max, ram/vram, load1, Temperaturen CPU/GPU/NVMe Mittel + Max – 1 Datensatz je Minute, 7 Tage | ✅ Stufe 3 |
| `power_meters` | system_id, host, modell/generation, auth_ref, misst_system_id | 🔜 Stufe 4 |
| `power_samples` | meter_id, ts, watt, energie_wh | 🔜 Stufe 4 |
| `server_samples_hourly` | wie `server_samples`, je Stunde (nach Messungen gewichtet), 365 Tage | ✅ Stufe 3 |
| `power_samples_hourly` | verdichtete Stromwerte für Langzeit-Diagramme | 🔜 Stufe 4 |
| `sleep_inhibits` | system_id, grund, bis, erstellt_von – sperrt automatischen Schlafmodus | 🔜 Stufe 9 |

## Modul `llm`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `llm_models` | Zwischenspeicher der letzten Auflistung (system_id, pfad, größe, quantisierung, familie, geändert, gesehen_am). Maßgeblich bleibt das Dateisystem auf Odin. | 🔜 Stufe 7 |

Downloads nutzen die Core-Tabelle `jobs`; Zielverzeichnisse stehen in `settings`.

## Modul `agents`

| Tabelle | Inhalt | Status |
| --- | --- | --- |
| `agents` | id, name, typ, endpunkt, aktiv, config | 🔜 Stufe 10 |

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
