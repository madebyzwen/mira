# Stufe 0 – Klickbare Weboberfläche

- Status: ✅ abgeschlossen (Commit `82e51ec`, 2026-11-05)
- Hinweis: In `82e51ec` fehlte `frontend/src/data/demoData.ts` wegen eines zu weit
  gefassten `.gitignore`-Musters – behoben in Stufe 1.
- Auftrag: [Phase 1 – Umsetzung der Weboberfläche](../vorgaben/2026-11-05-phase-1-weboberflaeche.md)

> **Hinweis (2026-11-10):** Historisches Dokument – es beschreibt den damaligen Stand. Seit
> [Stufe 3a](stufe-03a-ki-server-bereinigung.md) heißt der Rechner allgemein **KI-Server**
> (Name konfigurierbar) und die Software darauf **MIRA-Agent** ([ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md)).

## Umfang

Vollständig navigierbare Oberfläche nach den [Mockups](../mockups/) mit zentralen
Demo-Daten, ohne Backend: Login (Demo), Dashboard (Menü aus-/eingeklappt),
Systeme › Odin und Shelly Plug, Agents (leere Übersicht), LLM (Tabelle, Download-Bereich),
Konfiguration mit Unterpunkten. Docker-Build mit nginx.

## Ergebnis

- React 19, TypeScript, Vite, React Router, Lucide, eigenes CSS-Designsystem (`styles/tokens.css`).
- Demo-Daten zentral in `frontend/src/data/demoData.ts`, Zugriff nur über `services/dataService.ts`.
- Diagramme und Illustrationen als SVG; Shelly-Grafik als PNG (`frontend/src/assets/devices/`).
- Produktive Aktionen zeigen einen Hinweis statt etwas auszuführen.

## Abweichungen von den Mockups (Vorgaben haben Vorrang)

| Mockup | Umsetzung | Grund |
| --- | --- | --- |
| Menüpunkt „Dienste“ | entfernt | kein eigener Menüpunkt vorgesehen |
| Link „Alle Dienste →“ im Docker-Widget | entfernt | es gibt keine Dienste-Ansicht |
| Dashboard-Widget „Agents“ mit System-/Power-/LLM-/Maintenance-Agent | zeigt die (leere) Agentenliste | keine technischen Hintergrundprozesse als KI-Agenten |
| Ubuntu 24.04 / 26.04 uneinheitlich | einheitlich 26.04 aus zentralen Daten | eine Datenquelle |

## Spätere Ergänzungen in dieser Stufe (nach Rückmeldung)

- Konfiguration: zusätzlicher Unterpunkt **MIRA**; „System“ umbenannt in **Systeme**.
- Konfiguration › Systeme: je System ein Widget (Platzhalter) statt weiterer Menüebene.
- Begrüßung: „Dein KI-Server ist online und einsatzbereit.“
