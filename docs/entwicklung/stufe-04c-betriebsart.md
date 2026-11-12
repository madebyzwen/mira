# Stufe 4c – Verbrauch nach Betriebsart (KI-Betrieb, Bereitschaft, Windows)

- Status: ⏳ Konzept freigegeben 2026-11-12, Umsetzung steht an (notiert 2026-11-11)
- Baut auf: [Stufe 4a](stufe-04a-shelly-logger.md) (Shelly-Logger), [Stufe 4b](stufe-04b-shelly-mira-integration.md) (Anzeige in MIRA)
- Zielversionen: Shelly-Logger 0.3.0, MIRA 0.10.0 (der Agent bleibt unverändert)
- Reihenfolge: **vor** [Stufe 5a](stufe-05a-schlafen-aufwecken-neustart.md) – siehe unten

## Ziel

MIRA soll nur den Strom ausweisen, den der KI-Server **für die KI** verbraucht. Der KI-Server ist ein
Dual-Boot-Rechner: Läuft Windows (z. B. zum Spielen), darf dieser Verbrauch die KI-Bilanz und die
KI-Kosten nicht verfälschen.

Der Logger zeichnet weiterhin **alles** auf, merkt sich aber zu jeder Messung die **Betriebsart**.
MIRA rechnet daraus den KI-Verbrauch; der Windows-Anteil bleibt getrennt sichtbar.

## Betriebsarten

| Betriebsart | Erkennung | KI-Verbrauch? |
| --- | --- | --- |
| `linux` – KI-Betrieb | Agent auf dem KI-Server erreichbar | ja |
| `standby` – Bereitschaft (Schlaf oder aus) | Leistung unter der Schwelle `LOGGER_STANDBY_POWER_W` (Standard 5 W; gemessen: < 2 W im Schlaf) | **ja** (getrennt ausgewiesen) |
| `windows` – sonstiger Betrieb | Leistung darüber, Agent seit mehr als `LOGGER_OS_SWITCH_DELAY_S` (Standard 120 s) nicht erreichbar | nein |
| `unknown` | noch keine Aussage (z. B. direkt nach dem Start des Loggers, Ausfall über einen Wechsel) | nein |

Festlegungen:

- **Windows hat keinen Ruhezustand** (Festlegung des Betreibers, 2026-11-11): Niedrige Leistung bedeutet
  immer Bereitschaft des KI-Servers.
- **Verzögerung beim Wechsel nach `windows`:** Beim Hochfahren, Aufwachen oder Neustart von Linux ist der
  Agent für ≈ 1 min nicht erreichbar. Erst nach 120 s ohne Agent bei hoher Leistung gilt `windows`;
  bis dahin bleibt die bisherige Betriebsart. Wird der Agent erreichbar, gilt sofort `linux`.
  Ungenauigkeit: höchstens ≈ 2 min je Wechsel.
- **Erkennung ohne MIRA:** Der Logger prüft selbst alle 5 s per Verbindungsaufbau, ob der Agent
  antwortet (TCP zum Agent-Port, ohne Token und ohne Daten). Er bleibt unabhängig von MIRA.
  Dadurch wird Windows auch erkannt, wenn es von Hand im Startmenü gewählt wird.
- **Einschränkung:** Ein hängendes Linux mit hoher Leistung würde als `windows` gezählt.
- **Schwelle Bereitschaft (Entscheidung 2026-11-11):** 5 W statt des gemessenen Werts (< 2 W) – Abstand
  gegen Messschwankungen, die Netzwerkkarte für Wake-on-LAN und angeschlossene Geräte; ein laufender
  Rechner liegt weit darüber. **Einstellbar nur im Logger-Stack** (`LOGGER_STANDBY_POWER_W`), z. B. wenn
  dauerhaft USB-Geräte (externe Festplatten, Ladegeräte) Strom ziehen. MIRA **zeigt** den Wert nur an.
  Eine Änderung gilt ab dem Neustart des Loggers; vergangene Werte bleiben unverändert.

## Speicherung (Logger)

