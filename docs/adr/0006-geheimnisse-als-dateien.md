# 0006 – Geheimnisse als Dateien, nicht in SQLite

- Status: angenommen
- Datum: 2026-11-05

## Kontext

MIRA benötigt Geheimnisse: Startpasswort, ab Stufe 2 das Token und den
Zertifikats-Fingerprint für die Odin-API, später ggf. Shelly-Passwort und
OPNsense-API-Schlüssel. Das Briefing verlangt, sie nicht ungeschützt in SQLite
abzulegen.

## Entscheidung

- Geheimnisse liegen als **einzelne Dateien** vor: als Docker-Secret
  (`/run/secrets/…`) oder in `/data/secrets/` mit Rechten 600.
- Variablen enthalten nur den **Pfad** (`…_FILE`), nie den Wert.
- SQLite speichert höchstens einen Verweis (z. B. `token_ref`).
- Das Repository enthält keine Geheimnisse; `deploy/secrets/` ist in `.gitignore`.

## Alternativen

- **Verschlüsselt in SQLite** mit Hauptschlüssel aus einer Datei: verschiebt das
  Problem nur auf den Hauptschlüssel und erhöht die Komplexität.
- **Umgebungsvariablen**: in `docker inspect` und Prozesslisten sichtbar.

## Konsequenzen

- Backups von `/data` enthalten Geheimnisse und müssen entsprechend geschützt werden.
- Rotation eines Geheimnisses = Datei ersetzen und Container neu starten.
