# Vorgaben (Ausgangsdokumente)

Aufträge und Briefings im **Originalwortlaut**. Sie werden nicht nachträglich
geändert. Wo eine spätere Entscheidung eine Vorgabe überholt, ist das in der
jeweiligen [ADR](../adr/) bzw. im [Stufendokument](../entwicklung/) vermerkt.

| Datum | Dokument | Überholt durch |
| --- | --- | --- |
| 2026-11-05 | [Phase 1 – Umsetzung der Weboberfläche](2026-11-05-phase-1-weboberflaeche.md) | Konfigurationsmenü erweitert (Systeme, MIRA) – siehe [Stufe 0](../entwicklung/stufe-00-weboberflaeche.md) |
| 2026-11-05 | [Architekturbriefing und Implementierungsplanung](2026-11-05-architekturbriefing.md) | Abschnitt 6 (SSH-Agent) → [ADR 0005](../adr/0005-odin-http-api-statt-ssh.md); Abschnitt 11 (Konfigurationsmenü) → Stufe 0 |
| 2026-11-05 | [Umsetzungsvorschlag (ChatGPT)](2026-11-05-umsetzungsvorschlag.md) | erste Stufe um ein Fundament ergänzt – siehe [Roadmap](../entwicklung/roadmap.md) |
| 2026-11-10 | [Shelly Logger: Architektur und Implementierung](2026-11-10-shelly-logger.md) | Bezeichnung „Odin“ → „KI-Server“ nach [ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md); Netzweg zum Shelly über Asgards Adresse → [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md) |
| 2026-11-12 | [Security Hardening, Bugfixes und Qualitätssicherung (Code-Review)](2026-11-12-security-hardening.md) | Branch `fix/review-befunde` statt `fix/security-hardening-stability`, Pull-Request auf Wunsch des Betreibers – siehe [Wartung W1](../entwicklung/security-hardening-review.md) |
