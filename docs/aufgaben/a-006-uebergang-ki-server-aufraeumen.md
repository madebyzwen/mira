# A-006 – Übergangsregeln aus Stufe 3a entfernen

- Status: 📝 notiert
- Notiert: 2026-11-10

## Ziel

Nach der erfolgreichen Umstellung auf KI-Server und MIRA-Agent
([Stufe 3a](../entwicklung/stufe-03a-ki-server-bereinigung.md)) die Übergangsregeln
entfernen, damit der frühere Name nur noch in der historischen Dokumentation vorkommt.

## Kontext

Für den Umstieg von MIRA 0.6.x / Agent 0.1.4 enthält der Code bewusst noch Verweise
auf den früheren Namen. Sie sind mit „ÜBERGANG“ markiert bzw. in der Ausnahmeliste von
`scripts/check-naming.sh` eingetragen.

## Umfang

- `agent/install/install.sh`: Übernahme der Altinstallation (`LEGACY_*`, Blöcke „ÜBERGANG“)
- `agent/install/uninstall.sh`: Entfernen von Resten unter dem früheren Namen
- `agent/install/README.md`: Abschnitt „Umstieg von Versionen bis 0.1.4“
- `frontend/src/App.tsx`: Weiterleitung der alten Route
- `scripts/check-naming.sh`: Ausnahmeliste entsprechend verkleinern

Nicht entfernt werden die Datenbankmigrationen (bereits angewendet, unveränderlich)
und die historische Dokumentation.

## Voraussetzung

Umstellung auf Asgard und dem KI-Server abgeschlossen (Abnahme Stufe 3a). Umsetzung mit
der nächsten Version danach (MIRA 0.8.0 / Agent 0.3.0). Wer dann noch eine Installation
unter dem früheren Namen hat, muss zuerst auf 0.2.0 aktualisieren.
