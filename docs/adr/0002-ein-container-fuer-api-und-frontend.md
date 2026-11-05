# 0002 – Ein Container für API und Weboberfläche

- Status: angenommen
- Datum: 2026-11-05

## Kontext

In Phase 1 lieferte ein nginx-Container die statische Oberfläche aus. Mit dem
Backend käme ein zweiter Container hinzu.

## Entscheidung

Ein einziges Image (`Dockerfile` im Repository-Wurzelverzeichnis): Node/Fastify
liefert API und gebaute Oberfläche aus, inklusive Fallback auf `index.html` für
die Routen der Single-Page-App. Der nginx-Container entfällt.

- Laufzeit: `node:22-alpine`, Benutzer `node` (UID 1000), schreibgeschütztes
  Dateisystem, Daten in `/data` (Volume), Health-Check auf `/health`.
- Laufzeit-Abhängigkeiten nur für Backend und `shared` (keine Frontend-Bibliotheken).
- HTTPS übernimmt der vorhandene Reverse Proxy.

## Alternativen

- **nginx + API-Container**: bewährte Trennung, aber zwei Images, interne
  Weiterleitung und mehr Konfiguration auf dem NAS.

## Konsequenzen

- Ein Image, ein Update, eine Compose-Definition.
- Frontend und Backend haben immer dieselbe Version.
- Statische Dateien werden von Node statt nginx ausgeliefert – für eine
  Single-User-Anwendung ohne Bedeutung.
