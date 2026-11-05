# odin-sim – Test-Odin für Entwicklung und Tests

Ubuntu-Container (gleiche Version wie Odin), in dem das **echte**
Installationspaket der Odin-API ausgeführt wird. Damit lassen sich Installer,
Firewall-Regel und die Verbindung MIRA ↔ Odin-API prüfen, ohne Odin anzufassen.

Da im Container kein systemd läuft, ersetzen `systemctl`/`journalctl` hier
kleine Skripte, die den Dienst so starten, wie es die Unit-Datei vorgibt.
Die systemd-Härtung selbst wird daher erst auf Odin wirksam.

Ablauf (Netz `172.30.0.0/24`, Odin = `.10`, MIRA = `.20`):

```bash
npm run package:odin-api
docker build -t mira-odin-sim odin-api/dev/odin-sim
docker network create --subnet 172.30.0.0/24 mira-e2e
docker run -d --name odin-sim --cap-add NET_ADMIN --network mira-e2e --ip 172.30.0.10 \
  -v "$PWD/odin-api/release:/pkg:ro" mira-odin-sim
docker exec odin-sim sh -c 'cp -r /pkg/mira-odin-api-*/ /tmp/pkg && cd /tmp/pkg && ./install.sh --listen 172.30.0.10 --allow 172.30.0.20 --yes'
```
