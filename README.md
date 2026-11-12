# MIRA

**Management, Infrastructure, Resources & Automation**

MIRA ist eine modulare, selbst gehostete Plattform zur Überwachung, Verwaltung
und Automatisierung lokaler KI-Infrastruktur. MIRA läuft als Docker-Anwendung
auf einem **Homeserver** (NAS mit Docker) und verwaltet von dort einen **KI-Server**. Sein Anzeigename
ist frei wählbar (`MIRA_AI_SERVER_NAME`); ohne Angabe heißt er „KI-Server“.

## Geplante Funktionen

- Dashboard für Systemstatus und Schnellaktionen
- Überwachung und Energieverwaltung des KI-Servers
- Verbrauchsmessung per Shelly Plug
- Verwaltung von KI-Agenten (zurückgestellt)
- Bestand lokaler GGUF-Modelle und direkte Downloads
- Modulare Konfigurationsoberfläche
- Sicherer webbasierter Zugriff

## Projektstatus

| Stufe | Inhalt | Status |
| --- | --- | --- |
| 0 | Klickbare Weboberfläche nach Mockups | ✅ abgeschlossen |
| 1 | Fundament: Backend, SQLite, echte Anmeldung, ein Container | ✅ abgeschlossen |
| 2 | KI-Server lesen: Live-Daten über den MIRA-Agent | ✅ abgeschlossen |
| 3 | Messwert-Historie: echte Verlaufsdiagramme, tägliche Sicherung | ✅ abgeschlossen |
| 3a | Bereinigung: durchgängig „KI-Server“, Name konfigurierbar, Agent `mira-agent` | ✅ abgeschlossen |
| 4a | Shelly-Logger: eigener Container erfasst den Stromverbrauch (eigene Datenbank, Lese-API) | 🔍 umgesetzt, Inbetriebnahme ausstehend |
| 4b | Shelly in MIRA: Leistung, Verbrauch, Kosten und Verlauf aus dem Logger | 🔍 umgesetzt, Abnahme ausstehend |

Alle Stufen: [Roadmap](docs/entwicklung/roadmap.md). Echt sind die Anmeldung,
die Ansicht des KI-Servers (Live-Werte alle 2 s und Verlauf von Auslastung und Temperaturen über 1 h / 24 h / 7 / 30 Tage),
der Shelly Plug (Live-Leistung jede Sekunde, Verbrauch und Kosten für Tag/Woche/Monat/Jahr, Verlauf; Strompreis unter
Konfiguration › Systeme), die Kachel „Verbrauch“ im Dashboard sowie
die Update-Hinweise über die Glocke in der Kopfzeile (Konfiguration › MIRA); alle
übrigen Ansichten zeigen noch **Beispieldaten** und führen keine Aktionen aus.

## Dokumentation

Konzepte, Architekturentscheidungen und Entwicklungsstufen liegen unter
[`docs/`](docs/README.md):

- [Zielarchitektur](docs/architektur/zielarchitektur.md) · [Datenmodell](docs/architektur/datenmodell.md) · [MIRA-Agent](docs/architektur/agent.md) · [Sicherheit](docs/architektur/sicherheit.md) · [Shelly-Logger](shelly-logger/README.md)
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
| `agent/` | MIRA-Agent: läuft auf dem KI-Server, liefert Systemdaten an MIRA (nur lesend) |
| `shelly-logger/` | Shelly-Logger: eigener Container, erfasst den Stromverbrauch über den Shelly Plug (eigene Datenbank, interne Lese-API) |
| `deploy/` | Stacks für den Homeserver (Portainer) und Docker Compose für lokale Tests |
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
| `npm test` | Tests von Backend, Agent, Shelly-Logger und Weboberfläche (Vitest) |
| `npm run package:agent` | Installationspaket für den KI-Server bauen (`agent/release/`) |
| `npm run build:shelly-logger` | Shelly-Logger bauen; Image: `docker build -f shelly-logger/Dockerfile .` – Betrieb: [`shelly-logger/README.md`](shelly-logger/README.md) |
| `npm run typecheck` | TypeScript-Prüfung aller Pakete |
| `npm run check:naming` | Prüft, dass kein fester Name des KI-Servers eingebaut ist ([ADR 0009](docs/adr/0009-ki-server-als-rolle-agent-mira-agent.md)) |
| `npm run build` | Produktionsbuild von `shared`, `backend`, `frontend` |

## Betrieb auf dem Homeserver (Portainer)

MIRA läuft als ein Container (API und Oberfläche, im Stack auf **Port 80**) als
unprivilegierter Benutzer (UID 1000) mit schreibgeschütztem Dateisystem. Das
Image baut GitHub bei jedem Push automatisch (`ghcr.io/madebyzwen/mira`,
[ADR 0008](docs/adr/0008-images-ueber-github-container-registry.md)).

