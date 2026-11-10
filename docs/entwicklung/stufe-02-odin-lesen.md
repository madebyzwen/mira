# Stufe 2 – Odin lesen

- Status: ✅ abgeschlossen (abgenommen 2026-11-06, MIRA 0.3.2 / Odin-API 0.1.2)
- Grundlage: [Odin-API](../architektur/agent.md), [ADR 0005](../adr/0005-odin-http-api-statt-ssh.md)

> **Hinweis (2026-11-10):** Historisches Dokument – es beschreibt den damaligen Stand. Seit
> [Stufe 3a](stufe-03a-ki-server-bereinigung.md) heißt der Rechner allgemein **KI-Server**
> (Name konfigurierbar) und die Software darauf **MIRA-Agent** ([ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md)).

## Ziel

MIRA liest den Zustand von Odin sicher über die Odin-API und zeigt ihn in der
Odin-Ansicht live an. **Nur lesend** – keine Aktionen, keine Rechte über den
eigenen Dienstbenutzer hinaus.

## Umfang

### 1. Odin-API (`odin-api/`, neuer Workspace)

- Fastify über **HTTPS**, Authentifizierung per Bearer-Token (auf Odin nur der Hash, Vergleich in konstanter Zeit).
- Endpunkte: `GET /v1/health`, `GET /v1/system/info`, `GET /v1/system/metrics`; Verträge in `shared/`.
- Datenquellen ausschließlich lesend aus `/proc`, `/sys` und `statfs`:
  CPU-Auslastung, RAM, Last, Uptime, OS/Kernel, CPU-Modell, GPU-Auslastung und
  VRAM (amdgpu über sysfs), Temperaturen (hwmon), konfigurierte Datenträger,
  NAS-Mounts, Netzwerkschnittstellen.
- Konfiguration in `/etc/mira-odin-api/config.json` (Adresse, Port, Pfade, anzuzeigende Mounts).
- Felder, die es nicht gibt (z. B. GPU im Test-Container), werden als `null` geliefert statt zu raten.

### 2. Installation auf Odin (vom Betreiber ausgeführt)

- Installationsskript und Anleitung unter `odin-api/install/`:
  - Benutzer `mira-agent` (ohne Login-Shell), Verzeichnisse, Programmdateien root-eigen.
  - Erzeugt Zertifikat (selbst signiert) und Token; gibt Fingerprint und Token **einmalig** für Asgard aus.
  - systemd-Unit mit Härtung (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, …).
  - Firewall-Regel: API-Port nur von `<ASGARD_IP>`.
- Deinstallationsskript, das alles wieder entfernt.
- In dieser Stufe **keine** sudo-Regeln.

### 3. MIRA-Backend: erstes Fachmodul `systems`

- Migrationen: `systems`, `server_connections`, `system_state`.
- Odin-Client mit **Zertifikats-Pinning** (Fingerprint) und Token aus Secret-Datei.
- Abfrage im festen Intervall (Vorschlag 10 s); Zustand `online`/`offline`/`unknown` mit „zuletzt gesehen“.
- API: `GET /api/v1/systems`, `GET /api/v1/systems/odin` (Info, letzte Messwerte, Zustand).
- Verbindungsdaten zunächst per Umgebungsvariablen/Secret-Dateien
  (`MIRA_ODIN_API_URL`, `MIRA_ODIN_CERT_FINGERPRINT`, `MIRA_ODIN_TOKEN_FILE`).

### 4. Oberfläche

- Odin-Ansicht mit echten Werten: Kopfbereich, Hardware, Auslastungskarten,
  Datenträger, NAS, Netzwerk, Temperaturen. Das Verlaufsdiagramm bleibt bis
  Stufe 3 bei Demo-Daten und wird als solches gekennzeichnet.
- Zustand „Offline“ sauber darstellen (Pill, zuletzt gesehen, keine Fehlermeldungen).
- Status-Punkt von Odin im Menü aus echten Daten.
- Konfiguration › Systeme › Widget „Odin“: Verbindungsstatus und Adresse (nur lesend).

### 5. Tests

- Unit-Tests der Datenquellen mit Beispieldateien aus `/proc` und `/sys`.
- Integrationstest im Test-Container `odin-sim`: MIRA ↔ Odin-API mit TLS und Token.

## Erfolgskriterien

| Kriterium |
| --- |
| Die Odin-API antwortet nur über HTTPS; ohne oder mit falschem Token → 401. |
| MIRA verweigert die Verbindung, wenn Odin ein anderes Zertifikat vorlegt. |
| Die Odin-Ansicht zeigt echte Werte von Odin. |
| Ist Odin aus oder schläft, zeigt MIRA nach spätestens zwei Abfrageintervallen „Offline“ – ohne Fehler in Oberfläche oder Log-Flut. |
| Der Dienst läuft als `mira-agent` ohne zusätzliche Rechte; die API kann nichts verändern. |
| Tests grün, inklusive Integrationstest mit `odin-sim`. |
| Installation und Deinstallation sind dokumentiert und rückstandsfrei. |

