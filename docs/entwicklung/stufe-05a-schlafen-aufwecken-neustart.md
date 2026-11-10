# Stufe 5a – KI-Server schlafen legen, aufwecken, neu starten (per Knopf)

- Status: ⏳ Konzept, Freigabe ausstehend (notiert 2026-11-10)
- Vorgezogener Teil von Stufe 5 (Energiesteuerung). Der **automatische** Schlafmodus bleibt Stufe 9.
- Entscheidung: [ADR 0011](../adr/0011-energiesteuerung-polkit-und-direktes-wake-on-lan.md) (ersetzt ADR 0007)
- Zielversionen: MIRA 0.9.0, MIRA-Agent 0.3.0

## Ziel

Die Schnellaktionen im Dashboard werden echt:

| Knopf | Wirkung |
| --- | --- |
| **KI-Server schlafen legen** | Suspend (Bereitschaft); schläft der KI-Server, wird daraus **KI-Server aufwecken** (Wake-on-LAN) |
| **KI-Server neustarten** | Neustart (Linux) |
| Dienste neu starten | bleibt Platzhalter – welche Dienste (Docker auf dem KI-Server) wird in Stufe 6 festgelegt |

Herunterfahren und Neustart in Windows folgen mit Stufe 5.

## Ablauf

```
Dashboard ── Bestätigung ──▶ MIRA POST /api/v1/systems/ai-server/power {action}
                               ├─ suspend/reboot ──HTTPS + Token──▶ Agent POST /v1/power/{suspend|reboot}
                               │                                      └─ antwortet 202, dann systemctl … (polkit)
                               └─ wake ──UDP-Broadcast (Magic Packet, macvlan)──▶ eno1 des KI-Servers
```

| Aktion | Ablauf | Erfolg | Fehler |
| --- | --- | --- | --- |
| Schlafen | Agent bestätigt, löst nach ≈ 1 s `systemctl suspend` aus | Agent innerhalb von 60 s nicht mehr erreichbar; Shelly-Leistung fällt unter die Schwelle | Agent nach 60 s noch erreichbar (z. B. Sperre durch laufenden Job) → Meldung mit Grund aus dem Agent |
| Aufwecken | Magic Packet 3× im Abstand von 1 s | Agent innerhalb von 120 s wieder erreichbar | sonst Meldung „nicht aufgewacht“ |
| Neustart | Agent bestätigt, löst nach ≈ 1 s `systemctl reboot` aus | Agent nach dem Neustart innerhalb von 5 min wieder erreichbar | sonst Meldung |

## Zustände des KI-Servers

| Zustand | Bedeutung | Erkennung |
| --- | --- | --- |
| `online` | Agent antwortet | wie bisher |
| `sleeping` | schläft | MIRA hat ihn schlafen gelegt **oder** Agent nicht erreichbar und Shelly misst weniger als `MIRA_AI_SERVER_SLEEP_POWER_W` |
| `offline` | nicht erreichbar, Ursache unklar | Agent nicht erreichbar und Leistung hoch bzw. keine Shelly-Messung |
| Übergänge | „schläft ein …“, „wacht auf …“, „startet neu …“ | nur in der Oberfläche, bis Erfolg oder Zeitüberschreitung |

- Schläft der KI-Server, fragt MIRA ihn nur noch alle 10 s ab (statt 2 s) und meldet keine Störung.
  Abfragen wecken ihn nicht – geweckt wird nur durch das Magic Packet (`Wake-on: g`).
- Das Datenbankfeld `system_state.state` erlaubt bisher nur `online`/`offline`/`unknown` –
  eine Migration ergänzt `sleeping`.

## Sicherheit

- Nur angemeldet; Sicherheitsabfrage im Dialog; jede Aktion im **Audit-Log** (wer, was, wann, Ergebnis).
- Höchstens eine Energieaktion je 30 s (MIRA und Agent).
- Der Dialog zeigt die aktuelle GPU-/CPU-Auslastung – läuft gerade ein Modell, ist das sichtbar
  („GPU 85 % – trotzdem schlafen legen?“). Die automatische Erkennung laufender Anfragen ist Stufe 9.
- Agent: nur `suspend` und `reboot`, keine beliebigen Befehle; polkit erlaubt nichts darüber hinaus
  und **keine** Umgehung von Sperren (`…-ignore-inhibit`). Dienst bleibt gehärtet (`NoNewPrivileges`).
- Wake-on-LAN braucht keine Zugangsdaten; das Magic Packet enthält nur die MAC-Adresse.

## Umfang

