# Stufe 4 – Shelly Plug: Leistung, Verbrauch, Kosten

- Status: ⏳ Konzept freigegeben (2026-11-06), Angaben zum Gerät stehen noch aus
- Grundlage: [Datenmodell](../architektur/datenmodell.md), [Stufe 3](stufe-03-messwert-historie.md) (Abfrage, Verdichtung, Verlauf)

## Ziel

MIRA liest den Shelly Plug, der den Stromverbrauch des KI-Servers misst, lokal und
**nur lesend** aus. Systeme › Shelly zeigt die **aktuelle Leistungsaufnahme live**
sowie Verbrauch, Kosten und den Verlauf. Die Beispieldaten auf der Shelly-Seite und
im Dashboard-Widget „Verbrauch“ werden durch echte Werte ersetzt.

## Entscheidung: Modul in MIRA, kein eigener Container

| | Eigener Container | **Teil von MIRA (gewählt)** |
| --- | --- | --- |
| Betrieb | zweiter Dienst im Stack, eigene Updates und Protokolle | nichts Zusätzliches, kommt mit jedem MIRA-Update |
| Datenbank | zwei Prozesse schreiben in dieselbe SQLite-Datei oder brauchen eine eigene Schnittstelle | ein Prozess, ein Datenmodell, eine Sicherung |
| Live-Ansicht | Live-Werte müssten zusätzlich an MIRA übergeben werden | Werte liegen direkt im Speicher von MIRA |
| Code | Abfrage, Verdichtung und Offline-Erkennung doppelt | nutzt die Mechanik aus Stufe 3 |

Ein eigener Dienst wäre nur sinnvoll, wenn MIRA den Shelly nicht direkt erreichen
könnte. Passt zum modularen Monolithen ([ADR 0001](../adr/0001-modularer-monolith-typescript-fastify.md)).
Der Shelly wird – wie im Datenmodell vorgesehen – ein System der Art `power_meter`
im Modul `systems`.

## Ablauf

```
Shelly ──HTTP (lokal, nur lesend)──▶ MIRA-Backend: Shelly-Monitor (alle 2 s)
                                       ├─▶ Speicher ──▶ Live-Ansicht (Browser fragt alle 2 s)
                                       └─▶ Minuten-Verdichtung ──▶ SQLite ──▶ Verlauf, Verbrauch, Kosten
```

| | Festlegung |
| --- | --- |
| Erfassung | alle **2 Sekunden** im Backend, **unabhängig davon, ob die Weboberfläche offen ist** – wie beim KI-Server |
| Live-Anzeige | Browser fragt alle 2 s bei MIRA (nicht beim Shelly), solange die Seite sichtbar ist |
| „Offline“ | nach **10 Sekunden** ohne Antwort; Zeiten ohne Messung bleiben im Verlauf als **Lücke** sichtbar |
| Verbindung | offen gehalten (Keep-Alive), höchstens eine Anfrage gleichzeitig |

### Shelly-API

| Generation | Abfrage | Werte |
| --- | --- | --- |
| Gen 2 / Gen 3 | `GET /rpc/Switch.GetStatus?id=0` | `apower` (W), `voltage` (V), `current` (A), `temperature.tC`, `aenergy.total` (Wh) |
| Gen 1 | `GET /status` | `meters[0].power` (W), `meters[0].total` (Wattminuten), `temperature` |
| alle | `GET /shelly` (ohne Anmeldung) | Modell, Generation, Firmware, ob ein Passwort gesetzt ist – MIRA erkennt die Generation selbst |

- **Nur lesend:** MIRA ruft ausschließlich Status-Abfragen auf, nie Schalt- oder
  Konfigurationsbefehle (Test stellt das sicher). Hinweis: Der Shelly kennt keinen
  Nur-Lese-Benutzer – wer das Passwort hat, könnte schalten. Das Passwort wird daher wie
  das Token des MIRA-Agents als Datei unter `secrets/` abgelegt ([ADR 0006](../adr/0006-geheimnisse-als-dateien.md)).
- **Anmeldung:** Gen 2/3 mit Digest-Authentifizierung (SHA-256) – das Passwort geht nie im
  Klartext über das Netz. Gen 1 nutzt Basic-Auth.
- **Verschlüsselung:** Der Shelly bietet lokal nur HTTP. Die Messwerte selbst sind
  unverschlüsselt; im eigenen Netz mit Firewall-Regel (nur MIRA → Shelly) vertretbar.

## Verbrauch und Kosten

- **Verbrauch** aus dem **Energiezähler** des Shelly, nicht aus der Leistung hochgerechnet
  (genauer, keine Lücken durch ausgefallene Abfragen). Je Minute wird die Differenz in Wh
  gespeichert. Springt der Zähler zurück (Neustart des Shelly), wird das erkannt; es geht
  höchstens die laufende Minute verloren.
- **Kosten** = Verbrauch × Strompreis. Der Preis wird **mit Gültigkeitsdatum** gespeichert:
  Bei einem Tarifwechsel bleiben die Kosten der Vergangenheit richtig.
- Anzeige: Verbrauch und Kosten **heute** und **im laufenden Monat** (inkl. der laufenden Minute).

## Datenbank (Modul `systems`, Migration 3)