Netzwerk: MIRA erhält über ein vorhandenes **macvlan-Netz eine eigene IP im
Server-Netz** (`<MIRA_IP>`), in dem auch der KI-Server liegt – vor allem für die Verbindungen
von MIRA zum KI-Server. Aufgerufen wird MIRA über den Reverse Proxy (`https://<MIRA_HOSTNAME>`).
Mit HTTPS-Pflicht (`MIRA_PUBLIC_URL`, empfohlen) leitet `http://<MIRA_IP>` dorthin um.
Port 80 ist ohne Root-Rechte und ohne Capabilities möglich, weil der Stack ihn nur im
Netzwerk-Namensraum des Containers freigibt (`cap_drop: ALL`).

### 1. Ordner und Startpasswort anlegen (einmalig, per SSH)

```bash
APPDATA=<APPDATA_PFAD>/mira          # z. B. …/appdata/mira
mkdir -p "$APPDATA/data" "$APPDATA/secrets"
chmod 700 "$APPDATA/secrets"
read -rs -p "Startpasswort (mind. 12 Zeichen): " PW; echo
printf '%s\n' "$PW" > "$APPDATA/secrets/admin_password.txt"; unset PW
chmod 600 "$APPDATA/secrets/admin_password.txt"
```

Die Ordner müssen UID 1000 gehören (ggf. `sudo chown -R 1000 "$APPDATA"`).
Das Startpasswort wird **nur beim allerersten Start** gelesen; danach kann die
Datei gelöscht werden – ein Neustart ändert das Passwort nie. Geändert wird das Passwort
unter Konfiguration › MIRA › Konto (beendet alle Sitzungen).

