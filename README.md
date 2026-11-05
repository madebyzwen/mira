# MIRA

**Management, Infrastructure, Resources & Automation**

MIRA ist eine modulare, selbst gehostete Plattform zur Überwachung, Verwaltung
und Automatisierung lokaler KI-Infrastruktur. MIRA läuft als Docker-Anwendung
auf dem NAS **Asgard** und verwaltet von dort den KI-Server **Odin**.

## Geplante Funktionen

- Dashboard für Systemstatus und Schnellaktionen
- Überwachung und Energieverwaltung des KI-Servers
- Verbrauchsmessung per Shelly Plug
- Verwaltung von KI-Agenten
- Bestand lokaler GGUF-Modelle und direkte Downloads
- Modulare Konfigurationsoberfläche
- Sicherer webbasierter Zugriff

## Projektstatus

| Stufe | Inhalt | Status |
| --- | --- | --- |
| 0 | Klickbare Weboberfläche nach Mockups | ✅ abgeschlossen |
| 1 | Fundament: Backend, SQLite, echte Anmeldung, ein Container | 🔍 Abnahme ausstehend |
| 2 | Odin-API: Live-Daten von Odin | ⏳ geplant |

Alle Stufen: [Roadmap](docs/entwicklung/roadmap.md). Die Anmeldung ist echt;
alle übrigen Ansichten zeigen noch **Beispieldaten** und führen keine Aktionen aus.

## Dokumentation

Konzepte, Architekturentscheidungen und Entwicklungsstufen liegen unter
[`docs/`](docs/README.md):

- [Zielarchitektur](docs/architektur/zielarchitektur.md) · [Datenmodell](docs/architektur/datenmodell.md) · [Odin-API](docs/architektur/odin-api.md) · [Sicherheit](docs/architektur/sicherheit.md)
- [Architekturentscheidungen (ADR)](docs/adr/README.md)
- [Roadmap und Stufen](docs/entwicklung/roadmap.md)
- [Vorgaben im Original](docs/vorgaben/README.md) · [Mockups](docs/mockups/)

## Aufbau

npm-Workspaces, eine Sprache (TypeScript) für alle Teile.

| Verzeichnis | Inhalt |
| --- | --- |
| `frontend/` | Weboberfläche (React 19, Vite, React Router, Lucide) |
| `backend/` | API und Hintergrunddienste (Node.js 22, Fastify, SQLite) – `core/` + `modules/` |
| `shared/` | Gemeinsame API-Verträge (zod-Schemas und Typen) |
| `deploy/` | Docker Compose für Asgard |
| `docs/` | Dokumentation, Mockups |
| `Dockerfile` | Ein Image für API und Oberfläche |

## Entwicklung (macOS)

Voraussetzung: **Node.js ≥ 22.22**.

```bash
# Node.js installieren (falls noch nicht vorhanden)
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Abhängigkeiten für alle Pakete installieren (im Wurzelverzeichnis)
npm ci

# Erstes Konto für die lokale Entwicklung vorbereiten
mkdir -p data
printf 'mein-lokales-passwort\n' > data/admin_password.txt   # mind. 12 Zeichen
cp backend/.env.example backend/.env                          # bei Bedarf anpassen
```

Zwei Terminals:

```bash
npm run dev:backend    # API auf http://localhost:8080 (startet bei Änderungen neu)
npm run dev:frontend   # Oberfläche auf http://localhost:5173 (leitet /api an das Backend weiter)
```

Anmelden mit dem Benutzer aus `backend/.env` (Standard `admin`) und dem Passwort
aus `data/admin_password.txt`. Das Konto wird nur beim allerersten Start angelegt;
für einen Neuanfang `data/` löschen.

| Befehl (Wurzelverzeichnis) | Zweck |
| --- | --- |
| `npm test` | Backend-Tests (Vitest) |
| `npm run typecheck` | TypeScript-Prüfung aller Pakete |
| `npm run build` | Produktionsbuild von `shared`, `backend`, `frontend` |

## Betrieb auf Asgard (Docker)

Ein Container liefert API und Oberfläche auf **Port 8080** aus. Er läuft als
unprivilegierter Benutzer (UID 1000) mit schreibgeschütztem Dateisystem; alle
Daten liegen im Volume `/data`.

```bash
# 1. Startpasswort für das erste Konto anlegen (wird nicht versioniert)
mkdir -p deploy/secrets
printf 'ein-langes-startpasswort\n' > deploy/secrets/admin_password.txt
chmod 600 deploy/secrets/admin_password.txt

# 2. Bauen und starten
docker compose -f deploy/docker-compose.yml up -d --build
# → http://<ASGARD_IP>:8080
```

- Benutzername und Anzeigename stehen in `deploy/docker-compose.yml`
  (`MIRA_ADMIN_USER`, `MIRA_ADMIN_DISPLAY_NAME`).
- Das Startpasswort wird **nur beim allerersten Start** gelesen. Danach kann die
  Datei gelöscht werden; ein Neustart ändert das Passwort nie.
- Für einen festen Speicherort auf dem NAS das Volume durch einen Pfad ersetzen
  (z. B. `/volume1/docker/mira/data:/data`) und `chown 1000:1000` auf den Ordner setzen.

### Hinter dem Reverse Proxy (HTTPS)

- Eigenen Hostnamen für MIRA verwenden (kein Unterpfad).
- `MIRA_TRUST_PROXY` auf die Adresse des Proxys setzen. Dann erkennt MIRA HTTPS
  (Cookie mit `Secure`) und die echte Client-IP (Login-Sperre, Audit-Log).

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MIRA_PORT` | `8080` | Port |
| `MIRA_DATA_DIR` | `/data` | Datenverzeichnis (Datenbank `mira.db`) |
| `MIRA_ADMIN_USER` / `MIRA_ADMIN_DISPLAY_NAME` | – | Erstes Konto (nur beim ersten Start) |
| `MIRA_ADMIN_PASSWORD_FILE` | – | Datei mit dem Startpasswort (mind. 12 Zeichen) |
| `MIRA_TRUST_PROXY` | `false` | `true` oder Adresse(n) des Reverse Proxys |
| `MIRA_COOKIE_SECURE` | `auto` | `auto`, `true`, `false` |
| `MIRA_SESSION_TTL_HOURS` | `168` | Gültigkeit einer Anmeldung ohne Nutzung |
| `MIRA_LOGIN_MAX_FAILURES` / `MIRA_LOGIN_WINDOW_MINUTES` | `5` / `15` | Login-Sperre |
| `MIRA_AUDIT_RETENTION_DAYS` | `365` | Aufbewahrung des Audit-Logs |
| `MIRA_LOG_LEVEL` | `info` | Protokollierungsstufe |

## Lizenz

Noch festzulegen.
