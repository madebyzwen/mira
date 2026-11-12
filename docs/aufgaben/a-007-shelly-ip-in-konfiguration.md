# A-007 – Konfiguration › Systeme › Shelly Plug: Adresse des Shelly statt des Loggers anzeigen

- Status: 📝 notiert
- Notiert: 2026-11-10

## Ziel

In der Karte „Shelly Plug“ unter Konfiguration › Systeme steht in der ersten Zeile
**„Shelly-Logger“** mit der internen Docker-Adresse des Loggers (`172.31.250.10:8090`).
Für den Benutzer ist das nicht schlüssig – unter der Überschrift „Shelly Plug“ erwartet man die
Adresse des Geräts selbst.

Gewünscht: Die Zeile heißt **„Shelly-IP“** und zeigt die Adresse des eigentlichen Shelly Plug
(im IoT-VLAN, `<SHELLY_IP>`).

## Kontext

- MIRA kennt die Adresse des Shelly bisher nicht: Es spricht nur mit dem Logger
  (`MIRA_SHELLY_LOGGER_URL`). Die Adresse des Shelly kennt nur der Logger (`LOGGER_SHELLY_URL`).
- Die Logger-API liefert in `device` derzeit ID, Modell, Generation, Firmware und Messkomponente –
  aber keine Adresse.
- Die Verbindung zum Logger bleibt in der Zeile „Verbindung“ sichtbar („verbunden · Version …“).

## Lösungsweg (Vorschlag)

1. **Shelly-Logger:** In `device` (Vertrag `meterDeviceSchema` in `shared/src/shellyLogger.ts`)
   zusätzlich die Adresse aus `LOGGER_SHELLY_URL` liefern (z. B. Feld `address`, nur Host,
   ohne Zugangsdaten). Als optionales Feld abwärtsverträglich → Logger 0.2.0.
2. **MIRA:** Zeile „Shelly-Logger“ in „Shelly-IP“ umbenennen und `live.device.address` anzeigen;
   solange ein älterer Logger keine Adresse meldet: „–“. Die interne Logger-Adresse wird in der
   Oberfläche **nirgends** mehr angezeigt (Entscheidung 2026-11-10) – sie ist eine reine
   Betriebsangabe und steht im Stack.
3. Optional dieselbe Angabe in Systeme › Shelly Plug › „Gerätedetails & Messung“.

## Entscheidungen

- 2026-11-10: Die Adresse des Loggers im Docker-Netz wird in MIRA nicht angezeigt – auch nicht als
  Hinweis oder Tooltip. Die Zeile „Verbindung“ zeigt weiter „verbunden · Version …“ bzw. den Fehler.