| Teil | Inhalt |
| --- | --- |
| Agent 0.3.0 | `POST /v1/power/suspend`, `POST /v1/power/reboot` (202, Ausführung danach); `/v1/health` meldet die letzte Energieaktion samt Fehler; Sperre 30 s; Tests mit nachgebildetem `systemctl` |
| `install.sh` | legt `/etc/polkit-1/rules.d/50-mira-agent.rules` an, prüft polkit-Version; `uninstall.sh` entfernt sie. Zusammen mit [A-006](../aufgaben/a-006-uebergang-ki-server-aufraeumen.md) (Übergangsregeln entfernen) |
| MIRA 0.9.0 | `POST /api/v1/systems/ai-server/power` (`suspend`/`reboot`/`wake`), Magic Packet, Zustand `sleeping` (Migration), langsamere Abfrage im Schlaf, Audit-Log, Sperre |
| Oberfläche | Dashboard-Knöpfe mit Bestätigungsdialog und Fortschritt; Zustand „schläft“ in Navigation, Dashboard und KI-Server-Seite |
| Konfiguration | `MIRA_AI_SERVER_MAC`, `MIRA_AI_SERVER_WOL_BROADCAST` (z. B. `<SERVER_NETZ>.255`), `MIRA_AI_SERVER_SLEEP_POWER_W` (Standard 20 W) – ohne MAC kein „Aufwecken“-Knopf |
| Tests | Agent (Aktion, Sperre, Fehler von `systemctl`), MIRA (Ablauf, Zeitüberschreitungen, Audit, Zustände inkl. Shelly-Schwelle), Magic-Packet-Format; Test-KI-Server mit nachgebildetem `systemctl suspend` |

## Vorab-Prüfung am KI-Server (Betreiber)

Vor der Umsetzung muss feststehen, dass Schlafen und Aufwachen auf diesem Rechner zuverlässig
funktionieren – mit AMD-GPU (ROCm) ist das nicht selbstverständlich.

1. **Wake-on-LAN-Fähigkeit und MAC:**
   ```bash
   sudo ethtool eno1 | grep -i wake      # erwünscht: „Supports Wake-on: …g…“ und „Wake-on: g“
   ip link show eno1 | grep ether        # MAC-Adresse
   ```
   Steht `Wake-on: d`, muss WoL dauerhaft eingeschaltet werden (netplan `wakeonlan: true` für `eno1`).
   Im BIOS/UEFI ggf. „Wake on LAN“ bzw. „Power on by PCI-E“ aktivieren.
2. **Schlafen und Aufwachen von Hand:** `sudo systemctl suspend`, dann per Tastatur wecken. Prüfen:
   Netzwerk wieder da, MIRA zeigt den KI-Server wieder online, ein LLM in Open WebUI antwortet
   (GPU nach dem Aufwachen funktionsfähig).
3. **Aufwachen per Wake-on-LAN** (sobald 1. erfüllt ist und der KI-Server schläft): Das Magic Packet
   muss aus dem Server-Netz kommen. Der Homeserver selbst liegt in einem anderen Netz – deshalb aus dem
   MIRA-Container senden (macvlan im Server-Netz; UDP-Broadcast, keine Sonderrechte nötig):
   ```bash
   sudo docker exec mira node -e "const d=require('dgram').createSocket('udp4');const m='<MAC>'.split(':').join('');const p=Buffer.from('ff'.repeat(6)+m.repeat(16),'hex');d.bind(()=>{d.setBroadcast(true);d.send(p,9,'<SERVER_NETZ_BROADCAST>',()=>d.close())})"
   ```
   `<MAC>` aus Prüfung 1 (Format `aa:bb:cc:dd:ee:ff`), `<SERVER_NETZ_BROADCAST>` z. B. die `.255`-Adresse
   des Server-Netzes. Genau so sendet MIRA später selbst.
4. **Leistung im Schlaf:** Wert in der Shelly-App bzw. MIRA notieren – daraus ergibt sich die
   Schwelle `MIRA_AI_SERVER_SLEEP_POWER_W`.

## Abnahme

- [ ] Schlafen per Knopf: Bestätigung, Zustand „schläft“, Shelly zeigt niedrige Leistung, Audit-Eintrag
- [ ] Aufwecken per Knopf: KI-Server innerhalb von 2 min wieder online, LLM antwortet
- [ ] Neustart per Knopf: KI-Server nach dem Neustart wieder online
- [ ] Laufende Sperre (Inhibitor) verhindert den Schlaf; MIRA meldet den Grund
- [ ] Im Schlaf keine Störungsmeldungen, kein ungewolltes Aufwachen durch MIRA

## Offene Angaben (vom Betreiber)

| Angabe | Wofür |
| --- | --- |
| Ergebnis von Suspend/Resume mit GPU (Prüfung 2) | Voraussetzung |
| `Wake-on`-Status und MAC von `eno1` | Aufwecken |
| Broadcast-Adresse des Server-Netzes | Aufwecken |
| Leistung im Schlaf (W) | Erkennung „schläft“ |
