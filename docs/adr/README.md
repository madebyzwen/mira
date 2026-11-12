# Architekturentscheidungen (ADR)

Jede Entscheidung mit Auswirkung auf Struktur, Technik oder Sicherheit wird hier
festgehalten. ADRs werden nicht gelöscht: Wird eine Entscheidung geändert, entsteht
eine neue ADR, die alte erhält den Status „ersetzt durch …“.

| Nr. | Titel | Status | Datum |
| --- | --- | --- | --- |
| [0001](0001-modularer-monolith-typescript-fastify.md) | Modularer Monolith mit TypeScript und Fastify | angenommen | 2026-11-05 |
| [0002](0002-ein-container-fuer-api-und-frontend.md) | Ein Container für API und Weboberfläche | angenommen | 2026-11-05 |
| [0003](0003-sqlite-mit-modulmigrationen.md) | SQLite mit versionierten Migrationen pro Modul | angenommen | 2026-11-05 |
| [0004](0004-anmeldung-sessions-erstes-konto.md) | Anmeldung mit Server-Sessions, erstes Konto per Secret-Datei | angenommen | 2026-11-05 |
| [0005](0005-odin-http-api-statt-ssh.md) | Odin-API als HTTP-Dienst statt SSH-Agent | angenommen | 2026-11-05 |
| [0006](0006-geheimnisse-als-dateien.md) | Geheimnisse als Dateien, nicht in SQLite | angenommen | 2026-11-05 |
| [0007](0007-wake-on-lan-ueber-opnsense.md) | Wake-on-LAN über die OPNsense-API | vorgeschlagen | 2026-11-05 |
| [0008](0008-images-ueber-github-container-registry.md) | Images über GitHub Actions und die GitHub Container Registry | angenommen | 2026-11-06 |
| [0009](0009-ki-server-als-rolle-agent-mira-agent.md) | KI-Server als Rolle, Name konfigurierbar, Agent `mira-agent` | angenommen | 2026-11-10 |
| [0010](0010-shelly-logger-als-eigener-container.md) | Shelly-Logger als eigener Container mit eigener Datenbank | angenommen | 2026-11-10 |
| [0011](0011-https-pflicht-und-enges-proxy-vertrauen.md) | HTTPS-Pflicht über `MIRA_PUBLIC_URL` und enges Proxy-Vertrauen | angenommen | 2026-11-12 |

## Vorlage

```markdown
# NNNN – Titel

- Status: vorgeschlagen | angenommen | ersetzt durch NNNN
- Datum: JJJJ-MM-TT

## Kontext
Welches Problem, welche Rahmenbedingungen?

## Entscheidung
Was wird gemacht?

## Alternativen
Was wurde verworfen und warum?

## Konsequenzen
Was folgt daraus – positiv wie negativ?
```
