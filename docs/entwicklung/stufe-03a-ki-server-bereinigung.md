# Stufe 3a – KI-Server statt Odin (Bereinigung)

- Status: ✅ abgeschlossen (abgenommen 2026-11-10, MIRA 0.7.0 / Agent 0.2.0, PR #1)
- Muss abgeschlossen sein **vor** [Stufe 4](stufe-04-shelly.md)
- Zielversionen: MIRA **0.7.0**, Agent **0.2.0** (bisher Odin-API 0.1.4)

## Ziel

MIRA spricht durchgehend vom **KI-Server**. „Odin“ ist nur noch ein **optionaler,
konfigurierbarer Name** dieses KI-Servers – er steht nirgends fest im Code, in
Paketnamen, Pfaden, Diensten, Variablen oder Update-Hinweisen.

Auslöser: Der Update-Hinweis lautet heute „Odin-API 0.1.5 verfügbar · Update auf
Odin …“ – gemeint ist aber ein Update der Software **auf dem KI-Server**.

Zwischenzeitliche Ausfälle der Verbindung MIRA ↔ KI-Server während der Umstellung
sind ausdrücklich in Ordnung.

## Begriffe

| Begriff | Bedeutung | Beispiel |
| --- | --- | --- |
| **KI-Server** | die **Rolle** des Rechners, den MIRA verwaltet | „Update für den KI-Server“ |
| **Name** | optionaler Anzeigename, frei konfigurierbar | `Odin` |
| **MIRA-Agent** (kurz Agent) | die Software, die auf dem KI-Server läuft und MIRA Daten liefert (bisher „Odin-API“) | Paket `mira-agent-0.2.0.tar.gz` |

### Wann Rolle, wann Name?

| Stelle | Text | ohne Name | mit Name `Odin` |
| --- | --- | --- | --- |
| Navigation, Seitentitel, Breadcrumb, Dashboard-Kachel | **Name**, sonst „KI-Server“ | KI-Server | Odin (Untertitel „KI-Server“) |
| Schnellaktionen, Bildbeschreibungen | **Name**, sonst „KI-Server“ | „KI-Server schlafen legen“ | „Odin schlafen legen“ |
| Update-Hinweise, Konfiguration, Fehlermeldungen, Hilfetexte | immer **Rolle** | „Update für den KI-Server: MIRA-Agent 0.2.0“ | gleich |
| Doku, Kommentare, Logs | immer **Rolle** | „KI-Server nicht erreichbar“ | gleich |

## Festlegungen (Vorschlag)

### Bezeichner

| Ebene | bisher | neu |
| --- | --- | --- |
| Code (TypeScript) | `OdinClient`, `OdinMonitor`, `config.odin`, `OdinStatusResponse`, `OdinHealth`, `ODIN_API_VERSION` | `AgentClient`, `AiServerMonitor`, `config.aiServer`, `AiServerStatusResponse`, `AgentHealth`, `AGENT_API_VERSION` |
| Datenbank `systems.slug` | `odin` | `ai-server` |
| REST-API von MIRA | `/api/v1/systems/odin`, `…/odin/history` | `/api/v1/systems/ai-server`, `…/ai-server/history` |
| Route im Frontend | `/systeme/odin` | `/systeme/ki-server` |
| Workspace / npm-Paket | `odin-api/`, `@mira/odin-api` | `agent/`, `@mira/agent` |
| Release-Paket | `mira-odin-api-X.Y.Z.tar.gz` | `mira-agent-X.Y.Z.tar.gz` |
| Programmdatei | `odin-api.mjs` | `mira-agent.mjs` |
| Pfade auf dem KI-Server | `/opt/mira-odin-api`, `/etc/mira-odin-api` | `/opt/mira-agent`, `/etc/mira-agent` |
| systemd-Dienste | `mira-odin-api`, `mira-odin-api-firewall` | `mira-agent`, `mira-agent-firewall` |
| nftables-Tabelle | `inet mira_odin_api` | `inet mira_agent` |
| Zertifikat | `CN=mira-odin-api` | `CN=mira-agent` |
| Update-Komponente | `odin-api`, Schlüssel `update:odin-api` | `agent`, Schlüssel `update:agent` |
| Testumgebung | `odin-api/dev/odin-sim`, Container `odin-sim` | `agent/dev/ai-server-sim`, Container `ai-server-sim` |
| Gerätefoto | `assets/devices/odin.*` | `assets/devices/ki-server.*` |

Unverändert bleiben der Systembenutzer `mira-agent`, der Port 8443 und die
Endpunkte des Agents (`/v1/health`, `/v1/system/info`, `/v1/system/metrics`) samt
Feldern. Dadurch versteht MIRA 0.7.0 auch noch den alten Agent 0.1.4.
Die Versionsnummer des Agents wird fortgesetzt (0.1.4 → 0.2.0), damit der
Update-Vergleich und die Regel „meldet keine Version ⇒ höchstens 0.1.3“ gültig bleiben.

### Konfiguration in MIRA (Umgebungsvariablen)

| bisher | neu | Hinweis |
| --- | --- | --- |
| – | `MIRA_AI_SERVER_NAME` | **neu**, optional, 1–32 Zeichen. Fehlt sie, heißt der KI-Server „KI-Server“. |
| `MIRA_ODIN_API_URL` | `MIRA_AI_SERVER_URL` | z. B. `https://<KI_SERVER_IP>:8443` |
| `MIRA_ODIN_CERT_FINGERPRINT` | `MIRA_AI_SERVER_CERT_FINGERPRINT` | |
| `MIRA_ODIN_TOKEN_FILE` | `MIRA_AI_SERVER_TOKEN_FILE` | Secret-Datei `secrets/ai_server_token.txt` statt `odin_api_token.txt` |
| `MIRA_ODIN_POLL_SECONDS` | `MIRA_AI_SERVER_POLL_SECONDS` | |
| `MIRA_ODIN_OFFLINE_SECONDS` | `MIRA_AI_SERVER_OFFLINE_SECONDS` | |

- Die Umstellung ist hart: Die alten Namen werden **nicht** weiter gelesen. Fehlen
  die neuen Variablen, zeigt MIRA wie heute „Verbindung ist nicht eingerichtet“.
- Der Name wird beim Start in `systems.name` geschrieben. Die Oberfläche bekommt
  ihn von dort über `/api/v1/systems`, und das Backend nutzt ihn für Logs.
- Später kann der Name in „Konfiguration › Systeme“ bearbeitbar werden. Das ist
  nicht Teil dieser Stufe.

### Update-Hinweis (Ziel)

```
Titel:     Update für den KI-Server: MIRA-Agent 0.2.0
Text:      Installiert: 0.1.4 · veröffentlicht am 12.11.2026.
           Update auf dem KI-Server: Paket laden, Prüfsumme prüfen, sudo ./install.sh –
           Konfiguration, Zertifikat und Token bleiben erhalten.
Links:     Release · Anleitung (agent/install/README.md)
```

In „Konfiguration › MIRA › Updates“ heißt die Komponente „KI-Server (MIRA-Agent)“.
Ist der installierte Stand unbekannt, steht dort „unbekannt – KI-Server noch nicht erreicht“.

## Umsetzung in Arbeitspaketen

Jedes Paket ist ein eigener Commit mit grünen Tests. Ausgeliefert wird erst
nach Paket 5, gemeinsam als **ein Release v0.7.0** mit MIRA und dem Agent-Paket.

### Paket 1 – Verträge und Backend

- `shared/src/odin.ts` → `shared/src/agent.ts`; Typen umbenennen (siehe oben).
- Die Update-Komponente `odin-api` wird zu `agent` (`UPDATE_COMPONENTS`).
- `backend/core/config.ts`: neue Variablen einschließlich `MIRA_AI_SERVER_NAME`.
- `backend/modules/systems/`: `agentClient.ts` und `aiServerMonitor.ts` mit neuen
  Routen. Logs und Fehlertexte sprechen vom KI-Server.
- **Migration `systems` 3**: `UPDATE systems SET slug = 'ai-server' WHERE slug = 'odin'`.
  Die `system_id` bleibt gleich, die gesamte Historie bleibt also erhalten.
  Migration 1 bleibt unverändert, weil sie auf bestehenden Installationen schon gelaufen ist.
- Beim Start wird `systems.name` aus `MIRA_AI_SERVER_NAME` gesetzt, ohne Wert auf „KI-Server“.
- Update-Prüfung (`backend/core/updates/`):
  - Paket-Erkennung nur noch `^mira-agent-(\d+\.\d+\.\d+)\.tar\.gz$`
  - Felder heißen `agentVersion` und `agent`, die Methode `reportAgentVersion`
  - Texte wie oben, Anleitung unter `agent/install/README.md`
- **Core-Migration**: Sie löscht die Benachrichtigung `update:odin-api` und den
  gespeicherten Prüfstand `core/update_check`. Die nächste Prüfung und die nächste
  Abfrage des Agents füllen beides neu.
- Tests anpassen, vor allem `systems`, `updates`, `config` und `contracts`. Neu dazu
  kommen ein Test der Migration (bestehende DB mit Slug `odin` → `ai-server`, Historie
  erhalten) und ein Test der Namensregel (mit und ohne `MIRA_AI_SERVER_NAME`).

### Paket 2 – Frontend

- Route `/systeme/ki-server`. `/systeme/odin` leitet weiter, damit alte Lesezeichen
  funktionieren. Die Weiterleitung wird mit Paket 7 entfernt.
- Aus `OdinPage` wird `AiServerPage`. Aus `demoOdin*` und `getOdin*` werden `demoAiServer*` bzw. `getAiServer*`.
- Das Navigationslabel für den KI-Server kommt aus `/api/v1/systems`, statt fest
  `'Odin'` in `demoData.ts`.
- Alle festen Texte folgen der Regel Rolle/Name, nämlich in Dashboard
  (Kachel, Schnellaktionen), LLM-Seite („auf dem KI-Server“), Konfiguration MIRA und
  Systeme (Variablennamen, „Agent-Adresse“ statt „Odin-API“), `systemsService`
  (Fehlertexte), `ServerTower` (`aria-label`) und Shelly-Demo („Strommessung für den KI-Server“).

### Paket 3 – Agent (bisher Odin-API)

- `git mv odin-api agent`, danach Paketname, Build (`mira-agent.mjs`,
  `__AGENT_VERSION__`), `package.sh` und alle Pfade, Dienste und Texte umstellen.
- Bei der Gelegenheit verschwindet auch **„Asgard“** aus dem Agent: In `install.sh`
  steht künftig `--allow <MIRA_IP>`, und die Firewall-Unit heißt „nur MIRA“.
- **`install.sh` mit Übernahme einer Altinstallation.** Ist `/etc/mira-odin-api/config.json`
  vorhanden und `/etc/mira-agent` noch nicht, läuft Folgendes ab:
  1. `listen`, `port` und `allowedClients` aus der alten Konfiguration übernehmen,
     den Token-Hash nach `/etc/mira-agent/token.sha256` kopieren. **Das Token bleibt gleich.**
  2. Ein **neues Zertifikat** mit `CN=mira-agent` erzeugen. Das Skript gibt den neuen
     Fingerprint aus (Entscheidung E2).
  3. Den neuen Dienst wie bisher mit `--check` prüfen.
  4. Erst dann die alten Dienste `mira-odin-api` und `mira-odin-api-firewall` stoppen
     und deaktivieren, ihre Unit-Dateien und die Tabelle `inet mira_odin_api` löschen,
     danach `/opt/mira-odin-api` und `/etc/mira-odin-api` entfernen.
  5. Neue Firewall und neuen Dienst starten.
  Schlägt Schritt 3 fehl, bleibt die Altinstallation unangetastet und läuft weiter.
- `uninstall.sh` entfernt auch Reste einer Altinstallation.
- Die alten Namen stehen nur noch in diesem klar markierten Übernahmeblock. Er wird
  mit Paket 7 entfernt.
- Tests in `agent/test/`. In `ai-server-sim` wird die Übernahme ausprobiert: Agent
  0.1.4 aus dem GitHub-Release installieren, dann das neue Paket installieren. Danach
  muss die API mit demselben Token und neuem Fingerprint antworten, und von den alten
  Diensten, Pfaden und nft-Tabellen darf nichts übrig sein.

### Paket 4 – Build, CI, Deployment

- Im Root-`package.json` werden Workspace `agent` und die Skripte zu `build:agent` bzw. `package:agent`.
- Angepasst werden außerdem `Dockerfile`, `.dockerignore`, `.gitignore` und
  `backend/package.json` (Abhängigkeit `@mira/agent`).
- In `.github/workflows/ci.yml` hängen die Release-Assets jetzt unter `agent/release/*.tar.gz` und `.sha256`.
- `deploy/docker-compose.yml` und `deploy/portainer-stack.yml` bekommen die neuen
  Variablen, `MIRA_AI_SERVER_NAME` und das Secret `ai_server_token.txt`.

### Paket 5 – Dokumentation

- `README.md` bekommt eine neue Variablentabelle und den Abschnitt „Verbindung zum
  KI-Server“. Odin erscheint dort höchstens als Beispiel für `MIRA_AI_SERVER_NAME`.
- `docs/architektur/odin-api.md` → `docs/architektur/agent.md`. Datenmodell,
  Zielarchitektur und Sicherheit sprechen vom KI-Server.
- Roadmap, Stufe 4 und die folgenden Stufen sowie die Aufgaben A-001 (wird zu
  „Update des Agents automatisieren“) und A-004 werden angepasst.
- **Neue ADR 0009** „KI-Server als Rolle, Name konfigurierbar, Agent `mira-agent`“.
  ADR 0005 bekommt einen Nachtrag mit Verweis darauf.
- **Historisch und unverändert** bleiben die ADRs 0001–0008, `docs/vorgaben/*`, die
  Mockups und die abgeschlossenen Stufen 0–3. Die Stufen bekommen oben einen Hinweis:
  „Odin/Odin-API heißen seit Stufe 3a KI-Server/MIRA-Agent“ (Entscheidung E4).
- **Schutz vor Rückfall**: Ein kleines Prüfskript in der CI, z. B. `scripts/check-naming.sh`,
  sucht mit `git grep -i odin`. Treffer außerhalb einer festen Ausnahmeliste
  (historische Doku, Migrationen, Übernahmeblock) lassen den Build scheitern.

### Paket 6 – Release und Umstellung im Betrieb

Reihenfolge so gewählt, dass der Portainer-Stack **nur einmal** angefasst wird.
Zwischen Schritt 2 und 4 zeigt MIRA den KI-Server als „offline“, weil der
Fingerprint nicht mehr passt. Das ist erwartet.

1. Tag `v0.7.0` erzeugen. Das Release enthält das MIRA-Image und `mira-agent-0.2.0.tar.gz`
   samt `.sha256`. Das alte MIRA 0.6.1 meldet über die Glocke „MIRA 0.7.0 verfügbar“.
   Ein Hinweis auf ein Agent-Update fehlt dort, weil 0.6.1 das neue Paket nicht kennt.
2. **Auf dem KI-Server**:
   ```bash
   VERSION=0.2.0; BASE=https://github.com/madebyzwen/mira/releases/download/v0.7.0
   curl -fLO "$BASE/mira-agent-$VERSION.tar.gz" -fLO "$BASE/mira-agent-$VERSION.tar.gz.sha256"
   sha256sum -c "mira-agent-$VERSION.tar.gz.sha256"
   tar xzf "mira-agent-$VERSION.tar.gz" && cd "mira-agent-$VERSION"
   sudo ./install.sh          # erkennt die Odin-API-Installation und übernimmt sie
   ```
   Den ausgegebenen **neuen Fingerprint** notieren.
3. **Auf Asgard**: Die Secret-Datei umbenennen:
   `mv "$APPDATA/secrets/odin_api_token.txt" "$APPDATA/secrets/ai_server_token.txt"`
4. **Portainer**: Den Stack aus `deploy/portainer-stack.yml` (0.7.0) übernehmen. Die
   Variablen werden umbenannt, die URL bleibt gleich. `MIRA_AI_SERVER_CERT_FINGERPRINT`
   bekommt den neuen Wert, `MIRA_AI_SERVER_NAME=Odin` wird gesetzt, dann „Update the stack“.
5. Prüfen, siehe Abnahme.

**Zurück im Notfall:** MIRA-Image 0.6.1 und den alten Stack wieder einsetzen, auf dem
KI-Server `uninstall.sh --purge` ausführen und die Odin-API 0.1.4 neu installieren.
Dabei entstehen ein neues Token und ein neuer Fingerprint, die Messwert-Historie bleibt
erhalten. Vor Schritt 4 wird wie gewohnt die nächtliche Sicherung abgewartet oder eine
Sicherung von Hand erstellt.

### Paket 7 – Aufräumen (später, eigene Aufgabe)

Mit der nächsten Version nach erfolgreicher Umstellung, also MIRA 0.8.0 und Agent 0.3.0:
den Übernahmeblock aus `install.sh` und `uninstall.sh` sowie die Weiterleitung
`/systeme/odin` entfernen und die Ausnahmeliste des Prüfskripts verkleinern.
Dafür wird eine eigene Aufgabe in `docs/aufgaben/` angelegt.

## Abnahme

- [x] Ohne `MIRA_AI_SERVER_NAME` steht in der gesamten Oberfläche „KI-Server“, nirgends „Odin“.
- [x] Mit `MIRA_AI_SERVER_NAME=Odin` heißen Navigation, Seitentitel und Dashboard-Kachel „Odin“.
      Update-Hinweise und Konfiguration sprechen weiter vom KI-Server.
- [x] Der Update-Hinweis lautet „Update für den KI-Server: MIRA-Agent X.Y.Z“, mit Anleitung unter `agent/install/README.md`.
- [x] Das Release v0.7.0 enthält kein Asset mit „odin“ im Namen.
- [x] Auf dem KI-Server gibt es keine Dienste, Pfade oder nft-Tabellen mit „odin“ mehr. `systemctl status mira-agent` ist aktiv.
- [x] Die Messwert-Historie läuft lückenlos weiter. Die einzige Lücke ist das Umstellungsfenster.
- [x] `git grep -i odin` trifft nur noch Stellen auf der Ausnahmeliste, und die CI-Prüfung läuft.
- [x] Die Übernahme 0.1.4 → 0.2.0 wurde in `ai-server-sim` getestet (2026-11-10, siehe Umsetzung).

## Entscheidungen (getroffen 2026-11-10, wie vorgeschlagen)

| Nr. | Frage | Entscheidung |
| --- | --- | --- |
| E1 | Name der Software auf dem KI-Server | **`mira-agent`** – kurz, rollenneutral, deckt sich mit dem bestehenden Systembenutzer. Alternative: `mira-ki-server-agent`. |
| E2 | Zertifikat bei der Übernahme erneuern (`CN=mira-agent`) oder das alte (`CN=mira-odin-api`) behalten? | **erneuern** – der Stack wird ohnehin geändert, damit entfällt der letzte „odin“-Rest auf dem KI-Server |
| E3 | Wo wird der Name gepflegt? | **jetzt** über `MIRA_AI_SERVER_NAME`, **später** bearbeitbar in „Konfiguration › Systeme“ |
| E4 | Historische Doku (ADRs 0001–0008, Vorgaben, Stufen 0–3) umschreiben? | **nein**, nur einen Hinweis ergänzen. Sie dokumentiert, was damals galt. |
| E5 | Bezeichnung ohne konfigurierten Namen | **„KI-Server“** |

## Umsetzung (2026-11-10)

Pakete 1–5 sind umgesetzt (Branch `refactor/ki-server-statt-odin`, je Paket ein Commit).

| Was | Wo |
| --- | --- |
| Verträge (`AgentHealth`, `AiServerStatusResponse`, `AI_SERVER_SLUG`, Komponente `agent`) | `shared/src/agent.ts`, `shared/src/systems.ts`, `shared/src/notifications.ts` |
| Konfiguration `MIRA_AI_SERVER_*` | `backend/core/config.ts` |
| Client, Monitor, Routen, Name beim Start | `backend/modules/systems/` |
| Migrationen (systems 3, core 3) | `backend/modules/systems/migrations.ts`, `backend/core/db/coreMigrations.ts` |
| Update-Prüfung (Paket `mira-agent-*`, Texte) | `backend/core/updates/` |
| Name in der Oberfläche (`useAiServerName`) | `frontend/src/components/layout/Systems.tsx` |
| Agent, Installer mit Übernahme | `agent/`, `agent/install/install.sh` |
| Prüfung gegen den früheren Namen | `scripts/check-naming.sh` (CI) |

Geprüft:

- Typecheck, Tests (Backend 87, Agent 27), Produktions-Build und Docker-Image.
- Migrationstest: Datenbank im Stand 0.6.x → Slug `ai-server`, gleiche `system_id`,
  Verlauf erhalten, alte Update-Meldung und alter Prüfstand verworfen.
- Image mit `MIRA_AI_SERVER_NAME=Odin`: `/api/v1/systems` liefert den Namen, Komponente `agent`.
- `ai-server-sim`: Altinstallation aus dem Release v0.6.1 → Übernahme mit 0.2.0: Token
  funktioniert weiter, Fingerprint neu (`CN=mira-agent`), eigene Einstellungen der
  Konfiguration übernommen, keine Dienste, Pfade oder nftables-Tabellen der Altinstallation
  mehr. Fehlerfall (ungültige Konfiguration): Altinstallation läuft unverändert weiter.
  Zweiter Lauf ändert nichts; Neuinstallation und `uninstall.sh --purge` funktionieren.

Paket 6 (2026-11-10): Release v0.7.0 veröffentlicht. Die Umstellung wurde vorher lokal
vollständig geprobt: MIRA 0.6.1 mit Odin-API 0.1.4 → Agent 0.2.0, Secret umbenannt, MIRA 0.7.0
mit und ohne `MIRA_AI_SERVER_NAME`. Die Oberfläche wurde dabei geprüft, der Verlauf blieb erhalten.
Danach folgte die Umstellung im Betrieb auf dem KI-Server und auf Asgard; sie läuft.

Paket 7 folgt als [A-006](../aufgaben/a-006-uebergang-ki-server-aufraeumen.md).
