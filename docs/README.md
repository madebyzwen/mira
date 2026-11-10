# MIRA – Dokumentation

Alle Konzepte, Entscheidungen und Entwicklungsschritte von MIRA werden hier
abgelegt. Code und Dokumentation werden gemeinsam geändert: Wer eine
Architekturentscheidung trifft oder eine Entwicklungsstufe abschließt,
aktualisiert die passende Datei im selben Commit.

## Struktur

| Verzeichnis | Inhalt |
| --- | --- |
| [`architektur/`](architektur/) | Gültige Konzepte: Zielarchitektur, Datenmodell, MIRA-Agent, Sicherheit |
| [`adr/`](adr/) | Architekturentscheidungen (Architecture Decision Records), fortlaufend nummeriert |
| [`entwicklung/`](entwicklung/) | Roadmap und je Entwicklungsstufe ein Dokument mit Umfang, Erfolgskriterien und Ergebnis |
| [`aufgaben/`](aufgaben/) | Offene Aufgaben und Ideen, die noch keiner Entwicklungsstufe zugeordnet sind |
| [`vorgaben/`](vorgaben/) | Ausgangsdokumente (Briefings, Aufträge) im Originalwortlaut – zur Nachvollziehbarkeit |
| [`mockups/`](mockups/) | Freigegebene UI-Entwürfe (verbindliche visuelle Grundlage) |

## Was gilt?

1. **ADRs** halten Entscheidungen fest und haben Vorrang vor älteren Texten.
2. **`architektur/`** beschreibt den aktuell gültigen Stand.
3. **`vorgaben/`** wird nie nachträglich verändert. Wo eine Vorgabe durch eine
   spätere Entscheidung überholt ist, steht das in der zugehörigen ADR.

## Konventionen

- Sprache: Deutsch.
- **Das Repository ist öffentlich.** Echte IP-Adressen, Hostnamen, MAC-Adressen,
  Zugangsdaten und Schlüssel gehören nicht in die Dokumentation. Stattdessen
  Platzhalter wie `<ASGARD_IP>`, `<KI_SERVER_IP>`, `<MIRA_HOSTNAME>` verwenden; die
  echten Werte stehen nur in der Konfiguration auf Asgard.
- Neue ADR: Vorlage in [`adr/README.md`](adr/README.md) kopieren, nächste Nummer vergeben.
- Neue Entwicklungsstufe: Dokument in `entwicklung/` anlegen und in der
  [Roadmap](entwicklung/roadmap.md) verlinken.
