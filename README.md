# MIRA

**Management, Infrastructure, Resources & Automation**

MIRA ist eine modulare, selbst gehostete Plattform zur Überwachung, Verwaltung
und Automatisierung lokaler KI-Infrastruktur. MIRA läuft als Docker-Anwendung
auf dem NAS **Asgard** und verwaltet von dort den KI-Server **Odin**.

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
| 2 | Odin-API: Live-Daten von Odin in der Odin-Ansicht | ✅ abgeschlossen |
| 3 | Messwert-Historie: echte Verlaufsdiagramme, tägliche Sicherung | ✅ abgeschlossen |
| 4 | Shelly Plug: Stromverbrauch, Verlauf und Kosten | ⏳ als Nächstes |

Alle Stufen: [Roadmap](docs/entwicklung/roadmap.md). Echt sind die Anmeldung und
die Odin-Ansicht (Live-Werte alle 2 s und Verlauf von Auslastung und Temperaturen über 1 h / 24 h / 7 / 30 Tage); alle
übrigen Ansichten zeigen noch **Beispieldaten** und führen keine Aktionen aus.

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
| `odin-api/` | Odin-API: läuft auf Odin, liefert Systemdaten an MIRA (nur lesend) |
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
| `npm test` | Tests von Backend und Odin-API (Vitest) |
| `npm run package:odin-api` | Installationspaket für Odin bauen (`odin-api/release/`) |
| `npm run typecheck` | TypeScript-Prüfung aller Pakete |
| `npm run build` | Produktionsbuild von `shared`, `backend`, `frontend` |

## Betrieb auf Asgard (Portainer)

MIRA läuft als ein Container (API und Oberfläche, im Stack auf **Port 80**) als
unprivilegierter Benutzer (UID 1000) mit schreibgeschütztem Dateisystem. Das
Image baut GitHub bei jedem Push automatisch (`ghcr.io/madebyzwen/mira`,
[ADR 0008](docs/adr/0008-images-ueber-github-container-registry.md)).

Netzwerk: MIRA erhält über ein vorhandenes **macvlan-Netz eine eigene IP im
Server-Netz** (`<MIRA_IP>`), in dem auch Odin liegt. Aufgerufen wird MIRA über
den Reverse Proxy (`https://<MIRA_HOSTNAME>` → `http://<MIRA_IP>`); direkt im
Server-Netz unter `http://<MIRA_IP>`. Port 80 ist ohne Root-Rechte möglich, weil
der Stack ihn nur im Netzwerk-Namensraum des Containers freigibt.

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
Datei gelöscht werden – ein Neustart ändert das Passwort nie.

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
| `MIRA_TRUST_PROXY` | `<PROXY_SUBNETZ>` | Subnetz des Proxy-Netzes, z. B. `172.20.0.0/16` |
| `MIRA_ADMIN_USER` / `MIRA_ADMIN_DISPLAY_NAME` | `sven` / `Sven` | erstes Konto |
| `MIRA_ODIN_API_URL` / `MIRA_ODIN_CERT_FINGERPRINT` | – | erst nach der Odin-Installation |
| `TZ` | `Europe/Berlin` | Zeitzone (Uhrzeit der Sicherung, Dateinamen) |

Danach „Deploy the stack“ → `http://<MIRA_IP>` bzw. über den Reverse Proxy.

### Update

`MIRA_VERSION` auf die neue Version setzen → „Update the stack“ mit
„Re-pull image“. Daten und Einstellungen bleiben in `MIRA_APPDATA` erhalten.

### Verbindung zu Odin (Odin-API)

1. Odin-API auf Odin installieren – Anleitung: [`odin-api/install/README.md`](odin-api/install/README.md),
   dabei `--allow <MIRA_IP>`. Das Skript gibt Adresse, Zertifikats-Fingerprint und Token aus.
2. Liegen MIRA und Odin im selben Netz, ist keine Firewall-Regel zwischen VLANs nötig;
   sonst `<MIRA_IP>` → `<ODIN_IP>`, TCP 8443 freigeben.
