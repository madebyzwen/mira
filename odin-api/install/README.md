# MIRA Odin-API – Installation auf Odin

Die Odin-API liefert MIRA Systemdaten von Odin (CPU, RAM, GPU, Temperaturen,
Datenträger, Netzwerk). Sie ist **nur lesend**, läuft als eigener,
unprivilegierter Benutzer `mira-agent` und ist nur von Asgard aus erreichbar.

## Voraussetzungen

- Ubuntu Server (getestet mit 26.04), Node.js ≥ 22 – wird bei Bedarf aus den
  Ubuntu-Paketquellen installiert (`apt install nodejs`).
- `<MIRA_IP>`: Adresse, mit der MIRA Odin anspricht (bei macvlan die eigene IP des
  MIRA-Containers). Liegt sie in einem anderen Netz als Odin, ist zusätzlich eine
  Firewall-Regel `<MIRA_IP>` → `<ODIN_IP>`, TCP 8443 nötig.

## Installation

```bash
# Auf Odin: Paket aus dem GitHub-Release laden und prüfen
VERSION=0.1.2
BASE=https://github.com/madebyzwen/mira/releases/latest/download
curl -fLO "$BASE/mira-odin-api-$VERSION.tar.gz" -fLO "$BASE/mira-odin-api-$VERSION.tar.gz.sha256"
sha256sum -c "mira-odin-api-$VERSION.tar.gz.sha256"

tar xzf "mira-odin-api-$VERSION.tar.gz"
cd "mira-odin-api-$VERSION"
sudo ./install.sh --listen <ODIN_IP> --allow <MIRA_IP>
```

Alternativ das Paket lokal bauen (`npm run package:odin-api`) und per `scp` kopieren.

Das Skript

1. installiert bei Bedarf Node.js (mit Rückfrage),
2. legt den Benutzer `mira-agent` an (ohne Login-Shell, ohne sudo),
3. kopiert das Programm nach `/opt/mira-odin-api/` (gehört root),
4. legt `/etc/mira-odin-api/` an: Konfiguration, Zertifikat, Hash des Tokens,
5. richtet eine nftables-Regel ein, die **nur** Port 8443 betrifft und nur MIRA zulässt
   (ufw und andere Regeln bleiben unberührt),
6. prüft die Konfiguration als `mira-agent` und startet den gehärteten systemd-Dienst `mira-odin-api`.

Am Ende werden **Fingerprint** und **Token** angezeigt. Das Token erscheint nur
dieses eine Mal – auf Odin bleibt nur sein Hash.

## Auf Asgard eintragen

Token unter `<APPDATA>/mira/secrets/odin_api_token.txt` ablegen und im
Portainer-Stack `MIRA_ODIN_API_URL` und `MIRA_ODIN_CERT_FINGERPRINT` setzen –
siehe Haupt-README, Abschnitt „Verbindung zu Odin“.

## Anpassen

`/etc/mira-odin-api/config.json`, danach `sudo systemctl restart mira-odin-api`:

| Feld | Bedeutung |
| --- | --- |
| `disks` | anzuzeigende Datenträger (Einhängepunkt + Bezeichnung) |
| `network.labels` | Anzeigenamen der Netzwerkschnittstellen |
| `network.include` | nur diese Schnittstellen (leer = alle mit IPv4, ohne Docker) |
| `labels.gpuModel`, `labels.ramType` | Angaben, die ohne Root-Rechte nicht auslesbar sind |
| `allowedClients` | zugelassene Adressen (bei Änderung `install.sh` erneut ausführen, damit die Firewall-Regel passt) |

## Betrieb

```bash
systemctl status mira-odin-api
journalctl -u mira-odin-api -f           # abgelehnte Zugriffe werden hier protokolliert
sudo ./install.sh --rotate-token          # neues Token (danach auf Asgard ersetzen)
sudo ./install.sh --rotate-cert           # neues Zertifikat (danach Fingerprint ersetzen)
```

## Deinstallation

```bash
sudo ./uninstall.sh            # Dienst, Regel und Programm entfernen
sudo ./uninstall.sh --purge    # zusätzlich Konfiguration, Zertifikat, Token, Benutzer
```
