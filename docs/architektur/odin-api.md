# Odin-API (Konzept)

Status: **Stufe 2 umgesetzt** (lesende Endpunkte). Code: `odin-api/`, Installation: [`odin-api/install/README.md`](../../odin-api/install/README.md). Entscheidung: [ADR 0005](../adr/0005-odin-http-api-statt-ssh.md).

Die Odin-API ist die einzige Schnittstelle zwischen MIRA und dem KI-Server Odin.
Sie liefert Systeminformationen und führt ausdrücklich freigegebene Aktionen aus.
Entscheidungen (z. B. „nach 45 Minuten schlafen“) trifft ausschließlich MIRA.

## Betrieb

- Nativer **systemd-Dienst** auf Odin, nicht in Docker (direkter Zugriff auf
  Hardwarewerte, Dateisystem, `systemctl`).
- Eigener, unprivilegierter Benutzer `mira-agent` ohne Login-Shell und ohne sudo-Gruppe.
- Programmdateien gehören root und sind für `mira-agent` nicht beschreibbar.
- Sprache: **TypeScript auf Node.js 22** mit Fastify (entschieden, siehe ADR 0005);
  gemeinsame Verträge aus `shared/`, Quellcode im Workspace `odin-api/`.

## Netzwerk

- Die API lauscht **nur auf der LAN-Schnittstelle** von Odin im Server-VLAN
  (`<ODIN_IP>`). Die 10-GbE-Direktverbindung ist ausschließlich für den
  Fileshare und wird nicht verwendet.
- Der MIRA-Container hat über macvlan eine **eigene IP im Server-Netz** (`<MIRA_IP>`)
  und spricht Odin direkt an – ohne Umweg über die OPNsense (Stand 2026-11-06;
  ursprünglich war Asgards Adresse in einem anderen VLAN vorgesehen).
- Freigaben:
  - Auf Odin (ufw ist dort inaktiv und bleibt unverändert): eigene nftables-Tabelle
    `inet mira_odin_api`, die **nur** Port 8443 betrifft und nur `<MIRA_IP>` zulässt
    (systemd-Unit `mira-odin-api-firewall`).
  - Eine OPNsense-Regel ist nur nötig, wenn MIRA und Odin in verschiedenen Netzen liegen.
  - Zusätzlich trennt die API selbst jede Verbindung von nicht erlaubten Adressen
    noch vor dem TLS-Handshake – auch wenn die nftables-Regel fehlt.

## Absicherung

| Maßnahme | Zweck |
| --- | --- |
| TLS mit selbst erstelltem Zertifikat, Fingerprint in MIRA hinterlegt | Verschlüsselung und Schutz vor untergeschobenem Server |
| Langes Zufallstoken pro Anfrage; auf Odin nur der Hash, auf Asgard als Secret-Datei | Nur MIRA darf die API nutzen |
| Nur fest definierte Endpunkte, keine Ausführung beliebiger Befehle | Kleine Angriffsfläche |
| Privilegierte Aktionen über `/etc/sudoers.d/mira-agent` mit **exakten** Befehlszeilen | Keine pauschalen Root-Rechte |
| Docker-Status über exakte sudo-Regel für `docker ps --all --format json` statt Gruppe `docker` | Gruppe `docker` wäre faktisch Root |
| Protokollierung im systemd-Journal (Odin) und im Audit-Log (MIRA) | Nachvollziehbarkeit |

Der bestehende administrative SSH-Zugang zu Odin bleibt unverändert.

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

## Entwicklung ohne Risiko für Odin

- Unit-Tests mit nachgebildeten `/proc`-, `/sys`- und `/etc`-Dateien.
- Integrationstests im MIRA-Backend gegen die echte Odin-API (in-process, mit TLS und Token).
- `odin-api/dev/odin-sim`: Ubuntu-Container (gleiche Version wie Odin), in dem das
  echte Installationspaket ausgeführt wird; MIRA verbindet sich als Container damit.

Die Installation auf Odin führt der Betreiber nach Anleitung selbst aus.

## Wake-on-LAN

Ein schlafender Odin hat keine API. Wake-on-LAN ist daher ein eigener Weg. Da
MIRA per macvlan im selben Netz wie Odin liegt, kann es das Magic Packet direkt
senden; der Umweg über die OPNsense ([ADR 0007](../adr/0007-wake-on-lan-ueber-opnsense.md))
wird vor Stufe 5 neu bewertet.
