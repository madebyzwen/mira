# Sicherheitskonzept

## Grundsätze

- MIRA ist nur im Heimnetz bzw. über WireGuard erreichbar – keine Veröffentlichung
  über Cloudflare Tunnel oder einen frei erreichbaren Reverse Proxy.
- Das Frontend erhält nie Zugangsdaten, Tokens für den KI-Server oder Schlüssel und spricht
  ausschließlich mit dem MIRA-Backend.
- Das Repository ist öffentlich: keine Geheimnisse, keine echten Netzwerkdaten.

## Anmeldung (Stufe 1, umgesetzt)

| Thema | Umsetzung |
| --- | --- |
| Passwörter | scrypt (N=2¹⁵, r=8, p=1), Salt pro Passwort, Parameter im Hash gespeichert |
| Sessions | Zufallstoken (256 Bit) im Cookie, in der DB nur SHA-256-Hash; gleitender Ablauf (`MIRA_SESSION_TTL_HOURS`, Standard 7 Tage) |
| Cookie | `HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` immer mit HTTPS-Pflicht (`MIRA_PUBLIC_URL`), sonst automatisch bei HTTPS (`MIRA_COOKIE_SECURE=auto`) |
| HTTPS-Pflicht | mit `MIRA_PUBLIC_URL`: Seiten über HTTP → `308` auf HTTPS, API über HTTP → `403 https_required` (ohne Verarbeitung, Audit `auth.insecure_transport`), HSTS; `/health` ausgenommen ([ADR 0011](../adr/0011-https-pflicht-und-enges-proxy-vertrauen.md)) |
| Passwort ändern | Konfiguration › MIRA › Konto: aktuelles Passwort nötig (Login-Sperre gilt), mind. 12 Zeichen, neuer Hash und Beenden **aller** Sessions in einer Transaktion; „Alle Sitzungen beenden“ einzeln möglich |
| Login-Sperre | nach `MIRA_LOGIN_MAX_FAILURES` (5) Fehlversuchen in `MIRA_LOGIN_WINDOW_MINUTES` (15), getrennt nach IP und Benutzername; Speicher begrenzt (10 000 Einträge) |
| Benutzer-Enumeration | unbekannte Benutzer werden genauso geprüft und beantwortet wie falsche Passwörter |
| Zugriffsschutz | jede Route unter `/api/` außer Login/Logout erfordert eine Session – auch unbekannte Pfade |
| Cross-Site | `SameSite=Strict` plus Ablehnung ändernder Anfragen mit fremdem `Origin` (mit HTTPS-Pflicht exakt: Protokoll, Host, Port) |
| Header | CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (mit HTTPS-Pflicht) |
| Zeitlimits | Anfrage höchstens 30 s, Body höchstens 64 KiB |
| Audit | Anmeldung (Erfolg/Fehlversuch/Sperre), Abmeldung, Passwortänderung, Beenden aller Sitzungen, abgelehnte Anmeldung über HTTP – ohne Passwörter |
| Erstes Konto | einmalig aus `MIRA_ADMIN_USER` + `MIRA_ADMIN_PASSWORD_FILE` (mind. 12 Zeichen); bei vorhandenen Benutzern ignoriert |

## Betrieb hinter dem Reverse Proxy

- `MIRA_TRUST_PROXY` auf die Adresse des Proxys setzen (oder ein kleines Netz), damit MIRA HTTPS und
  die echte Client-IP erkennt (wichtig für `Secure`-Cookie, HTTPS-Pflicht, Login-Sperre und Audit).
  Einträge werden beim Start geprüft; große Netze und `true` erzeugen eine Warnung, `true` ist mit
  HTTPS-Pflicht nicht erlaubt.
- `MIRA_PUBLIC_URL=https://<MIRA_HOSTNAME>` schaltet die HTTPS-Pflicht ein. Ohne die Variable bleibt
  MIRA auch über `http://<MIRA_IP>` erreichbar und warnt in der Glocke.
- Eigener Hostname für MIRA (`<MIRA_HOSTNAME>`), kein Unterpfad.

## Container

MIRA und Shelly-Logger: UID 1000, `read_only`, `tmpfs /tmp`, `cap_drop: ALL`,
`no-new-privileges`. Laufzeit-Images ohne npm/npx/corepack, Alpine-Pakete beim Bau aktualisiert.
CI prüft Abhängigkeiten (`npm audit`, ab „high“) und Images (Trivy, HIGH/CRITICAL mit Korrektur);
veröffentlicht wird nur nach bestandener Prüfung.

## Shelly-Logger

Lese-API nur im internen Netz `mira-intern` (kein Port auf der macvlan-Adresse), zusätzlich
Bearer-Token (`LOGGER_API_TOKEN_FILE`, mind. 32 Zeichen, gleiches Token bei MIRA in
`MIRA_SHELLY_LOGGER_TOKEN_FILE`). Ist die Token-Datei nicht nutzbar, misst der Logger weiter und
sperrt die API (außer `/health`).

## Geheimnisse

Siehe [ADR 0006](../adr/0006-geheimnisse-als-dateien.md): Geheimnisse liegen als
Dateien (Docker-Secrets bzw. `/data/secrets`, Rechte 600), SQLite speichert nur
Verweise. Der Container läuft als unprivilegierter Benutzer (UID 1000) mit
schreibgeschütztem Dateisystem; neue Dateien werden mit Umask 077 angelegt.

## Kommunikation mit dem KI-Server

Siehe [MIRA-Agent](agent.md).

## Datensicherung

Tägliche, geprüfte Sicherung (Integrität, Migrationsstand) von MIRA und Logger; optional eine
zweite Kopie auf ein getrenntes Ziel (`MIRA_BACKUP_COPY_DIR`, `LOGGER_BACKUP_COPY_DIR`).
Fehlgeschlagene Sicherungen meldet MIRA in der Glocke. Sicherungen enthalten Passwort- und
Session-Hashes und sind wie Geheimnisse zu behandeln.

## Offene Punkte

- Direkter Zugang `http://<MIRA_IP>` bleibt als Umleitung offen; ein Client, der Zugangsdaten
  ohne Seitenaufruf direkt per HTTP sendet, überträgt sie im Klartext (wird abgelehnt und
  protokolliert). Siehe [Wartung W1](../entwicklung/security-hardening-review.md#verbleibende-risiken).
- Die Secrets (`/secrets`) sind nicht Teil der Sicherung durch MIRA – sie gehören in die Sicherung des Homeservers.
