# Roadmap

MIRA wird in kleinen, prüfbaren Stufen entwickelt – möglichst als vertikale
Abschnitte (Oberfläche, Backend, Datenbank, ggf. Odin-API für genau eine
Funktion). Jede Stufe wird nach menschlicher Prüfung abgeschlossen.

Status: ✅ abgeschlossen · 🔍 umgesetzt, Abnahme ausstehend · 🚧 in Umsetzung · ⏳ geplant · ⏸ zurückgestellt

| Stufe | Inhalt | Eingriff in Odin/Asgard/Netz | Status |
| --- | --- | --- | --- |
| [0](stufe-00-weboberflaeche.md) | Klickbare Weboberfläche nach Mockups, Demo-Daten | nein | ✅ |
| [1](stufe-01-fundament.md) | Fundament: Backend-Kern, SQLite + Migrationen, echte Anmeldung, ein Container, Tests | nein | ✅ |
| [2](stufe-02-odin-lesen.md) | Odin lesen: Odin-API (`health`, `system/info`, `system/metrics`), Online-Zustand, Odin-View mit Live-Daten; zuerst gegen `odin-sim` | Odin: Dienst, Benutzer, Firewall · Asgard: macvlan-IP für MIRA | ✅ |
| [3](stufe-03-messwert-historie.md) | Messwert-Historie: Scheduler, Speicherung, Verdichtung, Aufbewahrung; echte Odin-Diagramme; Backup-Konzept | nein | ✅ |
| [3a](stufe-03a-ki-server-statt-odin.md) | Bereinigung: „KI-Server“ statt fest verdrahtetem „Odin“; Name konfigurierbar (`MIRA_AI_SERVER_NAME`), Odin-API wird zum Agent `mira-agent`; **Voraussetzung für Stufe 4** | KI-Server: Agent neu installieren (übernimmt Altinstallation) · Asgard: Stack-Variablen, Secret umbenennen | ⏳ |
| [4](stufe-04-shelly.md) | Shelly Plug: lokale API nur lesend, Live-Leistung, Verbrauch, Historie, Kosten; Dashboard-Widget „Verbrauch“ | OPNsense-Regel | ⏳ |
| 5 | Energiesteuerung: Wake-on-LAN, Suspend, Herunterfahren, Neustart, Windows-Neustart, Verfügbarkeitsprüfung | Odin: sudo-Regeln, GRUB · OPNsense: os-wol | ⏳ |
| 6 | Dashboard mit echten Daten: Docker-Status, Ressourcen, Strom, LLMs | Odin: sudo-Regel `docker ps` | ⏳ |
| 7 | LLM-Übersicht: auflisten, Info, löschen mit Sicherheitsabfrage | Odin: Leserechte Modellverzeichnis | ⏳ |
| 8 | LLM-Downloads: serverseitig auf Odin, Fortschritt, Abbruch | Odin: Schreibrechte Modellverzeichnis | ⏳ |
| 9 | Automatischer Schlafmodus: Inaktivität, Sperren, Schutz laufender Jobs/Anfragen | Aktivitätserkennung llama.cpp | ⏳ |
| 10 | Agents: Hermes-Anbindung – Ansicht und Einrichtung von Agenten (2026-11-07 zurückgestellt) | offen | ⏸ |

Konfigurations-Widgets entstehen jeweils **mit ihrer Stufe** (z. B. Odin-Verbindung in Stufe 2, Shelly in Stufe 4).

## Begründung der Reihenfolge

- **Fundament vor Odin:** Jeder Endpunkt, der mit Odin spricht, liegt von Anfang an
  hinter der Anmeldung. Stufe 1 ist ohne Risiko für die Infrastruktur prüfbar.
- **Lesen vor Steuern:** Fehler beim Lesen sind harmlos, beim Steuern nicht.
- **Shelly früh möglich:** unabhängig von der Odin-API, kann bei Bedarf vorgezogen werden.
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
| Modellverzeichnis, Aufbau von llama.cpp/Containern auf Odin | Stufe 6–8 |
| Automatisches Aufwecken bei Anfragen aus Open WebUI (neue Funktion) | vor Stufe 9 |
| Datenquelle „Verfügbare LLMs“: Open WebUI oder Dateien auf Odin | Stufe 6 |