| Änderung | Inhalt |
| --- | --- |
| `power_samples.mode` | Betriebsart je 30-s-Intervall; wechselt sie im Intervall, zählt die überwiegende (Zeitanteil) |
| `power_samples.agent_reachable` | Anteil der Zeit, in der der Agent erreichbar war – Vorsorge für eine spätere Korrektur der Vergangenheit (wird jetzt nicht gebaut) |
| Schwelle mit „gilt seit“ | Der Logger speichert die Schwelle; weicht sie beim Start vom gespeicherten Wert ab, wird der Zeitpunkt der Änderung festgehalten |
| `energy_gaps.mode` | Betriebsart einer Ausfall-Lücke: nur wenn vor **und** nach der Lücke dieselbe galt, sonst `unknown` – so gelangt kein Windows-Verbrauch über eine Lücke in die KI-Bilanz |
| `daily_energy_by_mode` | Tagessummen je Betriebsart (gemessen, rekonstruiert, abgedeckte Zeit); `daily_energy` bleibt als Gesamtsumme |
| Bestehende Daten | Seit Messbeginn (2026-11-10) lief kein Windows (Angabe des Betreibers): Die Migration ordnet die bisherigen Intervalle nach der Leistung `standby` bzw. `linux` zu, Lücken entsprechend; `agent_reachable` bleibt für diese Zeit leer (unbekannt) |

## API (Logger)

- `GET /api/v1/live`: zusätzlich `mode` und `modeSince`
- `GET /api/v1/consumption`: zusätzlich `byMode` (`linux`, `standby`, `windows`, `unknown`) – im Gesamtwert
  und je Eintrag der Aufteilung; die bisherigen Felder bleiben (abwärtsverträglich)
- `GET /health`: Zustand der Agent-Prüfung sowie die Schwelle Bereitschaft mit „gilt seit“ (nur lesend –
  die Logger-API bleibt rein lesend, [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md) unverändert;
  Zugriff wie seit Logger 0.2.0 nur mit Token, `/health` ohne)
- Mit erledigt: **[A-007](../aufgaben/a-007-shelly-ip-in-konfiguration.md)** – Adresse des Shelly in `device`

## Anzeige (MIRA)

- **KI-Verbrauch und KI-Kosten** = `linux` + `standby`; Bereitschaft getrennt ausgewiesen.
- **Windows-Betrieb** als Information daneben (Verbrauch, ohne Kosten in der KI-Bilanz).
- Live: aktuelle Betriebsart („KI-Betrieb“, „Bereitschaft“, „Windows“).
- Konfiguration › Systeme › Shelly Plug: **Anzeige** „Schwelle Bereitschaft: 5 W · gilt seit … · einstellbar
  im Logger-Stack (`LOGGER_STANDBY_POWER_W`)“ – der Wert kommt vom Logger, ändern lässt er sich in MIRA nicht.
- Später nutzbar für Stufe 5a: Der Zustand „schläft“ kann die Betriebsart `standby` des Loggers verwenden.

## Konfiguration

| Ort | Einstellung |
| --- | --- |
| Logger-Stack | `LOGGER_AGENT_PROBE` = Adresse und Port des Agents (`<KI_SERVER_IP>:8443`), `LOGGER_STANDBY_POWER_W` (5; einzige Stelle, an der die Schwelle geändert wird), `LOGGER_OS_SWITCH_DELAY_S` (120) |
| MIRA | keine neue Einstellung – zeigt die Schwelle des Loggers nur an |
| KI-Server | Agent-Konfiguration: Logger-Adresse `<LOGGER_IP>` zusätzlich in `allowedClients`, dann `sudo ./install.sh` (Firewall-Regel des Agents); keine Regel in der Firewall des Netzes nötig (gleiches Netz) |

## Tests

Erkennung (Agent erreichbar/nicht erreichbar, Verzögerung, sofortiger Wechsel nach `linux`, Schwelle
Bereitschaft), Mehrheitsregel im Intervall, Lücken über einen Wechsel, Tagessummen je Betriebsart,
Migration bestehender Daten, API-Verträge (alte Felder unverändert), MIRA-Berechnung der KI-Kosten.

## Reihenfolge (Festlegung 2026-11-11)

**4c → 5a → [A-008](../aufgaben/a-008-schnellaktion-windows-booten.md)**

1. Windows ist heute schon von Hand startbar – jede Sitzung vor 4c landet ungekennzeichnet in der
   KI-Bilanz und lässt sich nachträglich nicht sauber trennen.
2. 5a nutzt die Betriebsart `standby` des Loggers für den Zustand „schläft“, statt eine eigene
   Leistungsschwelle zu pflegen.
3. 4c ist sofort umsetzbar; für 5a stehen noch Prüfungen am KI-Server aus.
4. A-008 braucht den Neustart aus 5a und den Zustand „Windows“ aus 4c.

## Offene Angaben (vom Betreiber)

| Angabe | Wofür |
| --- | --- |
| ~~Lief seit Messbeginn Windows?~~ | ✅ Nein (2026-11-11) |
| ~~Umsetzung vor Stufe 5a?~~ | ✅ Ja, siehe Reihenfolge |
| ~~Freigabe des Konzepts~~ | ✅ 2026-11-12 |
