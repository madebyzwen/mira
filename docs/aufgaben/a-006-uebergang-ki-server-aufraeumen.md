# A-006 – Übergangsregeln aus Stufe 3a entfernen

- Status: 📝 notiert
- Notiert: 2026-11-10
- Ergänzt: 2026-11-12 – Gerätenamen in den aktuellen Dokumenten sind bereinigt; offen sind nur noch die Stellen unten (Entscheidung: später berichtigen)

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
- `scripts/check-naming.sh`: Ausnahmeliste entsprechend verkleinern; dazu die `grep -v`-Ausnahme
  für die früheren Dateinamen von ADR 0005 und Stufe 2 entfernen (die Dateien heißen seit
  2026-11-12 `0005-agent-http-api-statt-ssh.md` bzw. `stufe-02-ki-server-lesen.md`)

Nicht entfernt werden die Datenbankmigrationen (bereits angewendet, unveränderlich) samt
ihrem Test (`backend/test/migrations.test.ts`), die historische Dokumentation (Stufen 00–03a,
ADRs 0001–0008 und 0010, `docs/vorgaben/`, `docs/mockups/`) und der frühere Name in
`backend/core/db/coreMigrations.ts`.

## Voraussetzung

Umstellung auf dem Homeserver und dem KI-Server abgeschlossen (Abnahme Stufe 3a). Umsetzung mit
der nächsten Version danach (MIRA 0.8.0 / Agent 0.3.0). Wer dann noch eine Installation
unter dem früheren Namen hat, muss zuerst auf 0.2.0 aktualisieren.
