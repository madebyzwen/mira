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

## Projektstatus: Phase 1 – Weboberfläche

Phase 1 umfasst ausschließlich eine **klickbare Weboberfläche** auf Basis der
freigegebenen Mockups in `docs/mockups/`.

- Alle Ansichten zeigen **Beispieldaten**; es finden keine Netzwerkanfragen statt.
- Die Anmeldung ist eine **Demo-Anmeldung** ohne Authentifizierung.
- Produktive Aktionen (Server schlafen legen/neustarten, Dienste neu starten,
  Modell löschen, Download starten, Agent hinzufügen …) führen nichts aus und
  zeigen stattdessen einen Hinweis an.
- Es gibt noch kein Backend, keine SQLite-Datenbank und keine Anbindung an
  Odin, Docker, Wake-on-LAN oder den Shelly Plug.

## Architektur

MIRA ist als modularer Monolith geplant.

| Verzeichnis     | Inhalt                                                   |
| --------------- | -------------------------------------------------------- |
| `backend/`      | Kerndienste und Funktionsmodule (ab Phase 2)             |
| `frontend/`     | Weboberfläche (React, TypeScript, Vite)                  |
| `docs/mockups/` | Freigegebene UI-Entwürfe                                 |
| `deploy/`       | Deployment (Docker Compose für Asgard)                   |
| `tests/`        | Automatisierte Tests                                     |

Das Frontend kommuniziert später **ausschließlich mit dem MIRA-Backend**, nie
direkt mit Odin oder dem Shelly Plug.

### Aufbau des Frontends

```
frontend/src/
├── types/models.ts        Domänen-Typen (Server, LLM-Modelle, Shelly, …)
├── data/demoData.ts       ALLE Demo-Daten zentral an einer Stelle
├── services/dataService.ts  Einzige Datenschnittstelle der Oberfläche
├── lib/format.ts          Zahlen-/Datumsformatierung (de-DE)
├── components/
│   ├── layout/            App-Rahmen, Sidebar, Kopfzeile, Menüstruktur
│   ├── ui/                Karte, Pills, Fortschrittsbalken, Buttons, Dialog, Meldungen
│   ├── charts/            SVG-Diagramme (Zeitreihe, Sparkline)
│   ├── illustrations/     SVG-Grafiken (Server, Shelly Plug, Wellen)
│   └── brand/             MIRA-Logo
├── pages/                 Login, Dashboard, Systeme, Agents, LLM, Konfiguration
└── styles/                Designsystem: tokens.css (Farben, Abstände, Schrift) + Stylesheets
```

**Demo-Daten durch Backend-Daten ersetzen:** Seiten und Komponenten lesen
Daten nur über `services/dataService.ts`. Für das Backend werden dort die
Rückgaben der Demo-Daten durch API-Aufrufe an das MIRA-Backend ersetzt
(z. B. `GET /api/systems/odin`). Die Typen in `types/models.ts` beschreiben
dabei das erwartete Datenformat.

### Routen

| Pfad                         | Ansicht                                   |
| ---------------------------- | ----------------------------------------- |
| `/login`                     | Login (Demo)                              |
| `/dashboard`                 | Dashboard                                 |
| `/systeme/odin`              | Systeme › Odin                            |
| `/systeme/shelly-plug`       | Systeme › Shelly Plug                     |
| `/agents`                    | Agentenübersicht                          |
| `/llm`                       | Installierte LLMs und Download            |
| `/konfiguration`             | Konfiguration (Bereichsauswahl)           |
| `/konfiguration/systeme`     | Konfiguration der Systeme (ein Widget je System) |
| `/konfiguration/{dashboard,agents,llm,mira}` | Platzhalter je Bereich   |

## Lokale Entwicklung (macOS)

Voraussetzung: **Node.js ≥ 22.22** (z. B. aktuelles Node 22 LTS).

```bash
# Node.js installieren (falls noch nicht vorhanden)
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Abhängigkeiten installieren
cd frontend
npm ci

# Entwicklungsserver starten → http://localhost:5173
npm run dev
```

Weitere Befehle im Ordner `frontend/`:

| Befehl              | Zweck                                         |
| ------------------- | --------------------------------------------- |
| `npm run build`     | Typprüfung und Produktionsbuild nach `dist/`  |
| `npm run typecheck` | Nur TypeScript-Prüfung                        |
| `npm run preview`   | Produktionsbuild lokal ansehen                |

## Docker-Build

Das Image wird mehrstufig gebaut: Node baut die Oberfläche, ein
unprivilegierter nginx liefert die statischen Dateien auf **Port 8080** aus
(inkl. SPA-Fallback für React Router). Node.js muss dafür lokal nicht
installiert sein.

```bash
# Image bauen und starten
docker build -t mira-web:0.1.0 frontend
docker run -d --name mira-web -p 8080:8080 mira-web:0.1.0
# → http://localhost:8080
```

### Betrieb auf Asgard (Docker Compose)

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

Der Container läuft schreibgeschützt (`read_only`) ohne zusätzliche Rechte.
Port anpassen: in `deploy/docker-compose.yml` z. B. `"8090:8080"`.

## Lizenz

Noch festzulegen.
