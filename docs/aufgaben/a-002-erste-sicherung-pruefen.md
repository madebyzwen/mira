# A-002 – Erste nächtliche Sicherung prüfen

- Status: 📝 notiert
- Notiert: 2026-11-06
- Verwandt: [Stufe 3](../entwicklung/stufe-03-messwert-historie.md) (abgeschlossen, Prüfung der Sicherung nachgereicht)

## Ziel

Nachweisen, dass MIRA auf Asgard die Datenbank täglich um 03:30 Uhr (Ortszeit)
sichert und die Sicherung brauchbar ist.

## Prüfschritte (per SSH auf Asgard)

1. Ordner ansehen – erwartet: eine Datei `mira-JJJJ-MM-TT.db` mit dem Datum des Tages,
   Besitzer UID 1000, einige hundert KB bis wenige MB groß, **ohne** `-wal`/`-shm` daneben:

   ```bash
   ls -la "$APPDATA/data/backups/"
   ```

2. Uhrzeit im Protokoll prüfen (Portainer → Container `mira` → Logs):
   - schon jetzt möglich: beim Start steht „Tägliche Aufgabe geplant“ mit `job: core.sicherung`
     und `next: … 03:30:00 GMT+0100` – zeigt es GMT+0000, greift `TZ` im Stack nicht;
   - nach der Nacht: „Datenbank gesichert“ mit Datei und Größe, kurz nach 03:30 Uhr.

3. Nach 8 Tagen: höchstens 7 Dateien im Ordner (Rotation).

## Bei Problemen

- Keine Datei: Logs auf „Hintergrundaufgabe fehlgeschlagen“ mit `job: core.sicherung` prüfen; Schreibrechte von UID 1000 auf `data/`.
- Falsche Uhrzeit: `TZ: ${TZ:-Europe/Berlin}` im Stack vorhanden? Stack neu eingefügt?

## Optional

Wiederherstellung einmal probehalber durchspielen (README, „Sicherung und Wiederherstellung“),
z. B. mit einer Kopie in einem Testordner statt am laufenden System.
