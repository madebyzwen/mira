# A-004 – Update-Hinweis und Benachrichtigungen (Glocke)

- Status: 🔍 umgesetzt, Abnahme ausstehend
- Notiert: 2026-11-07
- Angepasst: 2026-11-10 – Bezeichnungen nach [Stufe 3a](../entwicklung/stufe-03a-ki-server-bereinigung.md) (KI-Server, MIRA-Agent)

## Ziel

MIRA prüft regelmäßig, ob auf GitHub ein neueres Release vorliegt – für **zwei Komponenten**:

| Komponente | installierte Version | neueste Version | Update durch |
| --- | --- | --- | --- |
| **MIRA** (Image in Portainer) | Version des laufenden MIRA | Tag des neuesten Releases (`v0.5.2` → `0.5.2`) | Portainer: „Update the stack“ mit „Re-pull image“ |
| **MIRA-Agent** (KI-Server) | vom Agent gemeldet (`GET /v1/health` → `version`) | Paket im neuesten Release (`mira-agent-0.2.0.tar.gz` → `0.2.0`) | auf dem KI-Server: Paket laden, Prüfsumme prüfen, `sudo ./install.sh` |

Ist eine neuere Version verfügbar, erscheint in der Kopfzeile an der **Glocke** ein Zähler;
im aufgeklappten Bereich steht, welche Version verfügbar ist und wie das Update eingespielt wird.

MIRA **installiert nichts selbst**. Ein Update-Knopf in MIRA ist bewusst zurückgestellt.
Auf dem KI-Server ändert sich nichts: Der Agent prüft nicht selbst, braucht keinen Internetzugang
und bleibt rein lesend.

## Ablauf

```
täglich 04:00  +  beim ersten Aufruf von MIRA im Browser am Tag
  MIRA ──HTTPS──▶ api.github.com/repos/madebyzwen/mira/releases/latest
        ◀── Tag (v0.7.0), Pakete (mira-agent-0.2.0.tar.gz), Datum, Link zu den Release-Notes
  MIRA:  0.7.0 neuer als die laufende Version?               ──▶ Meldung „MIRA 0.7.0 verfügbar“
  Agent: 0.2.0 neuer als die zuletzt vom Agent gemeldete?    ──▶ Meldung „Update für den KI-Server: MIRA-Agent 0.2.0“
Browser: Glocke fragt alle 60 s die Anzahl ungelesener Benachrichtigungen ab
```

Eine Abfrage bei GitHub liefert die Versionen **beider** Komponenten – es gibt also keine
getrennten Prüfungen, und die Grenze von zwei automatischen Prüfungen am Tag gilt für beide zusammen.
Zusätzlich kann der Benutzer jederzeit selbst prüfen (Knopf „Jetzt auf Updates prüfen“).

| | Festlegung |
| --- | --- |
| Quelle | GitHub-API `releases/latest` – nur veröffentlichte Releases (entspricht dem Image-Tag `latest`), keine Entwürfe/Vorabversionen |
| Zugang | ohne Token (Repo öffentlich; Limit 60 Anfragen/h – MIRA braucht höchstens zwei am Tag) |
| Zeitpunkt 1 | **täglich 04:00** Ortszeit (nach der Sicherung um 03:30) – im Backend, auch wenn niemand MIRA geöffnet hat |
| Zeitpunkt 2 | **beim ersten Aufruf von MIRA im Browser an einem Tag** (Laden der Oberfläche bzw. Anmeldung) – sofort, unabhängig von der Prüfung um 04:00. Jeder weitere Aufruf am selben Tag (Ortszeit) prüft **nicht**. Die Seite wartet nicht darauf: Die Prüfung läuft im Hintergrund, die Glocke zeigt das Ergebnis, sobald es vorliegt. Das regelmäßige Abfragen der Glocke (alle 60 s) löst keine Prüfung aus. |
| Höchstens | **zwei automatische Prüfungen am Tag:** eine um 04:00, eine beim ersten Aufruf. MIRA merkt sich das Datum der letzten Aufruf-Prüfung (`settings`), auch über einen Neustart hinweg. |
| Von Hand | Knopf **„Jetzt auf Updates prüfen“** unter Konfiguration › MIRA – jederzeit, zählt **nicht** gegen die zwei automatischen Prüfungen. Schutz vor Dauerklicks: höchstens **eine Prüfung von Hand je Stunde**; in dieser Zeit zeigt der Knopf das letzte Ergebnis und „Erneut prüfen ab 19:12 Uhr möglich“. |
| Kein Abruf beim Container-Start | Nach einem Update von MIRA wird die erledigte Meldung beim Start **ohne Internet** entfernt (Vergleich mit der laufenden Version); eine Abfrage bei GitHub ist dafür nicht nötig. |
| Vergleich | Semver `X.Y.Z`; nur **neuere** Versionen lösen eine Meldung aus |
| Fehler | kein Internet, Zeitüberschreitung (10 s), Antwort ungültig → nur Protokoll, keine Meldung; auch ein fehlgeschlagener Versuch zählt als Prüfung des Tages; nächster Versuch um 04:00 bzw. beim ersten Aufruf am Folgetag |
| Abschaltbar | `MIRA_UPDATE_CHECK=false` – dann keine Verbindung ins Internet (für beide Komponenten) |