3. Token auf Asgard ablegen und im Stack `MIRA_ODIN_API_URL` und
   `MIRA_ODIN_CERT_FINGERPRINT` setzen, dann „Update the stack“:

   ```bash
   read -rs -p "Token: " T; echo; printf '%s\n' "$T" > "$APPDATA/secrets/odin_api_token.txt"; unset T
   chmod 600 "$APPDATA/secrets/odin_api_token.txt"
   ```

Den Verbindungsstatus zeigt Konfiguration › Systeme.

### Sicherung und Wiederherstellung

MIRA sichert die Datenbank täglich um 03:30 Uhr (Ortszeit, `TZ`) im laufenden
Betrieb nach `MIRA_APPDATA/data/backups/mira-JJJJ-MM-TT.db` und behält die
letzten 7 Sicherungen. Jede Sicherung ist eine einzelne, vollständige
SQLite-Datei. Für zusätzliche Sicherheit den Ordner `backups/` in die
Sicherung von Asgard (Hyper Backup o. Ä.) aufnehmen.

Wiederherstellen (per SSH auf Asgard):

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
  Nginx Proxy Manager: `http://mira:80`. Die macvlan-Adresse ist für Container im
  Bridge-Netz (und für den Docker-Host) nicht erreichbar.
- `MIRA_TRUST_PROXY` auf das **Subnetz** des Proxy-Netzes setzen (die Adresse des
  Proxys darin kann wechseln; mehrere Einträge durch Komma). Dann erkennt MIRA HTTPS
  (Cookie mit `Secure`) und die echte Client-IP (Login-Sperre, Audit-Log).
  Weiterleitungs-Header von anderen Absendern werden ignoriert.

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MIRA_PORT` | `8080` | Port im Container (Portainer-Stack: `80`) |
| `MIRA_DATA_DIR` | `/data` | Datenverzeichnis (Datenbank `mira.db`) |
| `MIRA_ADMIN_USER` / `MIRA_ADMIN_DISPLAY_NAME` | – | Erstes Konto (nur beim ersten Start) |
| `MIRA_ADMIN_PASSWORD_FILE` | – | Datei mit dem Startpasswort (mind. 12 Zeichen) |
| `MIRA_TRUST_PROXY` | `false` | `true` oder Adresse(n) des Reverse Proxys |
| `MIRA_COOKIE_SECURE` | `auto` | `auto`, `true`, `false` |
| `MIRA_SESSION_TTL_HOURS` | `168` | Gültigkeit einer Anmeldung ohne Nutzung |
| `MIRA_LOGIN_MAX_FAILURES` / `MIRA_LOGIN_WINDOW_MINUTES` | `5` / `15` | Login-Sperre |
| `MIRA_AUDIT_RETENTION_DAYS` | `365` | Aufbewahrung des Audit-Logs |
| `MIRA_LOG_LEVEL` | `info` | Protokollierungsstufe |
| `MIRA_ODIN_API_URL` | – | Adresse der Odin-API, z. B. `https://<ODIN_IP>:8443` |
| `MIRA_ODIN_CERT_FINGERPRINT` | – | SHA-256-Fingerprint des Odin-Zertifikats |
| `MIRA_ODIN_TOKEN_FILE` | – | Datei mit dem Zugriffstoken |
| `MIRA_ODIN_POLL_SECONDS` | `2` | Abfrageintervall der Odin-API (läuft im Backend, auch ohne geöffnete Weboberfläche) |
| `MIRA_ODIN_OFFLINE_SECONDS` | `10` | Ohne Antwort seit so vielen Sekunden gilt Odin als „offline“ |
| `MIRA_HISTORY_RAW_DAYS` | `7` | Aufbewahrung der Minutenwerte |
| `MIRA_HISTORY_HOURLY_DAYS` | `365` | Aufbewahrung der Stundenwerte |
| `MIRA_BACKUP_TIME` | `03:30` | Uhrzeit der täglichen Sicherung (Ortszeit, `HH:MM`) |
| `MIRA_BACKUP_KEEP` | `7` | Anzahl aufbewahrter Sicherungen |
| `TZ` | – (Stack: `Europe/Berlin`) | Zeitzone des Containers |

## Lizenz

Noch festzulegen.
