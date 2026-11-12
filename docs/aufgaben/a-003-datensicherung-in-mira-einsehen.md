# A-003 – Datensicherung in MIRA einsehen

- Status: 📝 notiert
- Notiert: 2026-11-07
- Verwandt: [Stufe 3](../entwicklung/stufe-03-messwert-historie.md) (tägliche Sicherung), [A-002](a-002-erste-sicherung-pruefen.md) (manuelle Prüfung per SSH)

> **Stand 2026-11-12 ([Wartung W1](../entwicklung/security-hardening-review.md#b-01--sicherungen)):** Sicherungen werden
> geprüft (Integrität, Migrationsstand), optional auf ein getrenntes Ziel kopiert, und eine
> fehlgeschlagene Sicherung erscheint als Meldung in der Glocke. Offen bleibt die Ansicht
> (vorhandene Sicherungen, letzter Erfolg) in der Oberfläche.

## Ziel

Der Zustand der Datensicherung soll direkt in der MIRA-Oberfläche sichtbar sein,
statt ihn per SSH auf dem Homeserver bzw. in den Container-Logs prüfen zu müssen.

## Kontext

- Seit Stufe 3 sichert MIRA die Datenbank täglich um 03:30 Uhr (Ortszeit,
  `MIRA_BACKUP_TIME`) nach `/data/backups/mira-JJJJ-MM-TT.db`; die letzten 7
  bleiben erhalten (`MIRA_BACKUP_KEEP`). Umsetzung: `backend/core/backup.ts`.
- Heute ist das Ergebnis nur über den Ordner auf dem Homeserver und die Logs nachvollziehbar.

## Mögliche Inhalte (zu klären)

- Liste der vorhandenen Sicherungen: Datum, Uhrzeit, Größe.
- Letzte Sicherung erfolgreich / fehlgeschlagen (mit Fehlermeldung), nächste geplante Sicherung.
- Warnhinweis, wenn die letzte erfolgreiche Sicherung älter als ca. 24 h ist –
  ggf. auch auf dem Dashboard.
- Einstellungen anzeigen: Uhrzeit, Anzahl aufbewahrter Sicherungen, Speicherort.

## Offene Fragen

- Ort in der Oberfläche: Konfiguration › MIRA?
- Nur anzeigen oder auch **Sicherung jetzt erstellen** auf Knopfdruck?
- Herunterladen einer Sicherung über die Oberfläche? (enthält alle Daten – Anmeldung,
  ggf. erneute Passwortabfrage, Audit-Log)
- Wiederherstellung über die Oberfläche – bewusst nicht, oder später?
- Ergebnis der Sicherungen dauerhaft speichern (eigene Tabelle) oder aus dem Ordner ableiten?
