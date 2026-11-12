# MIRA-Agent (Konzept)

Status: **Stufe 2 umgesetzt** (lesende Endpunkte). Code: `agent/`, Installation: [`agent/install/README.md`](../../agent/install/README.md). Entscheidungen: [ADR 0005](../adr/0005-agent-http-api-statt-ssh.md), [ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md).

Der MIRA-Agent ist die einzige Schnittstelle zwischen MIRA und dem KI-Server.
Dessen Anzeigename ist in MIRA frei wählbar (`MIRA_AI_SERVER_NAME`); Paket, Dienst und
Pfade des Agents sind davon unabhängig. Bis Version 0.1.4 hieß der Agent anders
(siehe [Stufe 3a](../entwicklung/stufe-03a-ki-server-bereinigung.md)).
Sie liefert Systeminformationen und führt ausdrücklich freigegebene Aktionen aus.
Entscheidungen (z. B. „nach 45 Minuten schlafen“) trifft ausschließlich MIRA.

## Betrieb

- Nativer **systemd-Dienst** `mira-agent` auf dem KI-Server, nicht in Docker (direkter Zugriff auf
  Hardwarewerte, Dateisystem, `systemctl`).
- Eigener, unprivilegierter Benutzer `mira-agent` ohne Login-Shell und ohne sudo-Gruppe.
- Programm in `/opt/mira-agent/`, Konfiguration in `/etc/mira-agent/`. Programmdateien
  gehören root und sind für `mira-agent` nicht beschreibbar.
- Sprache: **TypeScript auf Node.js 22** mit Fastify (entschieden, siehe ADR 0005);
  gemeinsame Verträge aus `shared/`, Quellcode im Workspace `agent/`.
- Ausgeliefert als Paket `mira-agent-X.Y.Z.tar.gz` (+ `.sha256`) in jedem GitHub-Release.

## Netzwerk

- Der Agent lauscht **nur auf der LAN-Schnittstelle** des KI-Servers im Server-VLAN
  (`<KI_SERVER_IP>`). Die 10-GbE-Direktverbindung ist ausschließlich für den
  Fileshare und wird nicht verwendet.
- Der MIRA-Container hat über macvlan eine **eigene IP im Server-Netz** (`<MIRA_IP>`)
  und spricht den KI-Server direkt an – ohne Umweg über die Firewall (Stand 2026-11-06;
  ursprünglich war die Adresse des Homeservers in einem anderen VLAN vorgesehen).
- Freigaben:
  - Auf dem KI-Server (ufw ist dort inaktiv und bleibt unverändert): eigene nftables-Tabelle
    `inet mira_agent`, die **nur** Port 8443 betrifft und nur `<MIRA_IP>` zulässt
    (systemd-Unit `mira-agent-firewall`).
  - Eine Firewall-Regel ist nur nötig, wenn MIRA und der KI-Server in verschiedenen Netzen liegen.
  - Zusätzlich trennt der Agent selbst jede Verbindung von nicht erlaubten Adressen
    noch vor dem TLS-Handshake – auch wenn die nftables-Regel fehlt.

## Absicherung

| Maßnahme | Zweck |
| --- | --- |
| TLS mit selbst erstelltem Zertifikat, Fingerprint in MIRA hinterlegt | Verschlüsselung und Schutz vor untergeschobenem Server |
| Langes Zufallstoken pro Anfrage; auf dem KI-Server nur der Hash, auf dem Homeserver als Secret-Datei | Nur MIRA darf den Agent nutzen |
| Nur fest definierte Endpunkte, keine Ausführung beliebiger Befehle | Kleine Angriffsfläche |
| Privilegierte Aktionen über `/etc/sudoers.d/mira-agent` mit **exakten** Befehlszeilen | Keine pauschalen Root-Rechte |
| Docker-Status über exakte sudo-Regel für `docker ps --all --format json` statt Gruppe `docker` | Gruppe `docker` wäre faktisch Root |
| Protokollierung im systemd-Journal (KI-Server) und im Audit-Log (MIRA) | Nachvollziehbarkeit |

