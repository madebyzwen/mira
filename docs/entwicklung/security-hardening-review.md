# Wartung W1 – Härtung und Stabilität (MIRA 0.9.0, Shelly-Logger 0.2.0)

- Stand: 2026-11-12
- Umsetzung: Pull-Request #10, Tags `v0.9.0` und `shelly-logger-v0.2.0`
- Art: Wartung – keine neuen Funktionen aus Stufe 4c, 5a oder später
- MIRA-Agent: unverändert 0.2.0

Dieses Dokument beschreibt die Änderungen der Wartungsstufe W1 und ist zugleich die Anleitung für
das Update. Für den Betrieb sind vor allem [Maßnahmen des Betreibers](#maßnahmen-des-betreibers),
[Deployment](#deployment) und [Rollback](#rollback) wichtig.

## Inhalt

1. [Änderungen](#änderungen)
2. [API, Datenbank, Konfiguration](#api-datenbank-konfiguration)
3. [Tests und Prüfungen](#tests-und-prüfungen)
4. [Maßnahmen des Betreibers](#maßnahmen-des-betreibers)
5. [Deployment](#deployment)
6. [Rollback](#rollback)

## Änderungen

### Anmeldung nur über HTTPS (MIRA)

- Neue Variable **`MIRA_PUBLIC_URL`** (nur `https://host[:port]`). Ist sie gesetzt:
  - Aufrufe der Oberfläche über HTTP werden mit `308` auf die HTTPS-Adresse umgeleitet.
  - API-Anfragen über HTTP werden mit `403 https_required` abgelehnt.
  - Das Session-Cookie ist immer `Secure`, `HttpOnly`, `SameSite=Strict`; HTTPS-Antworten tragen
    `Strict-Transport-Security`.
  - `/health` bleibt für den Docker-Healthcheck über HTTP erreichbar.
- MIRA erkennt HTTPS am Header `X-Forwarded-Proto` des Reverse Proxys, der in `MIRA_TRUST_PROXY`
  eingetragen ist. Mit `MIRA_PUBLIC_URL` ist `MIRA_TRUST_PROXY` Pflicht; der Wert `true` ist dann
  nicht erlaubt.
- Ohne `MIRA_PUBLIC_URL` verhält sich MIRA wie bisher und zeigt in der Glocke den Hinweis
  „HTTPS wird nicht erzwungen“.
- Entscheidung: [ADR 0011](../adr/0011-https-pflicht-und-enges-proxy-vertrauen.md)

### Reverse Proxy (MIRA)

- Jeder Eintrag in `MIRA_TRUST_PROXY` (IP-Adresse oder Netz in CIDR-Schreibweise) wird beim Start
  geprüft. Bei großen Netzen und bei `true` schreibt MIRA einen Hinweis ins Protokoll.
- Mit `MIRA_PUBLIC_URL` muss der `Origin` ändernder Anfragen genau der öffentlichen Adresse
  entsprechen (Protokoll, Host, Port).

### Passwort ändern, Sitzungen beenden (MIRA)

- Konfiguration › MIRA › **Konto**: Passwort ändern (aktuelles Passwort nötig, mindestens 12 Zeichen)
  und „Alle Sitzungen beenden“.
- Nach einer Passwortänderung sind alle Sitzungen beendet, auch auf anderen Geräten.
- Neue Endpunkte: `POST /api/v1/auth/password`, `POST /api/v1/auth/sessions/revoke`.
- Das Startpasswort aus der Secret-Datei wird nur beim allerersten Start gelesen.

### Token für die Logger-API

- Beide Stacks setzen die Token-Datei jetzt standardmäßig:
  - Logger: `LOGGER_API_TOKEN_FILE=/secrets/api_token.txt`
  - MIRA: `MIRA_SHELLY_LOGGER_TOKEN_FILE=/secrets/shelly_logger_token.txt`
  - Beide Dateien enthalten dasselbe Token (mindestens 32 Zeichen).
- Ist die Datei beim Logger nicht nutzbar, misst er weiter; die API antwortet dann bis zur Korrektur
  nur auf `/health`.
- Fehlt die Datei bei MIRA, fragt MIRA ohne Token und schreibt einen Hinweis ins Protokoll.

### Container und CI

- MIRA-Stack mit `cap_drop: ALL` (wie der Logger). Port 80 weiterhin über
  `net.ipv4.ip_unprivileged_port_start`.
- Laufzeit-Images ohne npm, npx und corepack; Alpine-Pakete werden beim Bau aktualisiert.
- CI: `npm audit` und eine Trivy-Prüfung beider Images vor dem Veröffentlichen; Actions auf
  Commit-SHAs festgelegt; Dependabot für Actions, npm und Basisimages.
- Zeitlimits für Anfragen: MIRA 30 s, Logger 15 s.

### Messwerte und Anzeige

- MIRA hält abgeschlossene Zeiträume höchstens 5 Minuten im Zwischenspeicher. Nachträglich vom Logger
  ergänzte Energie erscheint danach auch in Verbrauch und Kosten.
- Logger: Lücken zwischen zwei Zählerständen werden immer als „rekonstruiert“ verbucht, auch
  innerhalb eines 30-s-Intervalls. Die Datenabdeckung (`coverage`) wird bei jeder Anfrage aus der
  aktuellen Zeit berechnet.
- Oberfläche: Beim Polling gilt nur die Antwort der zuletzt gestarteten Abfrage; Abfragen laufen
  nicht parallel.
- „Jetzt prüfen“ (Updates) höchstens einmal je Stunde ([A-005](../aufgaben/a-005-sperrfrist-jetzt-pruefen-aktivieren.md)).

### Sicherungen (MIRA und Logger)

- Jede Sicherung wird vor dem Übernehmen geprüft (`PRAGMA integrity_check`, Migrationsstand).
  Schlägt das fehl, bleiben vorhandene Sicherungen unverändert.
- Optional eine zweite, geprüfte Kopie auf ein getrenntes Ziel: `MIRA_BACKUP_COPY_DIR` bzw.
  `LOGGER_BACKUP_COPY_DIR` (Volume im Stack einhängen).
- MIRA meldet fehlgeschlagene Sicherungen in der Glocke; die nächste erfolgreiche Sicherung entfernt
  die Meldung. Der Logger schreibt Fehler ins Protokoll.
- Der Logger legt Datenbank und Sicherungen nur für UID 1000 lesbar an (wie MIRA).

## API, Datenbank, Konfiguration

**API:** nur ergänzt – zwei neue Endpunkte (siehe oben), neuer Fehlercode `https_required`.

**Datenbank:** keine neuen Migrationen. MIRA 0.9.0 und Logger 0.2.0 lesen die bisherigen Datenbanken;
eine Rückkehr zu 0.8.1 bzw. 0.1.1 ist ohne Datenverlust möglich.

**Konfiguration**

| Variable | Komponente | Standard | Bedeutung |
| --- | --- | --- | --- |
| `MIRA_PUBLIC_URL` | MIRA | – | HTTPS-Adresse über den Proxy; gesetzt = Anmeldung nur über HTTPS |
| `MIRA_TRUST_PROXY` | MIRA | `false` | Adresse(n)/Netz(e) des Reverse Proxys; wird beim Start geprüft |
| `MIRA_SHELLY_LOGGER_TOKEN_FILE` | MIRA | – (Stack: `/secrets/shelly_logger_token.txt`) | Token der Logger-API |
| `MIRA_BACKUP_COPY_DIR` | MIRA | – | zweites Sicherungsziel (optional) |
| `LOGGER_API_TOKEN_FILE` | Logger | – (Stack: `/secrets/api_token.txt`) | Token der Lese-API |
| `LOGGER_BACKUP_COPY_DIR` | Logger | – | zweites Sicherungsziel (optional) |

## Tests und Prüfungen

- 237 automatisierte Tests (Backend 136, Agent 27, Shelly-Logger 66, Weboberfläche 8), dazu
  Typecheck, Build, Benennungsprüfung.
- Neue Tests u. a. für: HTTPS-Pflicht und Proxy-Erkennung, Passwortänderung und Sitzungen,
  Token zwischen MIRA und Logger (auch die Umstellungsreihenfolge), Zwischenspeicher, Lückenerkennung
  und Datenabdeckung, Polling, Prüfung und Wiederherstellung von Sicherungen.
- Beide Images wurden mit den Stack-Einstellungen (`read_only`, `cap_drop: ALL`, `no-new-privileges`)
  gegen einen simulierten Shelly und das Agent-Paket 0.2.0 gestartet: Start als UID 1000,
  Healthchecks, Agent über HTTPS, Logger mit Token, HTTPS-Pflicht, Neustart mit erhaltenen Daten.
- CI auf GitHub für PR #10 und die Release-Tags grün, einschließlich der Prüfung der Images.

Schlägt die Image-Prüfung in der CI künftig an, ist meist ein Update fällig (Dependabot). Ist das
nicht möglich, kann eine begründete Ausnahme in [`.trivyignore`](../../.trivyignore) eingetragen werden.

## Maßnahmen des Betreibers

Zwingend (für das Update 0.9.0/0.2.0):

1. **Token-Dateien anlegen** (je eine in den Secrets von MIRA und Logger, gleicher Inhalt) –
   **bevor** der Logger-Stack aktualisiert wird.
2. **Homeserver / Portainer:** neue Stack-Texte übernehmen.

Empfohlen:

3. **Anmeldung nur über HTTPS:** `MIRA_PUBLIC_URL` und `MIRA_TRUST_PROXY` setzen (Schritt 4 im Deployment).
4. **Passwort ändern** (Konfiguration › MIRA › Konto); danach `secrets/admin_password.txt` löschen.

Optional:

5. **Nginx Proxy Manager:** Proxy-Host für `<MIRA_HOSTNAME>` mit „Force SSL“; Ziel bleibt
   `http://mira:80`. NPM sendet `X-Forwarded-Proto` und `X-Forwarded-For` von sich aus.
6. **`MIRA_TRUST_PROXY` möglichst eng:** feste Adresse des Proxys oder ein eigenes kleines Netz nur
   für Proxy und MIRA.
7. **Getrenntes Sicherungsziel:** Ordner auf einem anderen Volume (UID 1000, `chmod 700`), im Stack
   als `…:/backup-copy` einhängen, `MIRA_BACKUP_COPY_DIR=/backup-copy` bzw.
   `LOGGER_BACKUP_COPY_DIR=/backup-copy` setzen.

Keine Änderung nötig an Firewall und KI-Server (Agent unverändert 0.2.0).

## Deployment

Platzhalter wie in der README; `APPDATA=<APPDATA_PFAD>`.

**0. Sicherung vor dem Update** (per SSH auf dem Homeserver; die Container laufen weiter):

```bash
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$APPDATA/update-sicherung-$STAMP"
cp -a "$APPDATA/mira/data/backups" "$APPDATA/update-sicherung-$STAMP/mira-backups"
cp -a "$APPDATA/mira-shelly-logger/data/backups" "$APPDATA/update-sicherung-$STAMP/logger-backups"
ls -l "$APPDATA/update-sicherung-$STAMP"/*   # Sicherungen von heute bzw. gestern vorhanden?
```

**1. Token anlegen** (einmalig, gleicher Inhalt in beiden Dateien):

```bash
T=$(openssl rand -hex 32)
printf '%s\n' "$T" > "$APPDATA/mira/secrets/shelly_logger_token.txt"
printf '%s\n' "$T" > "$APPDATA/mira-shelly-logger/secrets/api_token.txt"
unset T
chmod 600 "$APPDATA/mira/secrets/shelly_logger_token.txt" "$APPDATA/mira-shelly-logger/secrets/api_token.txt"
sudo chown 1000:1000 "$APPDATA/mira/secrets/shelly_logger_token.txt" "$APPDATA/mira-shelly-logger/secrets/api_token.txt"
```

**2. MIRA aktualisieren** (Portainer → Stack „mira“ → Editor):

1. Inhalt von [`deploy/portainer-stack.yml`](../../deploy/portainer-stack.yml) übernehmen.
2. `MIRA_VERSION=0.9.0` setzen, `MIRA_PUBLIC_URL` vorerst leer lassen.
3. „Update the stack“ mit „Re-pull image“.

Prüfen:

- Anmeldung über `https://<MIRA_HOSTNAME>`.
- Systeme › Shelly Plug zeigt „verbunden“.
- In der Glocke erscheint „HTTPS wird nicht erzwungen“ – das ist erwartet.

**3. Logger aktualisieren** (Stack „mira-shelly-logger“):

1. Inhalt von [`deploy/shelly-logger-stack.yml`](../../deploy/shelly-logger-stack.yml) übernehmen.
2. `LOGGER_VERSION=0.2.0` setzen, „Update the stack“ mit „Re-pull image“.

Prüfen:

- Container `healthy`.
- Protokoll „Shelly-Logger gestartet“ mit `auth: "token"`.
- In MIRA weiterhin „verbunden“, der Verbrauch von heute ist vorhanden (die kurze Pause wird aus dem
  Zählerstand rekonstruiert).

**4. Anmeldung nur über HTTPS:**

1. Vorab im Browser prüfen: Nach der Anmeldung über `https://<MIRA_HOSTNAME>` ist beim Cookie
   `mira_session` „Secure“ gesetzt (Entwicklertools → Application → Cookies). Dann erkennt MIRA HTTPS
   über den Proxy bereits.
2. Im Stack „mira“ setzen:
   - `MIRA_TRUST_PROXY=<PROXY_IP>` oder das Netz des Proxys
   - `MIRA_PUBLIC_URL=https://<MIRA_HOSTNAME>`
3. Stack aktualisieren.

Prüfen:

- `https://<MIRA_HOSTNAME>` – Anmeldung funktioniert, der Hinweis in der Glocke ist verschwunden.
- `http://<MIRA_IP>` leitet auf `https://<MIRA_HOSTNAME>` um.

**5. Passwort ändern** (Konfiguration › MIRA › Konto), danach `secrets/admin_password.txt` löschen.

**6. Optional:** getrenntes Sicherungsziel einrichten (siehe [Maßnahmen](#maßnahmen-des-betreibers), Punkt 7).

**Wenn nach Schritt 4 keine Anmeldung möglich ist** (Meldung „MIRA ist nur über HTTPS erreichbar“
trotz HTTPS-Aufruf): `MIRA_PUBLIC_URL` leeren und den Stack aktualisieren (sofort wieder wie in
Schritt 2), dann `MIRA_TRUST_PROXY` prüfen.

## Rollback

| Situation | Vorgehen |
| --- | --- |
| Probleme mit „Anmeldung nur über HTTPS“ | `MIRA_PUBLIC_URL` leeren → Stack aktualisieren |
| MIRA zeigt beim Shelly „Token abgelehnt“ | Token-Dateien prüfen (gleicher Inhalt, mind. 32 Zeichen, lesbar für UID 1000) und beide Container neu starten – oder im Logger-Stack `LOGGER_API_TOKEN_FILE=` (leer) setzen |
| MIRA 0.9.0 zurücknehmen | `MIRA_VERSION=0.8.1`, Stack-Text aus dem Tag `v0.8.1` → „Update the stack“. Die Datenbank ist kompatibel; ein in 0.9.0 geändertes Passwort bleibt gültig. |
| Logger 0.2.0 zurücknehmen | `LOGGER_VERSION=0.1.1`, Stack-Text aus dem Tag `shelly-logger-v0.1.1` **ohne** `LOGGER_API_TOKEN_FILE`. Die Datenbank ist kompatibel. |
| Datenbank beschädigt | Wiederherstellung wie in der [README](../../README.md#sicherung-und-wiederherstellung) bzw. [Logger-README](../../shelly-logger/README.md) aus `backups/` oder aus der Update-Sicherung (Schritt 0) |

Fehlgeschlagene Sicherungen zeigt MIRA in der Glocke („Datensicherung fehlgeschlagen“), der Logger
im Protokoll (Job `backup`). Vorhandene Sicherungen bleiben in beiden Fällen unverändert; die nächste
tägliche Sicherung läuft automatisch.
