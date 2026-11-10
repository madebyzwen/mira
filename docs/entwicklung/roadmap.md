# Roadmap

MIRA wird in kleinen, prüfbaren Stufen entwickelt – möglichst als vertikale
Abschnitte (Oberfläche, Backend, Datenbank, ggf. MIRA-Agent auf dem KI-Server für
genau eine Funktion). Jede Stufe wird nach menschlicher Prüfung abgeschlossen.

Status: ✅ abgeschlossen · 🔍 umgesetzt, Abnahme ausstehend · 🚧 in Umsetzung · ⏳ geplant · ⏸ zurückgestellt

| Stufe | Inhalt | Eingriff in KI-Server/Asgard/Netz | Status |
| --- | --- | --- | --- |
| [0](stufe-00-weboberflaeche.md) | Klickbare Weboberfläche nach Mockups, Demo-Daten | nein | ✅ |
| [1](stufe-01-fundament.md) | Fundament: Backend-Kern, SQLite + Migrationen, echte Anmeldung, ein Container, Tests | nein | ✅ |
| [2](stufe-02-odin-lesen.md) | KI-Server lesen: Agent (`health`, `system/info`, `system/metrics`), Online-Zustand, Ansicht mit Live-Daten; zuerst gegen den Test-KI-Server | KI-Server: Dienst, Benutzer, Firewall · Asgard: macvlan-IP für MIRA | ✅ |
| [3](stufe-03-messwert-historie.md) | Messwert-Historie: Scheduler, Speicherung, Verdichtung, Aufbewahrung; echte Diagramme des KI-Servers; Backup-Konzept | nein | ✅ |
| [3a](stufe-03a-ki-server-bereinigung.md) | Bereinigung: durchgängig „KI-Server“, Name konfigurierbar (`MIRA_AI_SERVER_NAME`), Agent `mira-agent` ([ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md)); **Voraussetzung für Stufe 4** | KI-Server: Agent neu installieren (übernimmt die Altinstallation) · Asgard: Stack-Variablen, Secret umbenennen | ✅ |
| [4](stufe-04-shelly.md) | Shelly Plug: lokale API nur lesend, Live-Leistung, Verbrauch, Historie, Kosten; Dashboard-Widget „Verbrauch“ | OPNsense-Regel | ⏳ |
| 5 | Energiesteuerung: Wake-on-LAN, Suspend, Herunterfahren, Neustart, Windows-Neustart, Verfügbarkeitsprüfung | KI-Server: sudo-Regeln, GRUB · OPNsense: os-wol | ⏳ |
| 6 | Dashboard mit echten Daten: Docker-Status, Ressourcen, Strom, LLMs | KI-Server: sudo-Regel `docker ps` | ⏳ |
| 7 | LLM-Übersicht: auflisten, Info, löschen mit Sicherheitsabfrage | KI-Server: Leserechte Modellverzeichnis | ⏳ |
| 8 | LLM-Downloads: serverseitig auf dem KI-Server, Fortschritt, Abbruch | KI-Server: Schreibrechte Modellverzeichnis | ⏳ |
| 9 | Automatischer Schlafmodus: Inaktivität, Sperren, Schutz laufender Jobs/Anfragen | Aktivitätserkennung llama.cpp | ⏳ |
| 10 | Agents: Hermes-Anbindung – Ansicht und Einrichtung von Agenten (2026-11-07 zurückgestellt) | offen | ⏸ |

Konfigurations-Widgets entstehen jeweils **mit ihrer Stufe** (z. B. Verbindung zum KI-Server in Stufe 2, Shelly in Stufe 4).

## Begründung der Reihenfolge

- **Fundament vor dem KI-Server:** Jeder Endpunkt, der mit dem KI-Server spricht, liegt von Anfang an
  hinter der Anmeldung. Stufe 1 ist ohne Risiko für die Infrastruktur prüfbar.
- **Lesen vor Steuern:** Fehler beim Lesen sind harmlos, beim Steuern nicht.
- **Shelly früh möglich:** unabhängig vom MIRA-Agent, kann bei Bedarf vorgezogen werden.
- **Agents zurückgestellt (2026-11-07):** Ansicht und Einrichtung von Agenten werden
  vorerst nicht umgesetzt; Stufe 10 bleibt als Platzhalter stehen und wird bei Bedarf neu bewertet.
  Die Platzhalter aus Stufe 0 (Menü, Seite, Dashboard-Widget, Konfiguration) sind über den
  Schalter `features.agents` in `frontend/src/lib/features.ts` ausgeblendet.
- **Schlafmodus zuletzt:** braucht Energiesteuerung, Jobs und Aktivitätserkennung;
  Suspend/Resume mit AMD-GPU und ROCm muss vorher manuell als zuverlässig bestätigt sein.

## Offene Entscheidungen

| Thema | Benötigt bis |
| --- | --- |
| Shelly-Modell/Generation, IP, VLAN, Passwort, Strompreis ([Stufe 4](stufe-04-shelly.md)) | Stufe 4 |
| Wake-on-LAN über OPNsense ([ADR 0007](../adr/0007-wake-on-lan-ueber-opnsense.md)) | Stufe 5 |
| MAC von `eno1`, WoL im BIOS, GRUB-Eintrag für Windows | Stufe 5 |
| Modellverzeichnis, Aufbau von llama.cpp/Containern auf dem KI-Server | Stufe 6–8 |
| Automatisches Aufwecken bei Anfragen aus Open WebUI (neue Funktion) | vor Stufe 9 |
| Datenquelle „Verfügbare LLMs“: Open WebUI oder Dateien auf dem KI-Server | Stufe 6 |
