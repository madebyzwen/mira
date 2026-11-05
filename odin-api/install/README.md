# MIRA Odin-API – Installation auf Odin

Die Odin-API liefert MIRA Systemdaten von Odin (CPU, RAM, GPU, Temperaturen,
Datenträger, Netzwerk). Sie ist **nur lesend**, läuft als eigener,
unprivilegierter Benutzer `mira-agent` und ist nur von Asgard aus erreichbar.

## Voraussetzungen

- Ubuntu Server (getestet mit 26.04), Node.js ≥ 22 – wird bei Bedarf aus den
  Ubuntu-Paketquellen installiert (`apt install nodejs`).
- OPNsense-Regel: Asgard → Odin, TCP 8443.

## Installation

```bash
# Paket auf Odin kopieren (vom Rechner mit dem Repository aus)
scp odin-api/release/mira-odin-api-*.tar.gz sven@<ODIN_IP>:~

# Auf Odin
tar xzf mira-odin-api-*.tar.gz
cd mira-odin-api-*/
sudo ./install.sh --listen <ODIN_IP> --allow <ASGARD_IP>
```

Das Skript

1. installiert bei Bedarf Node.js (mit Rückfrage),
2. legt den Benutzer `mira-agent` an (ohne Login-Shell, ohne sudo),
3. kopiert das Programm nach `/opt/mira-odin-api/` (gehört root),
4. legt `/etc/mira-odin-api/` an: Konfiguration, Zertifikat, Hash des Tokens,
5. richtet eine nftables-Regel ein, die **nur** Port 8443 betrifft und nur Asgard zulässt
   (ufw und andere Regeln bleiben unberührt),
6. startet den gehärteten systemd-Dienst `mira-odin-api`.

Am Ende werden **Fingerprint** und **Token** angezeigt. Das Token erscheint nur
dieses eine Mal – auf Odin bleibt nur sein Hash.

## Auf Asgard eintragen

```bash
printf '<TOKEN>\n' > deploy/secrets/odin_api_token.txt
chmod 600 deploy/secrets/odin_api_token.txt
```

In `deploy/docker-compose.yml` die Odin-Einträge aktivieren:
`MIRA_ODIN_API_URL`, `MIRA_ODIN_CERT_FINGERPRINT`, Secret `mira_odin_api_token`.

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
