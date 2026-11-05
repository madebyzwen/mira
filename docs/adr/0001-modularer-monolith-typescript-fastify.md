# 0001 – Modularer Monolith mit TypeScript und Fastify

- Status: angenommen
- Datum: 2026-11-05

## Kontext

Das Briefing fordert einen modularen Monolithen mit Core und Fachmodulen, aber
keine Backend-Technologie. Die Weboberfläche existiert bereits in React und
TypeScript. MIRA wird von einer Person entwickelt und betrieben.

## Entscheidung

- Backend in **TypeScript auf Node.js 22** mit **Fastify**.
- npm-Workspaces: `frontend`, `backend`, `shared`.
- `shared` enthält die API-Verträge als **zod-Schemas**; Backend validiert damit,
  Frontend (und später die Odin-API) nutzen die abgeleiteten Typen.
- Module werden statisch in `backend/modules/index.ts` registriert; kein
  dynamisches Plugin-System.
- Kein ORM: reines SQL mit `better-sqlite3`.
- In der Entwicklung läuft das Backend direkt aus TypeScript (Node-Typ-Stripping,
  Exportbedingung `source`), für den Betrieb wird mit `tsc` kompiliert.

## Alternativen

- **Python/FastAPI**: ebenfalls gut geeignet, aber zweite Sprache und keine
  gemeinsamen Typen mit dem Frontend.
- **ORM (Drizzle/Prisma)**: komfortabler, aber zusätzliche Abhängigkeit und
  Abstraktion ohne Bedarf bei wenigen Tabellen.
- **Microservices**: im Briefing ausgeschlossen.

## Konsequenzen

- Eine Sprache und Toolchain für das gesamte Projekt.
- Änderungen an API-Verträgen fallen in Frontend und Backend beim Typecheck auf.
- `better-sqlite3` ist ein natives Modul; der Docker-Build enthält Build-Werkzeuge.
- TypeScript bleibt vorerst bei 5.9 (TypeScript 7 ist ein neuer nativer Compiler;
  Umstieg später gesondert prüfen).