## Erkenntnisse von Odin (vor der Umsetzung erhoben)

| Befund | Folge |
| --- | --- |
| Node.js 22.22.1 in den Ubuntu-Paketquellen | Installation per `apt`, keine Fremdquelle |
| ufw inaktiv | ufw bleibt unberührt; eigene nftables-Tabelle nur für Port 8443 |
| keine NFS/CIFS-Mounts | NAS-Widget zeigt „Kein Netzlaufwerk eingebunden.“ |
| ein Datenträger `/` (NVMe) | Standard-Konfiguration: `/` als „NVMe (System)“ |
| AMD-GPU als `card2`, Sensoren coretemp/amdgpu/nvme | Datenquellen darauf ausgelegt, iGPU wird übersprungen |
| API-Schnittstelle `eno1.40` (Server-VLAN) | API lauscht nur auf dieser Adresse |

## Ergebnis

- **Tests:** Odin-API 20 Tests (Datenquellen, Token, IP-Sperre, nur lesende Endpunkte,
  hängende Mounts), Backend 40 Tests (davon 7 Integrationstests MIRA ↔ Odin-API) – alle grün.
- **odin-sim (Ubuntu 26.04, echtes Installationspaket):**
  - Installer installiert Node.js aus Ubuntu, legt Benutzer, Dateien mit korrekten Rechten,
    Zertifikat, Token-Hash und nftables-Regel an; Vorabprüfung als `mira-agent`.
  - Deinstallation mit `--purge` ohne Rückstände.
  - Fremder Rechner wird blockiert – auch mit gültigem Token, auch ohne nftables-Regel.
  - Ausfall der API: MIRA meldet nach zwei Intervallen „Offline“, zeigt die letzten Werte
    ausgegraut und verbindet sich automatisch wieder; insgesamt nur 3 Log-Zeilen.
- **Beim Test gefunden und behoben:** `allowedClients` wurde vom Installer doppelt
  verschachtelt; Fehlermeldungen der Konfiguration waren unlesbar (jetzt Klartext und
  Vorabprüfung vor dem Start).
- Die systemd-Härtung wird erst auf Odin wirksam (im Container läuft kein systemd).

## Inbetriebnahme (2026-11-06)

Betrieb auf Asgard über Portainer mit dem Image aus GitHub
([ADR 0008](../adr/0008-images-ueber-github-container-registry.md)); Odin-API aus dem
GitHub-Release installiert.

| Erkenntnis | Umsetzung |
| --- | --- |
| Asgard installiert nur über Portainer-Stacks, ohne `git` | Image-Build und Releases über GitHub Actions, `deploy/portainer-stack.yml` |
| Leere Stack-Variablen verhinderten den Start | leere Werte gelten als „nicht gesetzt“ |
| Container im Heimnetz laufen mit macvlan-Adressen | MIRA erhält eine eigene IP im Server-Netz; spricht Odin direkt an, keine Regel zwischen VLANs nötig; Odin erlaubt nur diese IP |
| Eigene IP ⇒ Standardport möglich | MIRA lauscht auf Port 80 – ohne Root, nur im Netzwerk-Namensraum des Containers freigegeben |
| Nginx Proxy Manager erreicht macvlan-Adressen nicht | MIRA zusätzlich im Backend-Netz des Proxys (`http://mira:80`); `MIRA_TRUST_PROXY` = Subnetz dieses Netzes |
| GitHub lehnte einen Push mit privaten Test-Schlüsseln ab | Test-Zertifikate werden zur Laufzeit erzeugt; keine Schlüssel im Repository |
| NAS-Laufwerk ist ein systemd-Automount (CIFS) und wurde nicht angezeigt | Odin-API 0.1.2 liest `/etc/fstab` und meldet *eingehängt* / *bereit (Automount)* / *nicht eingehängt*; wartende Automounts werden bewusst nicht ausgelöst |
| Fastify-Veraltungswarnung im Journal | Odin-API 0.1.2 nutzt die unterstützte Variante (Log-Level je Route) |

Abnahme gegen den echten Odin: Werte plausibel; Härtung bestätigt (`mira-agent`,
`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, nftables-Regel nur für MIRA).

## Offen

- Verbindungsdaten über die Oberfläche bearbeitbar (Folgeaufgabe).
- Dashboard nutzt die echten Odin-Werte erst ab Stufe 6.
