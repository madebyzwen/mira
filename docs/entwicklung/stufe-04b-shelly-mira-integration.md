# Stufe 4b – Shelly: Anbindung in MIRA

- Status: ⏳ geplant – **Umsetzung erst nach gesonderter Freigabe**
- Voraussetzung: [Stufe 4a – Shelly-Logger](stufe-04a-shelly-logger.md) in Betrieb und abgenommen
- Entscheidung: [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md)

## Ziel

MIRA zeigt Leistung, Verbrauch, Kosten und Verlauf aus dem Shelly-Logger an. MIRA fragt
dafür ausschließlich die interne Lese-API des Loggers ab – nie den Shelly selbst.
Die Beispieldaten auf der Shelly-Seite und im Dashboard-Widget „Verbrauch“ entfallen.

## Umfang (Entwurf)

| Bereich | Inhalt |
| --- | --- |
| Netz | Der MIRA-Stack tritt dem internen Netz `mira-intern` bei (`external: true`); der Logger ist dort als `http://mira-shelly-logger:8090` erreichbar. Keine Ports veröffentlicht. |
| Konfiguration | `MIRA_SHELLY_LOGGER_URL`, optional `MIRA_SHELLY_LOGGER_TOKEN_FILE` (wenn der Logger ein Token verlangt) |
| Backend | kleiner Client im Modul `systems` mit Zeitlimit; Verträge aus `shared/src/shellyLogger.ts`; MIRA-Routen unter `/api/v1/systems/shelly…`, nur angemeldet |
| Live | Browser fragt MIRA alle 1–2 s, nur solange die Ansicht sichtbar ist (vorhandenes `usePolling`); MIRA reicht den Live-Wert des Loggers durch – kein WebSocket/SSE |
| Verbrauch | heute, Woche, Monat, Jahr; abgeschlossene Zeiträume; Anteil „rekonstruiert“ sichtbar kennzeichnen |
| Verlauf | Diagramme mit den vorhandenen Komponenten im Raster `HISTORY_GRID` |
| Kosten | Strompreis mit Gültigkeitsdatum in MIRA (`energy_prices`, Konfiguration › Systeme › Shelly); Kosten = Verbrauch × gültiger Preis je Tag |
| Datenbank | Größe und Zeitraum der Logger-Datenbank in Konfiguration › Systeme anzeigen |
| Dashboard | Widget „Verbrauch“ mit echten Werten |
| Zustand | „KI-Server schläft“ ist kein Fehler der Messung; Logger nicht erreichbar → klarer Hinweis statt alter Werte |
| Update-Hinweis | später: Logger-Version wie MIRA/Agent über die Glocke |

## Offene Punkte

- Strompreis (ct/kWh) und Gültigkeitsbeginn
- Ob MIRA ein Token für die Logger-API verwendet (Verteidigung in der Tiefe) oder die
  Netztrennung genügt