Der bestehende administrative SSH-Zugang zum KI-Server bleibt unverändert.

## Geplante Endpunkte

| Endpunkt | Zweck | Stufe |
| --- | --- | --- |
| `GET /v1/health` | Erreichbarkeit, Protokollversion (`apiVersion`), ab 0.1.4 Paketversion (`version`) für den Update-Hinweis in MIRA | 2 ✅ |
| `GET /v1/system/info` | OS, Kernel, CPU (inkl. P-/E-Kerne), RAM, GPU, Startzeit | 2 ✅ |
| `GET /v1/system/metrics` | CPU, RAM, GPU, VRAM, Last, Temperaturen, Datenträger, NFS/CIFS-Mounts, Netzwerk | 2 ✅ |
| `GET /v1/docker/containers` | Containerstatus (read-only) | 6 |
| `POST /v1/power/suspend` · `/poweroff` · `/reboot` · `/reboot-windows` | Energiesteuerung | 5 |
| `GET /v1/llm/models` · `DELETE /v1/llm/models/{id}` | Modellverzeichnis | 7 |
| `POST /v1/llm/downloads` · `GET …/{id}` · `DELETE …/{id}` | Downloads mit Fortschritt und Abbruch | 8 |
| `GET /v1/activity` | Aktivität von llama.cpp (für Schlafmodus) | 9 |

### Downloads (Stufe 8)

Nur HTTPS, private/interne Zieladressen werden abgelehnt (SSRF-Schutz), nur
konfigurierte Zielverzeichnisse, Schreiben als `.partial` mit Umbenennen nach
Abschluss, Abbruch über die Job-ID.

## Datenquellen (nur lesend, ohne Root)

| Wert | Quelle |
| --- | --- |
| CPU-Auslastung | `/proc/stat` (Differenz zweier Messungen) |
| CPU-Modell, Kerne, Threads, P-/E-Kerne | `/proc/cpuinfo`, `/sys/devices/cpu_core\|cpu_atom/cpus` |
| RAM | `/proc/meminfo` (genutzt = gesamt − verfügbar) |
| GPU, VRAM | erste AMD-Karte unter `/sys/class/drm/card*/device` (`gpu_busy_percent`, `mem_info_vram_*`) |
| Temperaturen | `/sys/class/hwmon`: coretemp „Package id 0“, amdgpu „edge“, nvme „Composite“ |
| Datenträger | konfigurierte Einhängepunkte, `statfs` |
| Netzlaufwerke | NFS/CIFS-Einträge aus `/proc/mounts` (mit Zeitlimit gegen hängende Mounts; je Einhängepunkt höchstens ein laufender `statfs`, damit ein hängendes Laufwerk den Thread-Pool nicht aufbraucht) |
| Netzwerk | `/sys/class/net`, Adressen des Systems; ohne Docker-/Bridge-Netze |
| RAM-Typ, GPU-Name | aus der Konfiguration (ohne Root nicht auslesbar) |

Nicht ermittelbare Werte werden als `null` geliefert und in MIRA als „–“ angezeigt.

## Entwicklung ohne Risiko für den KI-Server

- Unit-Tests mit nachgebildeten `/proc`-, `/sys`- und `/etc`-Dateien.
- Integrationstests im MIRA-Backend gegen den echten Agent (in-process, mit TLS und Token).
- `agent/dev/ai-server-sim`: Ubuntu-Container (gleiche Version wie auf dem KI-Server), in dem
  das echte Installationspaket ausgeführt wird; MIRA verbindet sich als Container damit.

Die Installation auf dem KI-Server führt der Betreiber nach Anleitung selbst aus.

## Wake-on-LAN

Ein schlafender KI-Server hat keinen erreichbaren Agent. Wake-on-LAN ist daher ein eigener Weg. Da
MIRA per macvlan im selben Netz wie der KI-Server liegt, kann es das Magic Packet direkt
senden; der Umweg über die Firewall ([ADR 0007](../adr/0007-wake-on-lan-ueber-die-firewall.md))
wird vor Stufe 5 neu bewertet.
