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
| Cookie | `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` automatisch bei HTTPS (`MIRA_COOKIE_SECURE=auto`) |
| Login-Sperre | nach `MIRA_LOGIN_MAX_FAILURES` (5) Fehlversuchen in `MIRA_LOGIN_WINDOW_MINUTES` (15), getrennt nach IP und Benutzername |
| Benutzer-Enumeration | unbekannte Benutzer werden genauso geprüft und beantwortet wie falsche Passwörter |
| Zugriffsschutz | jede Route unter `/api/` außer Login/Logout erfordert eine Session – auch unbekannte Pfade |
| Cross-Site | `SameSite=Strict` plus Ablehnung ändernder Anfragen mit fremdem `Origin` |
| Header | CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` |
| Audit | Anmeldung (Erfolg/Fehlversuch/Sperre) und Abmeldung im Audit-Log, ohne Passwörter |
| Erstes Konto | einmalig aus `MIRA_ADMIN_USER` + `MIRA_ADMIN_PASSWORD_FILE` (mind. 12 Zeichen); bei vorhandenen Benutzern ignoriert |

## Betrieb hinter dem Reverse Proxy

- `MIRA_TRUST_PROXY` auf die Adresse des Proxys setzen, damit MIRA HTTPS und die
  echte Client-IP erkennt (wichtig für `Secure`-Cookie, Login-Sperre und Audit).
- Eigener Hostname für MIRA (`<MIRA_HOSTNAME>`), kein Unterpfad.

## Geheimnisse

Siehe [ADR 0006](../adr/0006-geheimnisse-als-dateien.md): Geheimnisse liegen als
Dateien (Docker-Secrets bzw. `/data/secrets`, Rechte 600), SQLite speichert nur
Verweise. Der Container läuft als unprivilegierter Benutzer (UID 1000) mit
schreibgeschütztem Dateisystem; neue Dateien werden mit Umask 077 angelegt.

## Kommunikation mit dem KI-Server

Siehe [MIRA-Agent](agent.md).

## Offene Punkte

- Passwort ändern über die Oberfläche (Konfiguration › MIRA) – noch nicht umgesetzt;
  bis dahin Neuanlage über leeres Datenverzeichnis.
- Backup-Konzept für `/data` (inkl. Secrets) – spätestens mit Stufe 3.
