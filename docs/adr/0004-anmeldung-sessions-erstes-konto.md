# 0004 – Anmeldung mit Server-Sessions, erstes Konto per Secret-Datei

- Status: angenommen
- Datum: 2026-11-05

## Kontext

MIRA braucht echte serverseitige Anmeldung (Single-User). Ein Setup-Assistent
ist ausdrücklich nicht gewünscht; trotzdem muss es ein erstes Konto geben.

## Entscheidung

- **Server-Sessions** statt JWT: zufälliges Token im `HttpOnly`/`SameSite=Strict`-Cookie,
  in SQLite nur der SHA-256-Hash. Sessions sind serverseitig widerrufbar (Abmelden).
- Passwort-Hashing mit **scrypt** aus Node-Bordmitteln.
- Login-Sperre im Speicher (IP und Benutzername getrennt).
- **Erstes Konto** beim allerersten Start aus `MIRA_ADMIN_USER`,
  `MIRA_ADMIN_DISPLAY_NAME` und `MIRA_ADMIN_PASSWORD_FILE` (Docker-Secret,
  mind. 12 Zeichen). Existiert bereits ein Benutzer, werden die Variablen ignoriert.

## Alternativen

- **JWT**: nicht widerrufbar ohne zusätzliche Sperrliste, kein Vorteil bei einem Server.
- **Setup-Assistent**: ausgeschlossen.
- **Passwort als Umgebungsvariable**: wäre in `docker inspect` sichtbar.

## Konsequenzen

- Nach einem Neustart bleiben Sessions gültig; die Login-Sperre beginnt neu.
- Passwortänderung über die Oberfläche fehlt noch (geplant unter Konfiguration › MIRA).