### MIRA-Agent (KI-Server) im Besonderen

| Fall | Verhalten |
| --- | --- |
| Installierte Version | Der Agent meldet ab **0.1.4** seine Paketversion in `GET /v1/health` (Feld `version`; `apiVersion` ist die Protokollversion). MIRA liest sie bei jedem Neuladen der Systeminfo (Wiederverbindung, alle 10 min) und merkt sie sich (`settings`) – der KI-Server muss zum Zeitpunkt der Prüfung **nicht erreichbar** sein (z. B. schlafend um 04:00). |
| Agent meldet keine Version | Agent ≤ 0.1.3 – MIRA zeigt „0.1.3 oder älter“ und meldet ein Update, sobald das Release einen neueren Agent enthält |
| KI-Server noch nie erreicht / nicht eingerichtet | keine Meldung für den Agent – es gibt nichts zu vergleichen |
| Update auf dem KI-Server erledigt | meldet der Agent eine Version ≥ der gemeldeten, entfernt MIRA die Meldung **sofort** (bei der nächsten Abfrage, ohne Internet) |
| Kein Agent-Paket im Release | keine Meldung für den Agent |

### Sicherheit

- Feste Adresse (nicht konfigurierbar), nur `GET`, keine Zugangsdaten, Antwort wird geprüft
  (zod) und auf die benötigten Felder reduziert; Länge von Texten begrenzt.
- Versionen nur aus streng geprüften Mustern (`vX.Y.Z`, `mira-agent-X.Y.Z.tar.gz`).
- Der Link zu den Release-Notes wird nur übernommen, wenn er mit
  `https://github.com/madebyzwen/mira/releases/` beginnt.
- Release-Texte (Markdown) werden **nicht** in MIRA angezeigt – nur Version, Datum und Link.
- Benachrichtigungen sind nur nach Anmeldung abrufbar.

## Benachrichtigungen (allgemein)

Die Glocke wird **allgemein** gebaut, nicht nur für Updates. Spätere Quellen sind z. B.
eine fehlgeschlagene Sicherung ([A-003](a-003-datensicherung-in-mira-einsehen.md)) oder
der KI-Server längere Zeit offline. In diesem Schritt gibt es nur die Quellen „Update MIRA“ und
„Update für den KI-Server (MIRA-Agent)“.

| Verhalten | Festlegung |
| --- | --- |
| Zähler | Anzahl **ungelesener** Benachrichtigungen; ab 10 „9+“; ohne ungelesene kein Zähler |
| Gelesen | Öffnen der Glocke markiert die angezeigten Einträge als gelesen; Einträge bleiben in der Liste |
| Entfernen | einzelner Eintrag „ausblenden“ (×) |
| Update erledigt | MIRA: beim Start, Agent: sobald der Agent die neue Version meldet – die Meldung wird automatisch entfernt |
| Mehrere Releases | je Komponente nur **eine** Meldung; eine neuere Version ersetzt die ältere |
| Aufbewahrung | ausgeblendete und gelesene Einträge werden nach 90 Tagen gelöscht (Wartungsaufgabe) |
| Benutzer | MIRA hat ein Konto – der Lesestatus gilt global, nicht je Benutzer |

### Inhalt der Meldungen

> **MIRA 0.5.2 verfügbar**
> Installiert: 0.5.1 · veröffentlicht am 12.11.2026
> Update in Portainer: Stack „mira“ → „Update the stack“ mit „Re-pull image“.
> [Release-Notes auf GitHub ↗]

