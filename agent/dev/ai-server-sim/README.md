# ai-server-sim – Test-KI-Server für Entwicklung und Tests

Ubuntu-Container (gleiche Version wie auf dem KI-Server), in dem das **echte**
Installationspaket des MIRA-Agents ausgeführt wird. Damit lassen sich Installer,
Firewall-Regel und die Verbindung MIRA ↔ Agent prüfen, ohne den KI-Server anzufassen.

Im Container läuft kein systemd: `systemctl` und `journalctl` sind kleine Ersatzskripte,
die die Unit-Dateien auswerten (Dienst als `mira-agent` im Hintergrund starten,
Firewall-Regel laden). Die systemd-Härtung selbst wird daher erst auf dem KI-Server wirksam.

Ablauf (Netz `172.30.0.0/24`, KI-Server = `.10`, MIRA = `.20`):

```bash
npm run package:agent
docker build -t mira-ai-server-sim agent/dev/ai-server-sim
docker network create --subnet 172.30.0.0/24 mira-e2e
docker run -d --name ai-server-sim --cap-add NET_ADMIN --network mira-e2e --ip 172.30.0.10 \
  -v "$PWD/agent/release:/pkg:ro" mira-ai-server-sim
docker exec ai-server-sim sh -c 'cp -r /pkg/mira-agent-*/ /tmp/pkg && cd /tmp/pkg && ./install.sh --listen 172.30.0.10 --allow 172.30.0.20 --yes'
```

## Übernahme einer älteren Installation prüfen

Vor dem Installieren des aktuellen Pakets im Container zuerst die zuletzt
veröffentlichte Version unter dem früheren Namen installieren (Paket aus dem
GitHub-Release v0.6.1, `--yes`). Danach das aktuelle Paket wie oben mit
`./install.sh --yes` ohne weitere Angaben ausführen. Erwartet:

- derselbe Token funktioniert weiter, der Fingerprint ist neu
- `systemctl is-active mira-agent` ist erfolgreich
- keine Verzeichnisse, Unit-Dateien oder nftables-Tabellen der früheren Installation mehr
