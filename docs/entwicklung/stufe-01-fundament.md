# Stufe 1 – Fundament

- Status: ✅ abgeschlossen (Commit `6d628f5`, abgenommen 2026-11-05)
- Freigabe: 2026-11-05
- Entscheidungen: [ADR 0001](../adr/0001-modularer-monolith-typescript-fastify.md) bis [ADR 0004](../adr/0004-anmeldung-sessions-erstes-konto.md), [ADR 0006](../adr/0006-geheimnisse-als-dateien.md)

> **Hinweis (2026-11-10):** Historisches Dokument – es beschreibt den damaligen Stand. Seit
> [Stufe 3a](stufe-03a-ki-server-bereinigung.md) heißt der Rechner allgemein **KI-Server**
> (Name konfigurierbar) und die Software darauf **MIRA-Agent** ([ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md)).
> Das NAS, auf dem MIRA läuft, heißt allgemein **Homeserver**.

## Ziel

Ein lauffähiger Backend-Kern mit Datenbank und echter Anmeldung als Grundlage
für alle weiteren Stufen – ohne jeden Zugriff auf Odin, den Shelly Plug oder
das Netzwerk.

## Umfang

1. npm-Workspaces `shared`, `backend`, `frontend`; gemeinsamer Build.
2. Fastify-Server: `/health`, einheitliches Fehlerformat, strukturiertes Logging, Sicherheits-Header.
3. SQLite (`/data/mira.db`, WAL) mit Migrationsrunner; Core-Tabellen `users`, `sessions`, `settings`, `audit_log`.
4. Anmeldung: Login, Logout, Sessionprüfung, scrypt, Login-Sperre, erstes Konto per Secret-Datei.
5. Frontend: echte Login-Seite (ohne Demo-Kennzeichnung), Routen-Schutz, Abmelden, Benutzername aus der Session.
6. Ein Docker-Image für API und Oberfläche, Volume `/data`, Compose mit Docker-Secret.
7. Vitest-Tests für Migrationen, Passwörter, erstes Konto, Anmeldung, Sessions, Auslieferung.
8. Dokumentation: ADRs, Architektur, Roadmap, diese Stufenbeschreibung.

Nicht enthalten: alle übrigen Views behalten ihre Demo-Daten.

## Erfolgskriterien und Nachweis

| Kriterium | Nachweis |
| --- | --- |
| Ohne Anmeldung sind alle Seiten und `/api/*` gesperrt (außer Login/Health) | Tests `auth.test.ts` (auch unbekannte API-Pfade → 401); Browsertest: `/systeme/odin` → `/login` |
| Falsches Passwort wird abgelehnt, nach mehreren Fehlversuchen greift die Sperre | Tests (401 `invalid_credentials`, 429 `rate_limited` mit `Retry-After`) |
| Konto und Session überstehen einen Container-Neustart | Test `bootstrap.test.ts`; Container-Test mit `docker restart` |
| Login und Logout stehen im Audit-Log, ohne Passwörter | Test `auth.test.ts` › Audit-Log; Prüfung im Container |
| `npm test` grün, Docker-Build läuft, bisherige Views unverändert | 33 Tests grün; Image gebaut; Screenshots Dashboard/Login |
| Kein Zugriff auf Odin, Shelly oder externes Netz | keine entsprechenden Module/Aufrufe vorhanden |

## Ergebnis

- Tests: 5 Testdateien, 33 Tests, alle grün.
- Image `mira:0.2.0`, Laufzeit-Abhängigkeiten ca. 50 MB (ohne Frontend-Bibliotheken).
- Container: läuft als UID 1000, schreibgeschütztes Dateisystem, Datenbankdateien mit Rechten 600.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` automatisch hinter HTTPS.

## Nebenbei behoben

- `.gitignore`: Das Muster `data/` (gedacht für Laufzeitdaten) schloss auch
  `frontend/src/data/demoData.ts` aus. Der Stand `82e51ec` auf GitHub war dadurch
  nicht baubar. Muster auf `/data/` (Wurzelverzeichnis) beschränkt; Build aus einem
  sauberen Stand geprüft.

## Für die Abnahme

1. Lokal starten (README, Abschnitt „Entwicklung“) oder per Compose (Abschnitt „Betrieb auf Asgard“).
2. Mit falschem Passwort anmelden → Fehlermeldung; fünfmal → Sperre.
3. Anmelden → Rückkehr zur zuvor aufgerufenen Seite, Name im Benutzermenü und in der Begrüßung.
4. Abmelden → Login-Seite; geschützte Seiten nicht mehr erreichbar.

## Offen / Folgearbeiten

- Passwort ändern über Konfiguration › MIRA.
- Backup-Konzept für `/data` (spätestens Stufe 3).
- `MIRA_TRUST_PROXY` beim Betrieb hinter dem Reverse Proxy setzen.
