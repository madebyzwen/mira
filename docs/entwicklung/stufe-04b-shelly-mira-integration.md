# Stufe 4b – Shelly: Anbindung in MIRA

- Status: 🔍 umgesetzt, Ausrollen und Abnahme ausstehend (2026-11-10, Ziel MIRA 0.8.0)
- Voraussetzung: [Stufe 4a – Shelly-Logger](stufe-04a-shelly-logger.md) in Betrieb (seit 2026-11-10)
- Entscheidung: [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md)

## Ziel

MIRA zeigt Leistung, Verbrauch, Kosten und Verlauf aus dem Shelly-Logger an. MIRA fragt
dafür ausschließlich die interne Lese-API des Loggers ab – nie den Shelly selbst.
Die Beispieldaten auf der Shelly-Seite und im Dashboard-Widget „Verbrauch“ entfallen.

## Festlegungen (2026-11-10)

| | Festlegung |
| --- | --- |
| Netz | Der MIRA-Stack tritt dem internen Netz `mira-intern` bei (`external: true`); der Logger ist dort unter seiner festen Adresse `http://172.31.250.10:8090` erreichbar. Keine Ports veröffentlicht. **Nicht** über den Container-Namen: MIRA und Logger teilen sich auch das macvlan-Netz, der Name kann zur macvlan-Adresse aufgelöst werden (dort kein Port – im Betrieb am 2026-11-10 aufgefallen, behoben in MIRA 0.8.1). |
| Konfiguration | `MIRA_SHELLY_LOGGER_URL` (Stack: `http://172.31.250.10:8090`), optional `MIRA_SHELLY_LOGGER_TOKEN_FILE` – vorerst ohne Token, die Netztrennung genügt |
| Live | Shelly-Seite: jede Sekunde, nur solange sichtbar (`usePolling`); Dashboard-Kachel alle 2 s. MIRA reicht den Live-Wert des Loggers durch – kein WebSocket/SSE |
| Kosten | Strompreis (Arbeitspreis brutto, ct/kWh) mit Gültigkeitsdatum in MIRA; Kosten **je Kalendertag** mit dem an diesem Tag gültigen Preis – im Jahr über die Tageswerte jedes Monats; Tage ohne Preis → „unvollständig“ |
| Zwischenspeicher | Verbrauch laufender Zeiträume 15 s, abgeschlossene dauerhaft; Verlauf 30 s; Datenbankstatistik 60 s |
| Fehler | Logger nicht erreichbar → `503 service_unavailable` bzw. `live: null` – nie alte Werte als aktuell; „KI-Server schläft“ ist kein Fehler der Messung |

## Umsetzung

| Was | Wo |
| --- | --- |
| Verträge (Status, Verbrauch mit Kosten, Zusammenfassung, Strompreise) | `shared/src/shellyPlug.ts` |
| Client für die Logger-API (Keep-Alive, Zeitlimit 1,5 s, Prüfung gegen die Verträge) | `backend/modules/systems/shelly/loggerClient.ts` |
| Zustand, Kosten, Zwischenspeicher | `backend/modules/systems/shelly/shellyService.ts` |
| Strompreise | `backend/modules/systems/shelly/energyPrices.ts`, Migration `systems` 4 (`energy_prices`, System `shelly-plug`) |
| Routen | `backend/modules/systems/shelly/routes.ts` – `GET /api/v1/systems/shelly-plug`, `…/summary`, `…/consumption?period=…&date=…`, `…/history?range=…`, `…/database`, `GET/POST …/prices`, `DELETE …/prices/:id` (Audit-Log) |
| Shelly-Seite | `frontend/src/pages/systems/ShellyPlugPage.tsx` |
| Dashboard-Kachel „Verbrauch“ | `frontend/src/pages/DashboardPage.tsx` |
| Konfiguration › Systeme › Shelly Plug (Verbindung, Datenbank, Strompreis) | `frontend/src/pages/config/ConfigSystemsPage.tsx` |

## Geprüft (2026-11-10)

- Backend-Tests gegen den **echten Logger** mit simuliertem Shelly: Live-Wert, Systemliste,
  Verbrauch mit Kosten, Zusammenfassung, Verlauf, Datenbankstatistik; Strompreise (Prüfung,
  gleicher Tag ersetzt, Löschen, Audit-Log, nur angemeldet); Logger nicht eingerichtet bzw. nicht
  erreichbar; Kosten mit Preiswechsel mitten im Monat (tagesgenau). Alle Tests grün.
- Zusammenspiel in Containern (simulierter Shelly → Logger-Image → MIRA-Image) mit Screenshots
  von Shelly-Seite, Dashboard und Konfiguration bei 1480 × 940.

## Ausrollen (nach Freigabe)

1. Release MIRA 0.8.0 (Image wie gewohnt; der Logger bleibt bei 0.1.1).
2. Portainer → Stack `mira` → Inhalt von [`deploy/portainer-stack.yml`](../../deploy/portainer-stack.yml)
   übernehmen (neu: Netz `mira-intern`, Variable `MIRA_SHELLY_LOGGER_URL`), „Update the stack“ mit
   „Re-pull image“. Der Logger-Stack muss laufen (er legt `mira-intern` an).
3. Konfiguration › Systeme › Shelly Plug: Strompreis mit Gültigkeitsdatum eintragen.

## Abnahme

- [ ] Shelly-Seite: Live-Leistung jede Sekunde, Werte passend zur Shelly-App
- [ ] Verbrauch heute/Woche/Monat/Jahr und Kosten plausibel (Strompreis eingetragen)
- [ ] Verlauf und Dashboard-Kachel zeigen echte Werte
- [ ] Logger kurz stoppen: MIRA zeigt „nicht erreichbar“ statt alter Werte; danach wieder normal
