# Zielarchitektur

Stand: Stufe 1 umgesetzt. Grundlage: [Architekturbriefing](../vorgaben/2026-11-05-architekturbriefing.md)
und die [ADRs](../adr/).

## Überblick

```
 Browser (Heimnetz / WireGuard)
     │  HTTPS über vorhandenen Reverse Proxy → http://<MIRA_IP> (Port 80, macvlan, Server-Netz)
     ▼
┌──────────────── Asgard (NAS, Docker) ────────────────┐
│  Container „mira“                                     │
│   ├─ Weboberfläche (React, statisch ausgeliefert)     │
│   ├─ API /api/v1/…  (Fastify)                         │
│   │    ├─ core: Auth, Config, DB, Audit, Jobs, …      │
│   │    └─ modules: systems, llm, agents, dashboard    │
│   └─ SQLite /data/mira.db  (+ /data/secrets)          │
└───────┬───────────────────────┬──────────────────────┘
        │ HTTPS + Token          │ HTTP (lokal, nur lesend)
        │ (ab Stufe 2)           │ (ab Stufe 4)
        ▼                        ▼
  Odin: MIRA-Odin-API      Shelly Plug PM
  (systemd-Dienst)
        ▲
        │ Wake-on-LAN (ab Stufe 5) – MIRA liegt per macvlan im selben Netz
```

## Komponenten

| Komponente | Technik | Ort |
| --- | --- | --- |
| Weboberfläche | React 19, TypeScript, Vite, React Router, Lucide | `frontend/` |
| Backend | Node.js 22, TypeScript, Fastify ([ADR 0001](../adr/0001-modularer-monolith-typescript-fastify.md)) | `backend/` |
| API-Verträge | zod-Schemas, gemeinsam für alle Teile | `shared/` |
| Datenbank | SQLite, WAL, Migrationen pro Modul ([ADR 0003](../adr/0003-sqlite-mit-modulmigrationen.md)) | `/data/mira.db` |
| Odin-API | HTTP-Dienst auf Odin ([ADR 0005](../adr/0005-odin-http-api-statt-ssh.md)) | ab Stufe 2: `odin-api/` |
| Deployment | ein Container für API + Oberfläche ([ADR 0002](../adr/0002-ein-container-fuer-api-und-frontend.md)) | `Dockerfile`, `deploy/` |

## Backend-Struktur

```
backend/
├── server.ts          Einstiegspunkt (Konfiguration laden, starten, beenden)
├── app.ts             Aufbau: DB + Migrationen, Core, Module, Frontend
├── core/              gemeinsame Dienste – von allen Modulen genutzt
│   ├── config.ts        Umgebungsvariablen (validiert)
│   ├── db/              Verbindung, Migrationsrunner, Core-Migrationen
│   ├── auth/            Passwörter, Benutzer, Sessions, Login-Sperre, Routen + Zugriffsschutz
│   ├── http/            Sicherheits-Header, Health, Auslieferung der Oberfläche
│   ├── audit.ts         Audit-Log
│   ├── errors.ts        einheitliches Fehlerformat
│   └── module.ts        Schnittstelle für Fachmodule
└── modules/
    ├── index.ts         statische Liste der registrierten Module
    ├── systems/         Odin, Shelly (ab Stufe 2)
    ├── llm/             (ab Stufe 7)
    ├── agents/          (ab Stufe 10)
    └── dashboard/       (ab Stufe 6)
```

### Regeln für Module

- Ein Modul implementiert `MiraModule` (`core/module.ts`): Name, eigene
  Migrationen, Routen unter `/api/v1/<modul>/…`.
- Registrierung **statisch** in `modules/index.ts` – kein dynamisches Plugin-System.
- Alle Routen unter `/api/` sind automatisch durch die Anmeldung geschützt.
- Module nutzen Core-Dienste (DB, Audit, Konfiguration) über `CoreContext`
  und bauen diese nicht nach.
- Das Dashboard-Modul stellt nur zusammen und ruft Services anderer Module auf –
  keine eigene Fachlogik.

## API-Konventionen

- JSON, Pfade `/api/v1/<modul>/…`, öffentlich nur `/health`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`.
- Fehler immer als `{ "error": { "code", "message", "details"? } }`, Codes in `shared/src/errors.ts`.
- Eingaben werden mit den zod-Schemas aus `shared/` validiert.
- Ändernde Anfragen mit fremdem `Origin` werden abgewiesen (zusätzlich zu `SameSite=Strict`).

## Frontend-Anbindung

- `frontend/src/services/apiClient.ts` – einziger Zugriffspunkt auf die API.
- `frontend/src/auth/` – Anmeldezustand und Routen-Schutz.
- `frontend/src/services/dataService.ts` – noch Demo-Daten; wird Stufe für
  Stufe durch API-Aufrufe ersetzt.

## Querschnitt

- [Sicherheit](sicherheit.md)
- [Datenmodell](datenmodell.md)
- [Odin-API](odin-api.md)