Token für den Shelly-Logger (gleicher Inhalt wie `api_token.txt` im Logger-Stack, siehe
[Shelly-Logger](shelly-logger/README.md#3-homeserver-ordner-und-passwort-datei-per-ssh)):
`secrets/shelly_logger_token.txt`, Rechte 600.

### 2. Stack in Portainer anlegen

Stacks → Add stack → Name `mira` → Web editor: Inhalt von
[`deploy/portainer-stack.yml`](deploy/portainer-stack.yml) einfügen und unter
„Environment variables“ setzen:

| Variable | Beispiel | Bedeutung |
| --- | --- | --- |
| `MIRA_APPDATA` | `<APPDATA_PFAD>/mira` | Ordner aus Schritt 1 (Pflicht) |
| `MIRA_IP` | `<MIRA_IP>` | feste Adresse im Server-Netz (Pflicht) |
| `MIRA_NETWORK` | `macvlan_server` | Name des vorhandenen macvlan-Netzes |
| `MIRA_PROXY_NETWORK` | `npm-server_npm_backend` | Backend-Netz des Reverse Proxys |
| `MIRA_VERSION` | `0.3.1` | Image-Version (Standard `latest`) |
| `MIRA_PORT` | `80` | Port von MIRA (Standard 80) |
| `MIRA_TRUST_PROXY` | `<PROXY_IP>` | Adresse des Reverse Proxys im Proxy-Netz (oder ein kleines Netz) |
| `MIRA_PUBLIC_URL` | `https://<MIRA_HOSTNAME>` | HTTPS-Pflicht (empfohlen, erst setzen, wenn die Anmeldung über HTTPS funktioniert) |
| `MIRA_ADMIN_USER` / `MIRA_ADMIN_DISPLAY_NAME` | `sven` / `Sven` | erstes Konto |
| `MIRA_AI_SERVER_NAME` | `<NAME>` | Anzeigename des KI-Servers (optional, Standard „KI-Server“) |
| `MIRA_AI_SERVER_URL` / `MIRA_AI_SERVER_CERT_FINGERPRINT` | – | erst nach der Installation des Agents |
| `TZ` | `Europe/Berlin` | Zeitzone (Uhrzeit der Sicherung, Dateinamen) |

Danach „Deploy the stack“ → `https://<MIRA_HOSTNAME>` (Reverse Proxy).

### Update

`MIRA_VERSION` auf die neue Version setzen → „Update the stack“ mit
„Re-pull image“. Daten und Einstellungen bleiben in `MIRA_APPDATA` erhalten.

**Update auf 0.9.0** (HTTPS-Pflicht, Token für den Shelly-Logger, Passwort ändern): Reihenfolge,
Prüfungen und Rückweg in [Wartung W1](docs/entwicklung/security-hardening-review.md#deployment).

### Verbindung zum KI-Server (MIRA-Agent)

1. MIRA-Agent auf dem KI-Server installieren – Anleitung: [`agent/install/README.md`](agent/install/README.md),
   dabei `--allow <MIRA_IP>`. Das Skript gibt Adresse, Zertifikats-Fingerprint und Token aus.
2. Liegen MIRA und KI-Server im selben Netz, ist keine Firewall-Regel zwischen VLANs nötig;
   sonst `<MIRA_IP>` → `<KI_SERVER_IP>`, TCP 8443 freigeben.
3. Token auf dem Homeserver ablegen und im Stack `MIRA_AI_SERVER_URL` und
   `MIRA_AI_SERVER_CERT_FINGERPRINT` setzen, optional `MIRA_AI_SERVER_NAME`, dann „Update the stack“:

   ```bash
   read -rs -p "Token: " T; echo; printf '%s\n' "$T" > "$APPDATA/secrets/ai_server_token.txt"; unset T
   chmod 600 "$APPDATA/secrets/ai_server_token.txt"
   ```

Den Verbindungsstatus zeigt Konfiguration › Systeme.

**Umstieg von MIRA 0.6.x:** Ab MIRA 0.7.0 haben Variablen, Secret-Datei und Agent-Paket
neue Namen. Ablauf in [Stufe 3a, Umstellung im Betrieb](docs/entwicklung/stufe-03a-ki-server-bereinigung.md#paket-6--release-und-umstellung-im-betrieb).

### Sicherung und Wiederherstellung

MIRA sichert die Datenbank täglich um 03:30 Uhr (Ortszeit, `TZ`) im laufenden
Betrieb nach `MIRA_APPDATA/data/backups/mira-JJJJ-MM-TT.db` und behält die
letzten 7 Sicherungen. Jede Sicherung ist eine einzelne, vollständige
SQLite-Datei und wird vor dem Übernehmen geprüft (Integrität, Migrationsstand).
Schlägt die Sicherung fehl, bleiben vorhandene Sicherungen unverändert und die Glocke meldet
„Datensicherung fehlgeschlagen“, bis eine Sicherung wieder gelingt.

Die Sicherungen liegen auf demselben Speicher wie die Datenbank. Gegen einen Schaden am Speicher:

- **Getrenntes Ziel** (empfohlen): Ordner auf einem anderen Volume anlegen (UID 1000, `chmod 700`),
  im Stack als Volume `…:/backup-copy` einhängen (Zeile ist vorbereitet) und
  `MIRA_BACKUP_COPY_DIR=/backup-copy` setzen. Dorthin geht eine geprüfte Kopie jeder Sicherung.
- Zusätzlich den Ordner `backups/` in die Sicherung des Homeservers (Hyper Backup o. Ä.) aufnehmen.

Sicherungen enthalten den Passwort-Hash und die Session-Hashes – auch am Kopierziel nur für UID 1000 lesbar ablegen.

Wiederherstellen (per SSH auf dem Homeserver):

1. Stack in Portainer stoppen.
2. Im Ordner `MIRA_APPDATA/data` die aktuelle Datenbank beiseitelegen und die
   gewünschte Sicherung zurückkopieren:

   ```bash
   cd "$APPDATA/data"
   mkdir -p defekt && mv mira.db mira.db-wal mira.db-shm defekt/ 2>/dev/null
   cp backups/mira-JJJJ-MM-TT.db mira.db && chown 1000:1000 mira.db
   ```

3. Stack starten. Anmeldungen, Einstellungen und Verlauf entsprechen dem Stand der Sicherung.

### Lokal testen (aus dem Quellcode)

`deploy/docker-compose.yml` baut das Image lokal; Ordner `deploy/appdata/`
(wird nicht versioniert) wie in Schritt 1 anlegen, dann
`docker compose -f deploy/docker-compose.yml up -d --build`.

### Hinter dem Reverse Proxy (HTTPS)

- Eigenen Hostnamen für MIRA verwenden (kein Unterpfad).
- MIRA hängt zusätzlich im Backend-Netz des Proxys (`MIRA_PROXY_NETWORK`); Ziel im
  Nginx Proxy Manager: `http://mira:80` mit „Force SSL“. Die macvlan-Adresse ist für Container im
  Bridge-Netz (und für den Docker-Host) nicht erreichbar.
- `MIRA_TRUST_PROXY` auf die **Adresse des Proxys** setzen (mehrere Einträge durch Komma; IP oder
  Netz in CIDR-Schreibweise). Dann erkennt MIRA HTTPS und die echte Client-IP (Login-Sperre,
  Audit-Log). Weiterleitungs-Header von anderen Absendern werden ignoriert. Den Eintrag möglichst
  eng wählen: feste Adresse des Proxys oder ein eigenes kleines Netz nur für Proxy und MIRA;
  bei großen Netzen gibt MIRA beim Start einen Hinweis aus.
- `MIRA_PUBLIC_URL=https://<MIRA_HOSTNAME>` schaltet die **HTTPS-Pflicht** ein: Seitenaufrufe über
  HTTP werden umgeleitet, Anmeldungen und API-Anfragen nur über HTTPS angenommen, das Cookie
  ist immer `Secure`, dazu HSTS. Setzt `MIRA_TRUST_PROXY` voraus (sonst startet MIRA nicht).

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MIRA_PORT` | `8080` | Port im Container (Portainer-Stack: `80`) |
| `MIRA_DATA_DIR` | `/data` | Datenverzeichnis (Datenbank `mira.db`) |
| `MIRA_ADMIN_USER` / `MIRA_ADMIN_DISPLAY_NAME` | – | Erstes Konto (nur beim ersten Start) |
| `MIRA_ADMIN_PASSWORD_FILE` | – | Datei mit dem Startpasswort (mind. 12 Zeichen) |
| `MIRA_TRUST_PROXY` | `false` | Adresse(n)/Netz(e) des Reverse Proxys, kommagetrennt; `true` (jeder Absender) nur ohne `MIRA_PUBLIC_URL` |
| `MIRA_PUBLIC_URL` | – | HTTPS-Adresse über den Proxy (`https://host`); gesetzt = HTTPS-Pflicht |
| `MIRA_COOKIE_SECURE` | `auto` | `auto`, `true`, `false`; mit `MIRA_PUBLIC_URL` immer `true` |
| `MIRA_SESSION_TTL_HOURS` | `168` | Gültigkeit einer Anmeldung ohne Nutzung |
| `MIRA_LOGIN_MAX_FAILURES` / `MIRA_LOGIN_WINDOW_MINUTES` | `5` / `15` | Login-Sperre |
| `MIRA_AUDIT_RETENTION_DAYS` | `365` | Aufbewahrung des Audit-Logs |
| `MIRA_LOG_LEVEL` | `info` | Protokollierungsstufe |
| `MIRA_AI_SERVER_NAME` | – | Anzeigename des KI-Servers (1–32 Zeichen); ohne Angabe „KI-Server“ |
| `MIRA_AI_SERVER_URL` | – | Adresse des MIRA-Agents, z. B. `https://<KI_SERVER_IP>:8443` |
| `MIRA_AI_SERVER_CERT_FINGERPRINT` | – | SHA-256-Fingerprint des Agent-Zertifikats |
| `MIRA_AI_SERVER_TOKEN_FILE` | – | Datei mit dem Zugriffstoken |
| `MIRA_AI_SERVER_POLL_SECONDS` | `2` | Abfrageintervall des Agents (läuft im Backend, auch ohne geöffnete Weboberfläche) |
| `MIRA_AI_SERVER_OFFLINE_SECONDS` | `10` | Ohne Antwort seit so vielen Sekunden gilt der KI-Server als „offline“ |
| `MIRA_SHELLY_LOGGER_URL` | – (Stack: `http://172.31.250.10:8090`) | Lese-API des [Shelly-Loggers](shelly-logger/README.md) im internen Netz `mira-intern` |
| `MIRA_SHELLY_LOGGER_TOKEN_FILE` | – (Stack: `/secrets/shelly_logger_token.txt`) | Datei mit dem Token des Loggers (`LOGGER_API_TOKEN_FILE`); fehlt sie, fragt MIRA ohne Token |
| `MIRA_HISTORY_RAW_DAYS` | `7` | Aufbewahrung der Minutenwerte |
| `MIRA_HISTORY_HOURLY_DAYS` | `365` | Aufbewahrung der Stundenwerte |
| `MIRA_BACKUP_TIME` | `03:30` | Uhrzeit der täglichen Sicherung (Ortszeit, `HH:MM`) |
| `MIRA_BACKUP_KEEP` | `7` | Anzahl aufbewahrter Sicherungen |
| `MIRA_BACKUP_COPY_DIR` | – | optional: zweites, getrenntes Ziel für eine geprüfte Kopie jeder Sicherung |
| `MIRA_UPDATE_CHECK` | `true` | Prüfung auf neue Versionen von MIRA und MIRA-Agent bei GitHub (`false` = keine Verbindung ins Internet) |
| `MIRA_UPDATE_CHECK_TIME` | `04:00` | Uhrzeit der täglichen Update-Prüfung (zusätzlich einmal beim ersten Aufruf am Tag) |
| `TZ` | – (Stack: `Europe/Berlin`) | Zeitzone des Containers |

## Lizenz

Noch festzulegen.
