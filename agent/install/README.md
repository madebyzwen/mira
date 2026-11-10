# MIRA-Agent – Installation auf dem KI-Server

Der MIRA-Agent liefert MIRA Systemdaten des KI-Servers (CPU, RAM, GPU, Temperaturen,
Datenträger, Netzwerk). Er ist **nur lesend**, läuft als eigener, unprivilegierter
Benutzer `mira-agent` und ist nur von MIRA aus erreichbar.

## Voraussetzungen

- Ubuntu Server (getestet mit 26.04), Node.js ≥ 22 – wird bei Bedarf aus den
  Ubuntu-Paketquellen installiert (`apt install nodejs`).
- `<KI_SERVER_IP>`: Adresse des KI-Servers im Server-Netz, auf der der Agent lauscht.
- `<MIRA_IP>`: Adresse, mit der MIRA den KI-Server anspricht (bei macvlan die eigene IP
  des MIRA-Containers). Liegt sie in einem anderen Netz als der KI-Server, ist zusätzlich
  eine Firewall-Regel `<MIRA_IP>` → `<KI_SERVER_IP>`, TCP 8443 nötig.

## Installation und Update

```bash
# Auf dem KI-Server: Paket aus dem GitHub-Release laden und prüfen
VERSION=0.2.0
BASE=https://github.com/madebyzwen/mira/releases/latest/download
curl -fLO "$BASE/mira-agent-$VERSION.tar.gz" -fLO "$BASE/mira-agent-$VERSION.tar.gz.sha256"
sha256sum -c "mira-agent-$VERSION.tar.gz.sha256"

tar xzf "mira-agent-$VERSION.tar.gz"
cd "mira-agent-$VERSION"
sudo ./install.sh --listen <KI_SERVER_IP> --allow <MIRA_IP>   # Erstinstallation
sudo ./install.sh                                             # Update
```

Alternativ das Paket lokal bauen (`npm run package:agent`) und per `scp` kopieren.

Das Skript

1. installiert bei Bedarf Node.js (mit Rückfrage),
2. legt den Benutzer `mira-agent` an (ohne Login-Shell, ohne sudo),
3. kopiert das Programm nach `/opt/mira-agent/` (gehört root),
4. legt `/etc/mira-agent/` an: Konfiguration, Zertifikat, Hash des Tokens,
5. richtet eine nftables-Regel ein (Tabelle `inet mira_agent`), die **nur** Port 8443
   betrifft und nur MIRA zulässt (ufw und andere Regeln bleiben unberührt),
6. prüft die Konfiguration als `mira-agent` und startet den gehärteten systemd-Dienst `mira-agent`.

Am Ende werden **Fingerprint** und **Token** angezeigt. Das Token erscheint nur
dieses eine Mal – auf dem KI-Server bleibt nur sein Hash. Bei einem Update bleiben
Konfiguration, Zertifikat und Token erhalten.

### Umstieg von Versionen bis 0.1.4

Bis Version 0.1.4 lief der Agent unter einem früheren Namen (Dienst, Pfade und Paket
`mira-odin-api`). `install.sh` erkennt eine solche Installation und übernimmt sie:

- Konfiguration (inkl. eigener Anpassungen) und **Token bleiben erhalten**,
- das **Zertifikat wird neu erzeugt** – den neuen Fingerprint in MIRA eintragen,
- der bisherige Dienst wird erst beendet, wenn die neue Konfiguration geprüft ist;
  startet der neue Dienst nicht, läuft die bisherige Installation wieder an,
- danach werden Dienste, Firewall-Tabelle und Verzeichnisse der bisherigen Installation entfernt.

Auf dem MIRA-Host die Token-Datei `secrets/odin_api_token.txt` in
`secrets/ai_server_token.txt` umbenennen und den Stack mit den neuen Variablen
aktualisieren (siehe Haupt-README).

## In MIRA eintragen

Token unter `<APPDATA>/mira/secrets/ai_server_token.txt` ablegen und im
Portainer-Stack `MIRA_AI_SERVER_URL` und `MIRA_AI_SERVER_CERT_FINGERPRINT` setzen,
optional den Namen über `MIRA_AI_SERVER_NAME` – siehe Haupt-README, Abschnitt
„Verbindung zum KI-Server“.

## Anpassen

`/etc/mira-agent/config.json`, danach `sudo systemctl restart mira-agent`:

| Feld | Bedeutung |
| --- | --- |
| `disks` | anzuzeigende Datenträger (Einhängepunkt + Bezeichnung) |
| `network.labels` | Anzeigenamen der Netzwerkschnittstellen |
| `network.include` | nur diese Schnittstellen (leer = alle mit IPv4, ohne Docker) |
| `labels.gpuModel`, `labels.ramType` | Angaben, die ohne Root-Rechte nicht auslesbar sind |
| `allowedClients` | zugelassene Adressen (bei Änderung `install.sh` erneut ausführen, damit die Firewall-Regel passt) |

## Betrieb

```bash
systemctl status mira-agent
journalctl -u mira-agent -f               # abgelehnte Zugriffe werden hier protokolliert
sudo ./install.sh --rotate-token          # neues Token (danach in MIRA ersetzen)
sudo ./install.sh --rotate-cert           # neues Zertifikat (danach Fingerprint ersetzen)
```

## Deinstallation

```bash
sudo ./uninstall.sh            # Dienst, Regel und Programm entfernen
sudo ./uninstall.sh --purge    # zusätzlich Konfiguration, Zertifikat, Token, Benutzer
```
