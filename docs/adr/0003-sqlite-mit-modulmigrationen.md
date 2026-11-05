# 0003 – SQLite mit versionierten Migrationen pro Modul

- Status: angenommen
- Datum: 2026-11-05

## Kontext

Das Briefing legt SQLite als zentrale Datenbank fest, mit versionierten,
modulbezogenen Migrationen.

## Entscheidung

- Eine Datei `/data/mira.db`, WAL-Modus, Fremdschlüssel aktiv, `busy_timeout`.
- Eigener, kleiner Migrationsrunner (`backend/core/db/migrations.ts`):
  - Tabelle `schema_migrations (module, version, name, applied_at)`.
  - Jedes Modul (inkl. `core`) hat eine lückenlose Versionsfolge ab 1.
  - Jede Migration läuft in einer eigenen Transaktion.
  - Ausgelieferte Migrationen werden nie verändert; Umbenennungen und
    unbekannte Versionen in der Datenbank brechen den Start ab.
- Migrationen laufen automatisch beim Start.

## Alternativen

- **Migrationswerkzeug eines ORM**: zusätzliche Abhängigkeit ohne Mehrwert.
- **Getrennte Datenbanken pro Modul**: im Briefing ausgeschlossen.

## Konsequenzen

- Module bringen ihre Tabellen selbst mit und bleiben voneinander unabhängig.
- Kein automatisches Zurückrollen von Migrationen; Korrekturen erfolgen über neue Migrationen.
- Backups müssen die SQLite-Backup-API nutzen (WAL) – Konzept folgt mit Stufe 3.