| Tabelle | Inhalt | Aufbewahrung |
| --- | --- | --- |
| `power_meters` | system_id, Modell, Generation, misst_system_id (KI-Server) | dauerhaft |
| `power_samples` | system_id, ts (Minutenbeginn, UTC), samples, Leistung Mittel/Min/Max (W), Spannung Mittel (V), Energie (Wh), Gerätetemperatur | 7 Tage |
| `power_samples_hourly` | wie oben, je Stunde (gewichtet) | 365 Tage |
| `power_energy_daily` | system_id, Tag (Ortszeit), Energie (Wh) | **dauerhaft** – wenige Zeilen pro Jahr, für Monats- und Jahreskosten |
| `energy_prices` | gültig ab (Datum), Preis (ct/kWh) | dauerhaft |

Die Verdichtung (Minute → Stunde), Aufbewahrung und Verlaufsabfrage aus Stufe 3 werden
dafür **allgemein** gemacht, sodass KI-Server und Shelly denselben Code nutzen
(Tabellen- und Feldbeschreibung je Messreihe).

## Konfiguration

| Was | Wo | Warum |
| --- | --- | --- |
| Adresse des Shelly | Stack: `MIRA_SHELLY_URL` (z. B. `http://<SHELLY_IP>`) | wie die Verbindung zum KI-Server; Bearbeitung in der Oberfläche später |
| Passwort | Datei `secrets/shelly_password.txt`, Stack: `MIRA_SHELLY_PASSWORD_FILE` | Geheimnisse als Datei (ADR 0006); leer/fehlend = ohne Passwort |
| Strompreis | Oberfläche: Konfiguration › Systeme › Shelly (Preis ab Datum) | ändert sich gelegentlich, braucht Historie; Änderung im Audit-Log |

## API

| Endpunkt | Inhalt |
| --- | --- |
| `GET /api/v1/systems/shelly` | Status, Geräteinfo, Live-Werte (Leistung, Spannung, Strom, Temperatur), Verbrauch und Kosten heute/Monat |
| `GET /api/v1/systems/shelly/history?range=1h\|24h\|7d\|30d` | Leistung (Mittelwert) im einheitlichen Zeitraster (`HISTORY_GRID`) |
| `GET/PUT /api/v1/settings/energy-price` | aktueller Preis und Historie; neuer Preis ab Datum |

## Oberfläche

- **Systeme › Shelly:** aktuelle Leistung groß (live, alle 2 s), dazu Spannung, Strom,
  Gerätetemperatur und Online-Status; Verbrauch und Kosten heute/Monat; Verlauf der Leistung
  (1 h / 24 h / 7 / 30 Tage, Lücken, Werteanzeige beim Überfahren). Kennzeichnung
  „Beispieldaten“ entfällt.
- **Dashboard:** Widget „Verbrauch“ mit echten Werten.
- **Konfiguration › Systeme › Shelly:** Verbindungsstatus, erkanntes Modell/Firmware, Strompreis.
- Später möglich: aktuelle Leistung auch auf der Seite des KI-Servers (der Shelly misst den KI-Server).

## Netz und Infrastruktur

- Liegt der Shelly in einem anderen VLAN: Regel in der OPNsense `<MIRA_IP>` → `<SHELLY_IP>`,
  TCP 80 (Einrichtung durch den Betreiber nach Anleitung).
- Shelly: feste Adresse (DHCP-Reservierung) und – empfohlen – ein Passwort für die lokale Oberfläche.
- Keine Änderung am KI-Server.

## Tests

Gegen einen nachgebildeten Shelly (Gen 1 und Gen 2/3, mit und ohne Passwort):
Erkennung der Generation, Digest-Anmeldung, nur Status-Abfragen (keine Schaltbefehle),
Offline nach Frist, Minuten-Verdichtung, Energie aus Zählerdifferenzen inkl.
Zähler-Rücksprung, Tagesverbrauch, Kosten bei Preiswechsel, Verlauf je Zeitraum.

## Erfolgskriterien

| Kriterium |
| --- |
| Systeme › Shelly zeigt die aktuelle Leistung, alle 2 s aktualisiert. |
| Verbrauch heute stimmt mit der Anzeige in der Shelly-App überein (± Rundung). |
| Kosten heute/Monat ergeben sich aus Verbrauch und eingestelltem Preis; ein Preiswechsel ändert vergangene Kosten nicht. |
| Verlauf 1 h / 24 h / 7 / 30 Tage mit Lücken, wenn der Shelly nicht erreichbar war. |
| MIRA sendet nachweislich keine Schaltbefehle. |
| Alle Tests grün; Auslieferung als neues Release (Update nur in Portainer). |

## Offene Angaben (vom Betreiber, nächste Sitzung)

| Angabe | Wofür |
| --- | --- |
| Modell und Generation (z. B. Plus Plug S, Plug S Gen 3) | Abfrage, Tests |
| Passwort gesetzt? Falls nein: setzen? | Anmeldung |
| VLAN des Shelly (gleiches Netz wie MIRA oder z. B. IoT) | Firewall-Regel |
| Strompreis in ct/kWh und Gültigkeitsbeginn | Kosten |

## Nicht enthalten

- Schalten des Shelly (bewusst nicht – nur lesend).
- Bearbeitung der Shelly-Adresse in der Oberfläche (zunächst über den Stack).
- Grundgebühr und Tarifmodelle mit Tag/Nacht-Preisen.