> **Update für den KI-Server: MIRA-Agent 0.2.0**
> Installiert: 0.1.4 · veröffentlicht am 12.11.2026
> Update auf dem KI-Server: Paket laden, Prüfsumme prüfen, `sudo ./install.sh` – Konfiguration,
> Zertifikat und Token bleiben erhalten.
> [Release auf GitHub ↗] · [Anleitung ↗]

## Datenbank (Core, Migration 2)

| Tabelle | Inhalt |
| --- | --- |
| `notifications` | id, key (eindeutig: `update:mira`, `update:agent`), level (`info`/`warning`/`error`), title, message, link, created_at, read_at, dismissed_at |
| `settings` | `core.update_check`: neuestes Release (Version von MIRA und des Agents), letzte Prüfung, Prüfung je Auslöser (`scheduled`, `visit` mit Kalendertag, `manual`), zuletzt vom KI-Server gemeldete Version des Agents |

## API

| Endpunkt | Inhalt |
| --- | --- |
| `GET /api/v1/notifications` | Liste (ohne ausgeblendete) und Anzahl ungelesener; mit `?refresh=true` (nur beim Laden der Oberfläche) stößt sie die Update-Prüfung an, falls heute noch keine Aufruf-Prüfung stattfand |
| `POST /api/v1/notifications/read` | alle bzw. angegebene als gelesen markieren |
| `DELETE /api/v1/notifications/:id` | ausblenden |
| `GET /api/v1/system/update` | je Komponente: installierte Version, neueste Version; zuletzt geprüft (automatisch oder von Hand), Ergebnis |
| `POST /api/v1/system/update/check` | sofort prüfen (Knopf); antwortet erst mit dem Ergebnis (höchstens 10 s), höchstens eine Prüfung je Stunde (sonst letztes Ergebnis + Zeitpunkt der nächsten möglichen Prüfung); Eintrag im Audit-Log |

## Oberfläche

- **Kopfzeile:** Glocke links neben dem Benutzermenü, Zähler als kleiner Punkt mit Zahl
  (Akzentfarbe); Klick öffnet eine Liste wie das Benutzermenü (Esc/Klick außerhalb schließt).
  Leer: „Keine Benachrichtigungen“.
