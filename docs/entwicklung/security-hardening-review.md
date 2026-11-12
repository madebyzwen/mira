# Wartung W1 – Sicherheitshärtung und Stabilität (MIRA 0.9.0, Shelly-Logger 0.2.0)

- Stand: 2026-11-12
- Auftrag: [Vorgabe 2026-11-12](../vorgaben/2026-11-12-security-hardening.md) (externes Code-Review mit Befunden)
- Geprüfter Ausgangsstand: `main` @ `945b577` (MIRA 0.8.1, Shelly-Logger 0.1.1, MIRA-Agent 0.2.0), Arbeitsverzeichnis sauber
- Umsetzung: Branch `fix/review-befunde`, Pull-Request #10
- Art: Wartung – **keine** neuen Funktionen aus Stufe 4c, 5a oder später

Dieses Dokument ist zugleich Bericht und Betriebsanleitung für das Update. Für den Betrieb sind vor
allem die Abschnitte [Maßnahmen des Betreibers](#maßnahmen-des-betreibers), [Deployment](#deployment)
und [Rollback](#rollback) wichtig.

## Inhalt

1. [Ausgangszustand](#ausgangszustand)
2. [Befunde: Prüfung und Ergebnis](#befunde-prüfung-und-ergebnis)
3. [Durchgeführte Korrekturen](#durchgeführte-korrekturen)
4. [Zusätzlich gefundene Probleme](#zusätzlich-gefundene-probleme)
5. [Änderungen an API, Datenbank, Konfiguration und Deployment](#änderungen-an-api-datenbank-konfiguration-und-deployment)
6. [Tests](#tests)
7. [Abhängigkeits- und Container-Scans](#abhängigkeits--und-container-scans)
8. [Verbleibende Risiken](#verbleibende-risiken)
9. [Maßnahmen des Betreibers](#maßnahmen-des-betreibers)
10. [Deployment](#deployment)
11. [Rollback](#rollback)

## Ausgangszustand

- Typecheck, Build, Benennungsprüfung grün; 169 Tests (Backend 94, Agent 27, Logger 48) grün.
- `npm audit`: 0 Schwachstellen.
- Keine Schwachstellenprüfung in der CI; Actions über verschiebbare Haupt-Tags (`@v7`) eingebunden.
- Auf dem Entwicklungsrechner ist kein Node.js installiert: Alle Prüfungen liefen in `node:22`
  (Docker) mit eigenen `node_modules`-Volumes; Images wurden lokal mit Docker gebaut und getestet.

## Befunde: Prüfung und Ergebnis

Jeder Befund wurde am Quellcode und, wo möglich, im laufenden Container nachgeprüft.

| ID | Komponente | Befund | Risiko | Ergebnis der Prüfung | Ursache |
| --- | --- | --- | --- | --- | --- |
| S-01 | MIRA, Stack | Anmeldung über unverschlüsseltes HTTP möglich | hoch | **bestätigt** | MIRA lauscht auf allen Schnittstellen, auch auf der macvlan-Adresse (Port 80). Kein Zwang zu HTTPS; `Secure` am Cookie nur, wenn MIRA HTTPS erkennt (`auto`). |
| S-02 | MIRA | Vertrauen in Weiterleitungs-Header zu breit; Origin-Prüfung ohne Protokoll | mittel | **bestätigt, konfigurationsabhängig** | Die Anleitung empfahl das ganze Proxy-Subnetz (z. B. `/16`) – jeder Container darin könnte `X-Forwarded-Proto/-For/-Host` setzen. Einträge wurden nicht geprüft; `true` war ohne Warnung möglich. Die Origin-Prüfung verglich nur Host und Port. Abgemildert durch `SameSite=Strict`. Ein Client kann über den Proxy hinweg keine Adresse vortäuschen (Fastify wertet `X-Forwarded-For` von rechts aus). |
| S-03 | MIRA | Keine Passwortänderung | mittel | **bestätigt** (fehlende Funktion, bisher als offener Punkt in [Sicherheit](../architektur/sicherheit.md)) | – |
| S-04 | CI | Keine Prüfung auf Schwachstellen; Actions nicht festgelegt | mittel | **bestätigt** | – |
| S-05 | MIRA-Stack | `cap_drop: ALL` fehlt | niedrig | **bestätigt** | Der Prozess läuft als UID 1000 mit `no-new-privileges` – effektiv ohne Capabilities. Die Begrenzungsmenge (`CapBnd`) enthielt aber die Docker-Standardrechte. |
| S-06 | Logger, Stacks | Logger-API ohne Token | niedrig | **bestätigt, konfigurationsabhängig** | Die Netztrennung ist wirksam: API nur im internen Netz `mira-intern` (`internal: true`), auf der macvlan-Adresse kein Port. Der Token-Schutz war vorhanden, aber nicht aktiviert. Eine fehlende Token-Datei hätte den Logger beendet (Messung gestoppt). |
| F-01 | MIRA | Abgeschlossene Zeiträume dauerhaft zwischengespeichert | mittel | **bestätigt** | `consumptionCache` und `monthCache` behielten abgeschlossene Zeiträume bis zum Neustart. Fällt der Shelly über Mitternacht aus, verbucht der Logger beim Wiederverbinden Energie nachträglich auf den Vortag – MIRA zeigte weiter den alten Wert (auch in den Jahreskosten). |
| F-02 | Logger | Lücke innerhalb eines 30-s-Intervalls als „gemessen“ verbucht | niedrig | **bestätigt** | Bedingung `prev.ts < start`: Nur Lücken über eine Intervallgrenze galten als rekonstruiert. Die **Summe** war immer richtig, nur die Einstufung gemessen/rekonstruiert nicht. Eine Doppelzählung gab es nicht. |
| F-03 | Logger | Datenabdeckung bei längerem Ausfall zu hoch | mittel | **bestätigt** | Der Cache hing nur an `aggregator.version`. Ohne neue Intervalle (Shelly aus) blieben `coverage` und `complete` stehen, obwohl die Zeit weiterläuft. |
| F-04 | Weboberfläche | Wettlauf beim Polling | mittel | **bestätigt (durch Analyse)** | Ein gemeinsamer `mounted`-Ref über Schlüsselwechsel hinweg: Nach einem Wechsel des Zeitraums wurde die späte Antwort des alten Zeitraums übernommen. Intervall, Sichtbarwerden und `refresh()` konnten parallel laden, eine ältere Antwort konnte eine neuere überschreiben. |
| B-01 | MIRA, Logger | Sicherungen auf demselben Speicher, ohne Prüfung | mittel | **bestätigt** | Sicherungen konsistent (Backup-API), aber nicht geprüft, nur im Datenverzeichnis, Fehler nur im Protokoll. |
| B-02 | MIRA | Sperrfrist „Jetzt prüfen“ abgeschaltet | niedrig | **bestätigt** (bewusst für die Entwicklung, [A-005](../aufgaben/a-005-sperrfrist-jetzt-pruefen-aktivieren.md)) | `MANUAL_CHECK_INTERVAL_MS = 0`. Mehrere gleichzeitige Abfragen bei GitHub gab es nicht (gemeinsame laufende Abfrage). |

Kein Befund wurde widerlegt. Abweichende Erkenntnisse: S-05 und S-06 sind durch vorhandene
Schutzschichten deutlich entschärft. Bei F-02 war nur die Einstufung falsch, nicht die Summe.

## Durchgeführte Korrekturen

### S-01 – HTTPS-Pflicht

- Neue Variable **`MIRA_PUBLIC_URL`** (nur `https://host[:port]`). Ist sie gesetzt:
  - Aufrufe der Oberfläche über unverschlüsseltes HTTP (`GET`/`HEAD`) werden mit **308** auf die
    HTTPS-Adresse umgeleitet – das Anmeldeformular wird nie über HTTP ausgeliefert.
  - API-Anfragen über HTTP werden **vor** dem Lesen des Bodys mit `403 https_required` abgelehnt.
    Ein Anmeldeversuch über HTTP wird als `auth.insecure_transport` (ohne Benutzername/Passwort)
    im Audit-Log und als Warnung im Protokoll festgehalten.
  - Das Session-Cookie ist immer `Secure`, `HttpOnly`, `SameSite=Strict`; HTTPS-Antworten tragen
    `Strict-Transport-Security: max-age=31536000`.
  - `/health` bleibt über HTTP erreichbar (Docker-Healthcheck über `127.0.0.1`).
  - Startprüfung: `MIRA_PUBLIC_URL` ohne `MIRA_TRUST_PROXY`, mit `MIRA_TRUST_PROXY=true` oder mit
    `MIRA_COOKIE_SECURE=false` verhindert den Start mit klarer Meldung. Ohne vertrauenswürdigen
    Proxy könnte MIRA HTTPS nicht erkennen und würde jede Anmeldung ablehnen.
- **Ohne `MIRA_PUBLIC_URL` bleibt das Verhalten unverändert** (kein Aussperren nach einem normalen
  Update). Stattdessen gibt es eine Warnung beim Start und eine Meldung in der Glocke:
  „HTTPS wird nicht erzwungen“.
- Anmeldeseite: Hinweis bei unverschlüsselter Verbindung (außer `localhost`), verständliche Meldung bei `https_required`.
- Listener: Die macvlan-Adresse wird weiter für ausgehende Verbindungen (KI-Server, später
  Wake-on-LAN) gebraucht. Eingehend dient sie mit HTTPS-Pflicht nur noch der Umleitung. Fastify kann
  nur eine Adresse binden, und die Adresse im Proxy-Netz vergibt Docker dynamisch. Ein Binden nur an
  das Proxy-Netz wäre deshalb nicht robust und wurde bewusst nicht umgesetzt (siehe
  [Verbleibende Risiken](#verbleibende-risiken)).

### S-02 – Vertrauen in den Reverse Proxy

- Jeder Eintrag in `MIRA_TRUST_PROXY` wird geprüft (IPv4/IPv6-Adresse oder CIDR). Ungültige
  Einträge verhindern den Start mit klarer Meldung.
- Warnung beim Start für große Netze (IPv4 kürzer als `/24`, IPv6 kürzer als `/64`) und für `true`;
  `true` ist mit HTTPS-Pflicht verboten.
- Origin-Prüfung mit HTTPS-Pflicht: exakter Vergleich mit der öffentlichen Herkunft (Protokoll, Host,
  Port). Ohne HTTPS-Pflicht weiterhin Host-Vergleich (ein Protokollvergleich würde bei falsch
  eingerichtetem Proxy jede Anmeldung blockieren), zusätzlich nur `http:`/`https:`.
  Anfragen ohne `Origin` (z. B. `curl`) bleiben möglich.
- Empfehlung im Stack und in der Anleitung: feste Adresse des Proxys oder ein kleines, eigenes Proxy-Netz.

### S-03 – Passwort ändern, Sitzungen beenden

- `POST /api/v1/auth/password` `{ currentPassword, newPassword }` (angemeldet): Das aktuelle Passwort
  ist Pflicht. Fehlversuche zählen zur Login-Sperre (IP und Benutzername). Neues Passwort mit
  mindestens 12 Zeichen, nicht nur Leerzeichen, verschieden vom alten. Hash über die vorhandene
  scrypt-Implementierung.
- In **einer Transaktion**: neuer Hash (nur, wenn der bisherige Hash noch gilt) und **Löschen aller
  Sessions** des Benutzers. Antwort `204`, Cookie gelöscht – neue Anmeldung nötig, auch auf allen anderen Geräten.
- `POST /api/v1/auth/sessions/revoke`: alle Sessions des eigenen Kontos beenden.
- Audit: `auth.password_change` (Erfolg mit Anzahl beendeter Sessions bzw. Grund des Fehlschlags), `auth.sessions_revoke`.
- Oberfläche: Konfiguration › MIRA › „Konto“ (Passwort ändern, „Alle Sitzungen beenden“).
- Das Startpasswort wird bei vorhandenem Benutzer nie gelesen; ein Test belegt, dass ein Neustart
  das geänderte Passwort nicht überschreibt.

### S-04 – Sicherheitsprüfungen in der CI

- `npm audit --audit-level=high` im Test-Job (Lauf scheitert ab „high“).
- Neuer Job **„Sicherheitsprüfung der Images“**: baut beide Images (ohne Veröffentlichung) und prüft
  sie mit **Trivy 0.76.1** (als Image, auf Digest festgelegt). Der Lauf scheitert bei HIGH/CRITICAL
  mit verfügbarer Korrektur. Zusätzlich läuft ein vollständiger Bericht aller Stufen (nur Information).
  Begründete Ausnahmen gehören in [`.trivyignore`](../../.trivyignore) (derzeit keine).
- Images werden nur noch veröffentlicht, wenn Tests **und** Sicherheitsprüfung bestanden sind.
- Alle Actions auf **Commit-SHAs** festgelegt (Version als Kommentar), `persist-credentials: false`.
  [Dependabot](../../.github/dependabot.yml) hält Actions, npm und Basisimages aktuell (ohne
  Wechsel der Node-Hauptversion).
- Der Workflow nutzt außer dem automatischen `GITHUB_TOKEN` (nur in den Jobs zum Veröffentlichen)
  keine Secrets. Der Prüfjob läuft ohne Secrets.
- Bewusst nur zwei Werkzeuge (npm audit, Trivy): Trivy deckt Betriebssystempakete und
  JavaScript-Pakete in den Images ab, ein zusätzlicher OSV-Scanner brächte kaum Mehrwert.

### S-05 – Container-Härtung

- MIRA-Stack (und lokale `docker-compose.yml`): `cap_drop: ALL`. Port 80 ohne Capabilities über
  `net.ipv4.ip_unprivileged_port_start` (wie bisher). Ausgehende TCP-Verbindungen und
  UDP-Broadcast (späteres Wake-on-LAN) brauchen keine Capabilities.
- Beide Images: Sicherheitsupdates der Alpine-Pakete beim Bau (`apk upgrade`). **npm, npx und
  corepack werden aus dem Laufzeit-Image entfernt** – sie werden nicht gebraucht und waren die
  Quelle aller HIGH-Befunde (siehe [Scans](#abhängigkeits--und-container-scans)).
- Geprüft im Container (siehe [Docker-Tests](#docker-tests)): UID 1000, alle Capability-Mengen 0,
  `NoNewPrivs: 1`, Wurzeldateisystem schreibgeschützt, `/data` beschreibbar, Dateien mit Rechten `600`.

### S-06 – Token für die Logger-API

- Beide Stacks setzen die Token-Datei jetzt standardmäßig:
  - Logger: `LOGGER_API_TOKEN_FILE=/secrets/api_token.txt`
  - MIRA: `MIRA_SHELLY_LOGGER_TOKEN_FILE=/secrets/shelly_logger_token.txt`
  - Beide Dateien enthalten dasselbe Token.
- **Logger, fehlertolerant und sicher:** Ist die Datei nicht lesbar, leer, enthält sie Leerzeichen
  oder ist das Token kürzer als 32 Zeichen, **misst der Logger weiter**. Die API ist dann bis zur
  Korrektur gesperrt (`401`, nur `/health` antwortet), dazu eine Fehlermeldung im Protokoll. Bisher
  beendete eine fehlende Datei den Logger.
- **MIRA, fehlertolerant:** Fehlt die Datei, fragt MIRA ohne Token und warnt. Bisher wurde die
  Anbindung dann ganz abgeschaltet. Verlangt der Logger ein Token, zeigt MIRA „Token abgelehnt“.
- Sichere Reihenfolge: Token-Dateien anlegen → MIRA aktualisieren (sendet das Token, ein Logger ohne
  Token ignoriert es) → Logger aktualisieren (verlangt es). Siehe [Deployment](#deployment).
- Die API bleibt rein lesend (nur `GET`/`HEAD`), `/health` ohne Token. Zusätzlich: Zeitlimit 15 s,
  Body höchstens 1 KiB.

### F-01 – Zwischenspeicher in MIRA

- Laufende Zeiträume 15 s, abgeschlossene **höchstens 5 Minuten** (`COMPLETE_PERIOD_TTL_MS`) statt
  dauerhaft. Das gilt auch für die Monatswerte der Jahreskosten. Nachträglich rekonstruierte Energie
  und die Kosten dazu erscheinen spätestens nach 5 Minuten.
- Beide Zwischenspeicher sind begrenzt (300 Einträge).
- Bewusst ohne Revisionsmechanismus: Die Abfragen an den Logger sind klein, laufen im internen Netz
  und sind im Logger selbst zwischengespeichert. Eine API-Erweiterung wäre unverhältnismäßig.

### F-02 – Lückenerkennung im Logger

- Eine Lücke zwischen zwei Zählerständen (länger als `max(LOGGER_STALE_AFTER_MS, 3 × Intervall)`)
  wird **immer** als rekonstruiert verbucht, auch innerhalb eines Intervalls und bei einem Neustart
  mitten im Intervall. Zähler-Reset, Plausibilitätsgrenze, Aufteilung über Mitternacht und
  Zeitumstellung bleiben unverändert.
- **Bestehende Daten werden nicht umgeschrieben** (keine Migration nötig, Summen waren richtig);
  frühere Lücken innerhalb eines Intervalls bleiben als „gemessen“ eingestuft.

### F-03 – Datenabdeckung im Logger

- Zwischengespeichert werden nur noch die stabilen Summen (gemessen, rekonstruiert, abgedeckte Zeit
  je Abschnitt). `coverage` und `complete` werden bei **jeder** Anfrage aus der aktuellen Zeit
  berechnet – für Tag, Woche, Monat, Jahr und jede Aufteilung.

### F-04 – Polling in der Oberfläche

- Neue, browserunabhängige Klasse [`Poller`](../../frontend/src/lib/poller.ts); `usePolling` nutzt sie:
  - fortlaufende Nummer je Anfrage – nur die zuletzt gestartete Antwort wird übernommen
  - keine parallele Abfrage durch Intervall oder Sichtbarwerden, solange eine läuft
  - `refresh()` startet immer neu
  - nach `stop()` (Unmount, neuer Zeitraum) keine Zustandsänderung mehr
  - Fehler und Ladezustand werden beim Wechsel zurückgesetzt, bisherige Daten bleiben bis zur ersten Antwort sichtbar
  - Intervall und Pause im Hintergrund unverändert
- Erste Frontend-Tests (Vitest, ohne DOM-Nachbildung).

### B-01 – Sicherungen

- Jede Sicherung (MIRA und Logger) wird vor dem Übernehmen geprüft: `PRAGMA integrity_check` und
  Migrationsstand. Schlägt Sicherung oder Prüfung fehl, bleiben vorhandene Sicherungen unverändert,
  es wird nichts gelöscht, temporäre Dateien werden entfernt.
- Optional **zweites, getrenntes Ziel**: `MIRA_BACKUP_COPY_DIR` bzw. `LOGGER_BACKUP_COPY_DIR`. Dorthin
  geht eine zusätzliche, ebenfalls geprüfte Kopie mit eigener Aufbewahrung. Ein Fehler dort lässt die
  lokale Sicherung gültig. Das Ziel richtet der Betreiber ein (Volume im Stack); ohne Angabe ändert sich nichts.
- MIRA: Meldung in der Glocke bei fehlgeschlagener Sicherung („Datensicherung fehlgeschlagen“, Stufe
  Fehler) bzw. Kopie („Kopie der Datensicherung fehlgeschlagen“, Warnung). Die nächste erfolgreiche
  Sicherung entfernt die Meldung.
- Logger: Umask `077` wie bei MIRA – Datenbank und Sicherungen nur für UID 1000 lesbar.
- Wiederherstellung automatisiert getestet (Sicherung → neues Datenverzeichnis → Start → Anmeldung
  bzw. Messwerte und Zählerstand identisch).

### B-02 – Sperrfrist „Jetzt prüfen“

- Sperrfrist von einer Stunde aktiv (A-005 erledigt). Gleichzeitige Klicks lösen genau eine Abfrage
  aus. Auch ein Fehlschlag startet die Sperrfrist (wie in A-004 festgelegt) und wird protokolliert.
  Eine zurückgestellte Uhr sperrt nicht dauerhaft. Tägliche und Aufruf-Prüfung unverändert.
  Die Oberfläche zeigt die Sperrfrist wie bisher an („Erneut prüfen ab … Uhr möglich“).

## Zusätzlich gefundene Probleme

| ID | Komponente | Problem | Risiko | Behandlung |
| --- | --- | --- | --- | --- |
| Z-01 | MIRA | Login-Sperre im Speicher ohne Obergrenze: Jeder Fehlversuch mit neuem Benutzernamen legte einen dauerhaften Eintrag an | niedrig | behoben: abgelaufene Einträge werden entfernt, höchstens 10 000 Einträge; die IP-Sperre eines Angreifers bleibt auch beim Überlauf bestehen |
| Z-02 | MIRA, Logger | Kein Zeitlimit für Anfragen (Fastify-Standard „unbegrenzt“) – ungünstig für den direkten Zugang ohne Proxy | niedrig | behoben: 30 s (MIRA), 15 s (Logger) |
| Z-03 | Logger | Keine Umask: Datenbank und Sicherungen im Volume für alle lesbar (`644`) | niedrig | behoben: Umask `077` |
| Z-04 | Images | Das im Basisimage mitgelieferte npm enthielt Pakete mit HIGH-Schwachstellen (u. a. `brace-expansion`, `ip-address`, `sigstore`, `pacote`, `picomatch`), dazu `zlib` (MEDIUM) | mittel (zur Laufzeit nicht genutzt) | behoben: npm/npx/corepack entfernt, `apk upgrade` – 0 Befunde |
| Z-05 | MIRA | Unlesbare Token-Datei des Loggers schaltete die Anbindung ganz ab | niedrig (Betrieb) | behoben, siehe S-06 |
| Z-06 | MIRA | `MIRA_TRUST_PROXY` wurde nicht geprüft, `true` ohne Warnung | niedrig | behoben, siehe S-02 |
| Z-07 | MIRA | Zurückgestellte Uhr hätte „Jetzt prüfen“ bis zum gespeicherten Zeitpunkt gesperrt | niedrig | behoben, siehe B-02 |

Ohne Befund geprüft:

- **SQL:** ausschließlich vorbereitete Anweisungen mit gebundenen Parametern.
- **Ausgabe:** kein `innerHTML`/`dangerouslySetInnerHTML`; externe Links mit `noopener noreferrer`.
- **Abwehr und Header:**
  - CSRF: `SameSite=Strict` und Origin-Prüfung.
  - Sicherheits-Header: CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`.
  - Session-Fixation: bei jeder Anmeldung ein neues Token.
  - Session-Tokens: nur als SHA-256-Hash gespeichert.
- **Agent-Verbindung:** TLS ≥ 1.2 mit Zertifikats-Pinning, Token gehasht, IP-Freigabe.
- **Fehlerantworten:** ohne interne Details.
- **Grenzen:** begrenzte Bodies und Antworten (MIRA 64 KiB Body; Clients mit 2 MiB Antwortlimit und Zeitlimits).
- **Migrationen:** wiederholbar, ausgelieferte Migrationen geprüft.
- **Netztrennung:** Logger-API vom Proxy-Netz aus nicht erreichbar (im Container geprüft).

## Änderungen an API, Datenbank, Konfiguration und Deployment

**API (MIRA)**

| Änderung | Verträglich? |
| --- | --- |
| neu: `POST /api/v1/auth/password`, `POST /api/v1/auth/sessions/revoke` | ja (nur ergänzt) |
| neu: Fehlercode `https_required` (`403`, `details.url`) | ja |
| mit `MIRA_PUBLIC_URL`: HTTP → `308`/`403`, Origin exakt | Verhaltensänderung nur bei gesetzter Variable |
| ohne `MIRA_PUBLIC_URL`: Origin mit anderem Schema als `http`/`https` → `403` | ja |

**API (Logger):** unverändert. Mit gesperrter API (Token-Datei fehlt) `401` für alle Endpunkte außer `/health`.

**Datenbank:** keine neuen Migrationen, keine Änderung bestehender Daten – MIRA 0.9.0 und Logger 0.2.0
lesen die bisherigen Datenbanken, ein Rückschritt auf 0.8.1/0.1.1 ist ohne Datenverlust möglich.

**Konfiguration**

| Variable | Komponente | Standard | Neu/geändert |
| --- | --- | --- | --- |
| `MIRA_PUBLIC_URL` | MIRA | – (Stack: leer) | neu – HTTPS-Pflicht |
| `MIRA_TRUST_PROXY` | MIRA | `false` | Einträge werden geprüft; Warnung bei großen Netzen und `true` |
| `MIRA_SHELLY_LOGGER_TOKEN_FILE` | MIRA | – (Stack: `/secrets/shelly_logger_token.txt`) | im Stack gesetzt; fehlende Datei = ohne Token |
| `MIRA_BACKUP_COPY_DIR` | MIRA | – | neu – zweites Sicherungsziel |
| `LOGGER_API_TOKEN_FILE` | Logger | – (Stack: `/secrets/api_token.txt`) | im Stack gesetzt; fehlende Datei = API gesperrt, Messung läuft |
| `LOGGER_BACKUP_COPY_DIR` | Logger | – | neu – zweites Sicherungsziel |

**Deployment**

- MIRA-Stack: `cap_drop: ALL`, neue Variablen, Kommentar für ein optionales Sicherungs-Volume.
- Logger-Stack: Token-Datei, Kommentar für ein optionales Sicherungs-Volume.
- Images ohne npm/npx/corepack.
- CI: Prüfjob, Veröffentlichung nur nach bestandener Prüfung.

**Versionen:** MIRA 0.9.0 (Images `ghcr.io/madebyzwen/mira`), Shelly-Logger 0.2.0, MIRA-Agent unverändert 0.2.0.

## Tests

### Neue bzw. geänderte Tests

| Befund | Test (Datei) | Vor der Korrektur |
| --- | --- | --- |
| S-01 | HTTPS-Pflicht: Anmeldung über Proxy mit `Secure`/`HttpOnly`/`SameSite=Strict`/HSTS; Umleitung der Seiten (auch `//…`); Anmeldung über HTTP abgelehnt ohne Session, mit Audit, ohne Passwort im Log; API mit Cookie über HTTP abgelehnt; `/health` über HTTP; Warnung ohne `MIRA_PUBLIC_URL` (`backend/test/proxy.test.ts`, `config.test.ts`) | neue Funktion |
| S-02 | nicht vertrauenswürdiger Container täuscht HTTPS vor; manipuliertes `X-Forwarded-For`; gleicher Host, anderes Protokoll/Port; Login-Sperre und Audit mit echter Client-Adresse; Prüfung der Einträge, Warnungen (`proxy.test.ts`, `config.test.ts`) | Protokoll-Test wäre gescheitert |
| S-03 | richtiges/falsches aktuelles Passwort, Sperre nach Fehlversuchen, ungültige neue Passwörter, Erfolg, neue Anmeldung, alte und andere Sessions ungültig, keine Offenlegung, Neustart überschreibt nicht, alle Sitzungen beenden (`backend/test/password-change.test.ts`) | neue Funktion |
| S-06 | Token auf beiden Seiten; Logger verlangt Token, MIRA hat keines; sichere Umstellungsreihenfolge; fehlende Datei in MIRA; Logger mit unbrauchbarer Token-Datei misst weiter, API gesperrt; Prüfung der Token-Datei (`backend/test/shelly.test.ts`, `shelly-logger/test/api.test.ts`, `config.test.ts`) | Logger wäre beendet worden |
| F-01 | abgeschlossener Tag und Monat: nachträglich rekonstruierte Energie mit neuen Kosten, auch in den Jahreskosten (`backend/test/shelly.test.ts`) | **scheitert** |
| F-02 | Lücke im selben Intervall; Neustart mit Pause im Intervall; Lücke über Zeitumstellung und Mitternacht; gemischte Lücken: gemessen + rekonstruiert = Zählerfortschritt; kurze Abstände bleiben gemessen (`shelly-logger/test/aggregator.test.ts`) | **3 scheitern** |
| F-03 | zehnminütiger Ausfall senkt die Abdeckung; `complete` wechselt ohne neue Messwerte (`shelly-logger/test/reports.test.ts`) | **3 scheitern** |
| F-04 | schneller Zeitraumwechsel, langsame Anfrage, keine parallelen Abfragen, Fehler und Erholung, synchroner Fehler, Unmount, Hintergrund/Vordergrund, Zurücksetzen beim Wechsel (`frontend/test/poller.test.ts`) | neue Klasse (alter Hook ohne DOM-Umgebung nicht testbar) |
| B-01 | beschädigte/fremde/leere Dateien erkannt; beschädigte Seiten; Wiederherstellung mit Anmeldung bzw. Messwerten; fehlgeschlagene Sicherung lässt vorhandene unverändert; getrenntes Ziel mit Aufbewahrung; Fehler am Ziel; Meldung in der Glocke (`backend/test/scheduler-backup.test.ts`, `shelly-logger/test/backup.test.ts`) | neue Funktion |
| B-02 | Sperrfrist ab Werk; gleichzeitige Klicks = eine Abfrage; Fehlschlag startet Sperrfrist und wird protokolliert; zurückgestellte Uhr (`backend/test/updates.test.ts`) | Sperrfrist-Test wäre gescheitert |
| Z-01 | Speicher der Login-Sperre begrenzt, abgelaufene Einträge entfernt, IP-Sperre bleibt (`backend/test/login-limiter.test.ts`) | Begrenzung wäre gescheitert |

„Scheitert“ ist nachgeprüft: Die neuen Tests liefen gegen den alten Quellcode (F-01: 1 von 7
gescheitert, F-02/F-03: 6 von 56) und gegen den neuen (alle grün).

### Testläufe

Alle Läufe in `node:22` (Node 22.23), Stand nach allen Änderungen:

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | erfolgreich |
| `npm run check:naming` | in Ordnung |
| `npm run typecheck` | ohne Fehler (alle Pakete) |
| `npm test` | **237 Tests grün**: Backend 136 (16 Dateien), Agent 27, Shelly-Logger 66 (7 Dateien), Weboberfläche 8 |
| `npm run build` | erfolgreich |
| `npm run package:agent` | erfolgreich |
| `npm audit` | 0 Schwachstellen |
| `docker build` (beide Images) | erfolgreich |

Der GitHub-Workflow selbst (insbesondere der neue Prüfjob) läuft erst nach dem Push. Lokal wurden
seine Schritte mit denselben Befehlen und derselben Trivy-Version nachgestellt.

### Docker-Tests

Beide Images wurden lokal gebaut und wie im Stack gestartet:

- Container-Einstellungen: `--read-only`, `tmpfs /tmp`, `--cap-drop ALL`, `no-new-privileges`, für
  MIRA die sysctl für Port 80.
- Netze: ein internes Netz wie `mira-intern`, ein Proxy-Netz, ein Netz zum Test-KI-Server.
- Gegenstellen: ein simulierter Shelly und der Test-KI-Server mit dem **echten** Agent-Paket 0.2.0.

| Prüfung | Ergebnis |
| --- | --- |
| Start als UID 1000, `CapPrm/CapEff/CapBnd = 0`, `NoNewPrivs = 1` (MIRA und Logger) | ✔ |
| Wurzeldateisystem schreibgeschützt, `/data` beschreibbar, Dateien `600` | ✔ |
| Healthchecks beider Container `healthy` | ✔ |
| Port 80 ohne Capabilities | ✔ |
| HTTPS mit Pinning und Token zum Agent (KI-Server „online“) | ✔ |
| MIRA ↔ Logger mit Token; Logger-API ohne/mit falschem Token `401`, mit Token `200`, `/health` `200` | ✔ |
| Logger-API vom Proxy-Netz aus nicht erreichbar | ✔ |
| Ohne `MIRA_PUBLIC_URL`: Anmeldung über HTTP wie bisher | ✔ |
| Mit `MIRA_PUBLIC_URL`: über Proxy `200` mit `Secure` + HSTS; direkt `308` bzw. `403 https_required`; vorgetäuschtes `X-Forwarded-Proto` `403` | ✔ |
| Neustart MIRA und Logger: Daten bleiben, Anmeldung funktioniert, Verbrauch vorhanden | ✔ |
| Logger mit fehlender Token-Datei: läuft (`healthy`), misst (`meter.state = online`), API `401` | ✔ |
| Images ohne npm (`npm` nicht vorhanden), Node 22.23.5 | ✔ |

Nicht geprüft:

- echter Nginx Proxy Manager
- echtes macvlan
- echte OPNsense
- echter Shelly
- Darstellung der neuen Oberfläche im Browser – geprüft sind nur Typecheck und Build, Bedienung und Aussehen von „Konto“ und Anmeldehinweis noch nicht

## Abhängigkeits- und Container-Scans

| Prüfung | Vorher (0.8.1/0.1.1) | Nachher (0.9.0/0.2.0) |
| --- | --- | --- |
| `npm audit` (alle Abhängigkeiten) | 0 | 0 |
| Trivy MIRA-Image, HIGH/CRITICAL mit Korrektur (CI-Schwelle) | 10 (alle im mitgelieferten npm) → CI wäre gescheitert | **0** |
| Trivy MIRA-Image, alle Stufen | zusätzlich 1 MEDIUM (`zlib`, Alpine) und weitere im npm | **0** |
| Trivy Logger-Image | wie MIRA | **0** |

Ausnahmen: keine. Hinweis: Scan-Ergebnisse hängen vom Stand der Schwachstellendatenbank ab (hier:
2026-11-12). Neue Einträge können künftige CI-Läufe scheitern lassen. Dann entweder aktualisieren
(Dependabot) oder eine begründete Ausnahme mit Prüfdatum in `.trivyignore` eintragen.

## Verbleibende Risiken

- **Direkter HTTP-Zugang bleibt offen (nur Umleitung).** Auf der macvlan-Adresse lauscht MIRA weiter
  auf Port 80. Mit HTTPS-Pflicht bekommt ein Browser dort nur eine Umleitung, und API-Anfragen werden
  abgelehnt. Ein Client, der Zugangsdaten **ohne** vorherigen Seitenaufruf direkt per HTTP sendet
  (z. B. ein Skript oder ein vor dem Update geöffneter Tab), überträgt sie trotzdem im Klartext.
  MIRA lehnt das ab, protokolliert es als `auth.insecure_transport` und meldet es im Protokoll.
  Ein Schutz auf Netzebene ist nur teilweise möglich: Verkehr im selben VLAN läuft nicht über die
  OPNsense. Empfehlung: Taucht `auth.insecure_transport` im Audit-Log auf, das Passwort ändern.
- **Ohne `MIRA_PUBLIC_URL` keine HTTPS-Pflicht.** Das ist bewusst so, damit ein normales Update nicht
  aussperrt. Bis der Betreiber die Variable setzt, gilt der bisherige Zustand (Warnung in der Glocke).
- **Vertrauen in das Proxy-Netz.** Mit einem großen Netz in `MIRA_TRUST_PROXY` können andere
  Container darin HTTPS und Client-Adressen vortäuschen (Warnung beim Start). Abhilfe: feste
  Proxy-Adresse oder eigenes kleines Netz (siehe [Maßnahmen](#maßnahmen-des-betreibers)).
- **Strecke Proxy → MIRA** im Docker-Netz unverschlüsselt (HTTP). Die Strecke verlässt den Homeserver
  nicht; das ist üblich und hier akzeptiert.
- **HSTS gilt nur für den Hostnamen**, nicht für den Aufruf über die IP-Adresse.
- **Sicherungen** liegen weiterhin auf demselben Speicher, bis der Betreiber ein getrenntes Ziel
  einrichtet. Sie enthalten den Passwort-Hash und die Session-Hashes und sind daher wie Geheimnisse zu
  behandeln (auch auf dem Kopierziel).
- **Historische Einstufung (F-02):** Lücken innerhalb eines Intervalls vor dem Update bleiben als
  „gemessen“ eingestuft. Summen und Kosten sind davon nicht betroffen.
- **F-01:** Nachträglich rekonstruierte Energie erscheint mit bis zu 5 Minuten Verzögerung.
- **Login-Sperre im Speicher:** Ein Neustart setzt die Zählung zurück (wie bisher, bewusst).
- **Polling-Hook:** Getestet ist die Logik (`Poller`), nicht die React-Einbindung im Browser.
- **CI:** Der neue Prüfjob ist noch nicht auf GitHub gelaufen, und neue Einträge in der
  Schwachstellendatenbank können künftig Läufe scheitern lassen.
- **Token-Wechsel** (Logger-API) erfordert einen Neustart beider Container. Eine Rotation gibt es nur von Hand.

## Maßnahmen des Betreibers

Zwingend (für das Update 0.9.0/0.2.0):

1. **Homeserver / Portainer:** neue Stack-Texte übernehmen. Beim Logger-Stack ist die Token-Datei
   **vorher** anzulegen, sonst ist die Logger-API gesperrt und MIRA zeigt „Token abgelehnt“. Die
   Messung läuft trotzdem weiter.
2. **Token-Dateien anlegen** (je eine in den Secrets von MIRA und Logger, gleicher Inhalt).

Dringend empfohlen:

3. **HTTPS-Pflicht einschalten:** `MIRA_PUBLIC_URL` und eine enge `MIRA_TRUST_PROXY` setzen (Schritt 4 im Deployment).
4. **Passwort ändern** (Konfiguration › MIRA › Konto), falls MIRA bisher auch über
   `http://<MIRA_IP>` benutzt wurde. Das Startpasswort danach aus `secrets/admin_password.txt` löschen.

Optional:

5. **Nginx Proxy Manager:**
   - Proxy-Host für `<MIRA_HOSTNAME>` mit „Force SSL“.
   - Ziel bleibt `http://mira:80`.
   - NPM sendet `X-Forwarded-Proto` und `X-Forwarded-For` von sich aus; eigene Header sind nicht nötig.
   - HSTS setzt MIRA selbst, in NPM ist es nicht nötig.
6. **Enges Proxy-Vertrauen:** NPM eine feste Adresse im Backend-Netz geben (in dessen Stack, falls das
   Netz ein festes Subnetz hat) oder ein eigenes kleines Netz nur für NPM und MIRA anlegen (z. B.
   `/29`). Dann `MIRA_TRUST_PROXY` auf diese Adresse bzw. dieses Netz.
7. **OPNsense:** keine Änderung nötig. Optional: Clients aus anderen VLANs bzw. dem VPN nur
   `<MIRA_HOSTNAME>` (Proxy, 443) erlauben, nicht TCP 80 auf `<MIRA_IP>`. Verkehr im Server-VLAN selbst
   läuft nicht über die OPNsense.
8. **KI-Server / MIRA-Agent:** keine Änderung nötig (Agent unverändert 0.2.0, Freigabe weiterhin `<MIRA_IP>`).
9. **Shelly-Logger:** nach dem Update prüfen, ob in den Protokollen `auth: "token"` steht.
10. **Getrenntes Sicherungsziel:** Ordner auf einem anderen Volume/Datenträger anlegen (UID 1000,
    Rechte `700`), im Stack als Volume `…:/backup-copy` einhängen und
    `MIRA_BACKUP_COPY_DIR=/backup-copy` bzw. `LOGGER_BACKUP_COPY_DIR=/backup-copy` setzen.
    Zusätzlich empfohlen: die Ordner `backups/` in die Sicherung des Homeservers aufnehmen.

## Deployment

Reihenfolge so gewählt, dass in keinem Schritt Anmeldung oder Messung verloren gehen. Platzhalter
wie in der README; `APPDATA=<APPDATA_PFAD>`.

**0. Sicherung vor dem Update** (per SSH auf dem Homeserver; die Container laufen weiter):

```bash
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$APPDATA/update-sicherung-$STAMP"
cp -a "$APPDATA/mira/data/backups" "$APPDATA/update-sicherung-$STAMP/mira-backups"
cp -a "$APPDATA/mira-shelly-logger/data/backups" "$APPDATA/update-sicherung-$STAMP/logger-backups"
ls -l "$APPDATA/update-sicherung-$STAMP"/*   # Sicherungen von heute bzw. gestern vorhanden?
```

Für einen Stand unmittelbar vor dem Update kann im laufenden Betrieb eine konsistente Kopie erzeugt
werden (`sqlite3` auf dem Homeserver nötig):
`sqlite3 "$APPDATA/mira/data/mira.db" ".backup '$APPDATA/update-sicherung-$STAMP/mira.db'"`.

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
- Systeme › Shelly Plug zeigt „verbunden“: MIRA sendet jetzt das Token, der alte Logger ignoriert es.
- In der Glocke erscheint „HTTPS wird nicht erzwungen“ – das ist erwartet.

**3. Logger aktualisieren** (Stack „mira-shelly-logger“):

1. Inhalt von [`deploy/shelly-logger-stack.yml`](../../deploy/shelly-logger-stack.yml) übernehmen.
2. `LOGGER_VERSION=0.2.0` setzen, „Update the stack“ mit „Re-pull image“.

Prüfen:

- Container `healthy`.
- Protokoll „Shelly-Logger gestartet“ mit `auth: "token"`.
- In MIRA weiterhin „verbunden“.
- Der Verbrauch von heute ist vorhanden (die kurze Pause wird aus dem Zählerstand rekonstruiert).

**4. HTTPS-Pflicht einschalten:**

1. Adresse des Proxys im Proxy-Netz ermitteln:
   `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <NPM_CONTAINER>`.
2. Im Stack „mira“ setzen:
   - `MIRA_TRUST_PROXY=<PROXY_IP>` – oder ein kleines Netz. Das bisherige große Subnetz funktioniert
     auch, MIRA warnt dann aber beim Start.
   - `MIRA_PUBLIC_URL=https://<MIRA_HOSTNAME>`
3. Stack aktualisieren.

Prüfen:

- `https://<MIRA_HOSTNAME>` – Anmeldung funktioniert, die Warnung in der Glocke ist verschwunden.
- `http://<MIRA_IP>` leitet auf `https://<MIRA_HOSTNAME>` um.
- `curl -i -X POST http://<MIRA_IP>/api/v1/auth/login` liefert `403 https_required`.

**5. Passwort ändern** (Konfiguration › MIRA › Konto), danach `secrets/admin_password.txt` löschen.

**6. Optional:** getrenntes Sicherungsziel einrichten (siehe [Maßnahmen](#maßnahmen-des-betreibers), Punkt 10).

**Wenn nach Schritt 4 keine Anmeldung möglich ist** (Meldung „MIRA ist nur über HTTPS erreichbar“
trotz HTTPS-Aufruf): `MIRA_TRUST_PROXY` passt nicht zur Adresse des Proxys. `MIRA_PUBLIC_URL` leeren
und den Stack aktualisieren (sofort wieder wie in Schritt 2), dann die Adresse prüfen.

## Rollback

| Situation | Vorgehen |
| --- | --- |
| Probleme nur mit der HTTPS-Pflicht | `MIRA_PUBLIC_URL` leeren → Stack aktualisieren |
| Logger-API gesperrt („Token abgelehnt“) | Token-Dateien prüfen (gleicher Inhalt, mind. 32 Zeichen, lesbar für UID 1000) und beide Container neu starten – oder im Logger-Stack `LOGGER_API_TOKEN_FILE=` (leer) setzen |
| MIRA 0.9.0 insgesamt zurücknehmen | `MIRA_VERSION=0.8.1`, Stack-Text der Version 0.8.1 (`deploy/portainer-stack.yml` aus dem Tag `v0.8.1`) → „Update the stack“. Die Datenbank ist kompatibel (keine neuen Migrationen); ein in 0.9.0 geändertes Passwort bleibt gültig. |
| Logger 0.2.0 zurücknehmen | `LOGGER_VERSION=0.1.1`, Stack-Text aus dem Tag `shelly-logger-v0.1.1` **ohne** `LOGGER_API_TOKEN_FILE` (0.1.1 beendet sich bei fehlender Datei). Die Datenbank ist kompatibel. In MIRA bleibt das Token gesetzt; das schadet nicht. |
| Datenbank beschädigt | Wiederherstellung wie in der [README](../../README.md#sicherung-und-wiederherstellung) bzw. [Logger-README](../../shelly-logger/README.md) aus `backups/` oder aus der Update-Sicherung (Schritt 0) |

Fehlgeschlagene Sicherungen zeigt MIRA in der Glocke („Datensicherung fehlgeschlagen“), der Logger
im Protokoll („Hintergrundaufgabe fehlgeschlagen“, Job `backup`). Vorhandene Sicherungen bleiben in
beiden Fällen unverändert. Die Ursache (Speicherplatz, Rechte, Datenträger) steht im Protokoll; die
nächste tägliche Sicherung läuft automatisch.