- **Konfiguration › MIRA – Bereich „Updates“:**
  - je Komponente (MIRA, KI-Server (MIRA-Agent)) eine Zeile: installierte Version, neueste Version und ein
    klarer Zustand – ✅ „Aktuell“ oder 🔔 „Update verfügbar“ (mit Anleitung und Link)
  - „Zuletzt geprüft: heute, 04:00 Uhr (automatisch)“ bzw. „… 18:12 Uhr (von Hand)“ –
    damit jederzeit sichtbar ist, dass und wann geprüft wurde
  - Knopf **„Jetzt auf Updates prüfen“**: zeigt während der Prüfung „Prüfe …“, danach sofort
    das Ergebnis, z. B. „Alles aktuell – MIRA 0.7.0, MIRA-Agent 0.2.0“ oder „Neue Version
    gefunden: MIRA 0.5.2“. Bei einem Fehler eine verständliche Meldung („GitHub nicht
    erreichbar – bitte Internetzugang von MIRA prüfen“) statt eines stillen Fehlschlags.
  - Innerhalb einer Stunde nach einer Prüfung von Hand ist der Knopf ausgegraut, darunter
    „Erneut prüfen ab 19:12 Uhr möglich“ – das letzte Ergebnis bleibt sichtbar.
  - **Kein** Hinweis auf die Zeitpunkte der automatischen Prüfung (04:00, erster Aufruf) –
    diese Information gibt die Oberfläche bewusst nicht preis (Entscheidung 2026-11-07).
  - Ist die Prüfung abgeschaltet (`MIRA_UPDATE_CHECK=false`): Hinweis darauf, Knopf deaktiviert.

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MIRA_UPDATE_CHECK` | `true` | Update-Prüfung ein/aus |
| `MIRA_UPDATE_CHECK_TIME` | `04:00` | Uhrzeit der täglichen Prüfung |

## Netz

MIRA braucht **ausgehend** HTTPS (TCP 443) zu `api.github.com`. Erlaubt die OPNsense für
`<MIRA_IP>` bzw. das Proxy-Netz keinen Internetzugang, ist eine Regel nötig – oder die
Prüfung wird abgeschaltet. Der KI-Server braucht **keinen** Internetzugang.

## Tests

Nachgebildete GitHub-Antwort: neuere / gleiche / ältere Version je Komponente, Vorabversion,
ungültige Antwort, fehlendes Agent-Paket, Zeitüberschreitung, fremder Link; Aufruf-Prüfung nur
einmal je Kalendertag (auch nach Neustart), unabhängig von 04:00; eine Meldung je Komponente,
Ersetzen durch neuere, automatisches Entfernen nach Update (MIRA beim Start, Agent bei
neuer gemeldeter Version); KI-Server offline bzw. nie erreicht; Zähler, Gelesen, Ausblenden,
Aufräumen; Prüfung von Hand (zählt nicht gegen die automatischen, höchstens 1× je Stunde, Ergebnis/Fehler in der Antwort); Endpunkte nur mit Anmeldung; `MIRA_UPDATE_CHECK=false` baut keine Verbindung auf.

## Offene Fragen

| Frage | Vorschlag |
| --- | --- |
| Hat MIRA auf dem Homeserver Internetzugang (OPNsense)? | prüfen; sonst Regel `<MIRA_IP>` → any, TCP 443 |
| Einordnung | als kleiner eigener Schritt vor Stufe 4 (Shelly wartet auf Geräteangaben) |

## Nicht enthalten

- Prüfung durch den Agent selbst (bewusst nicht – MIRA prüft für beide).
- Update auf Knopfdruck aus MIRA (Portainer-API) bzw. auf dem KI-Server ([A-001](a-001-agent-update-automatisieren.md)) – später.
- Push/E-Mail-Benachrichtigungen.
- Anzeige der Release-Notes in MIRA.

## Umsetzung (2026-11-07)

Umgesetzt wie oben beschrieben. Der Knopf heißt „Jetzt prüfen“ (im Bereich „Updates“ unter
Konfiguration › MIRA, Nachtrag 2026-11-07) und zeigt das Ergebnis sofort an; während der Sperrfrist
ist er ausgegraut mit „Erneut prüfen ab … Uhr möglich“.

> **Entwicklungsphase:** Die Sperrfrist ist vorübergehend ausgeschaltet – jeder Klick prüft
> (Entscheidung 2026-11-07). Wieder aktivieren: [A-005](a-005-sperrfrist-jetzt-pruefen-aktivieren.md).

Zählung:

- Jede Prüfung wird **je Auslöser getrennt** gezählt (`scheduled`, `visit`, `manual`) – die Zählung
  wird vor der Abfrage gespeichert, auch Fehlschläge zählen, gleichzeitige Auslöser teilen sich eine
  Abfrage. Eine Prüfung von Hand verbraucht also weder die Prüfung um 04:00 noch die beim Aufruf.
- `POST /api/v1/system/update/check` (Sperrfrist 1 h, Audit-Log) und `nextManualCheckAt` in
  `GET /api/v1/system/update`.

| Was | Wo |
| --- | --- |
| Abfrage bei GitHub, Prüfung der Antwort | `backend/core/updates/github.ts` |
| Zeitpunkte, Zählung, Abgleich der Meldungen | `backend/core/updates/updateService.ts` |
| Endpunkte | `backend/core/updates/routes.ts` |
| Benachrichtigungen (Tabelle, Gelesen, Ausblenden, Aufräumen) | `backend/core/notifications.ts`, Core-Migration 2 |
| Version des Agents an MIRA melden | `agent/src/server.ts` (Health), `backend/modules/systems/aiServerMonitor.ts` |
| Glocke und Liste | `frontend/src/components/layout/Notifications.tsx` |
| Konfiguration › MIRA – Bereich „Updates“ | `frontend/src/pages/config/ConfigMiraPage.tsx` |
| Tests | `backend/test/updates.test.ts`, `backend/test/systems.test.ts`, `agent/test/server.test.ts` |

Hinweise für die Abnahme:

- Der Agent meldet seine Version erst ab **0.1.4**. Ältere Versionen zeigt MIRA als
  „0.1.3 oder älter“.
- Gelesene bzw. ausgeblendete Meldungen werden nach 90 Tagen gelöscht; liegt das Update dann noch
  nicht vor, erscheint die Meldung bei der nächsten Prüfung erneut (Erinnerung).
