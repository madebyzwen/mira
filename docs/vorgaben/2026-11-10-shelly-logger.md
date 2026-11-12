# MIRA – Shelly Logger: Architektur und Implementierung

> Originalwortlaut, übergeben am 2026-11-10. Umsetzung: [Stufe 4a](../entwicklung/stufe-04a-shelly-logger.md),
> Entscheidung: [ADR 0010](../adr/0010-shelly-logger-als-eigener-container.md). Bezeichnung des
> KI-Servers seither nach [ADR 0009](../adr/0009-ki-server-als-rolle-agent-mira-agent.md).

## Ausgangslage

Du arbeitest im Repository `madebyzwen/mira`.

MIRA ist eine modulare Verwaltungsplattform für lokale KI-Infrastruktur. Sie läuft auf dem NAS Asgard und verwaltet unter anderem den KI-Server Odin.

Der aktuelle Projektstand ist bereits fortgeschritten: React-Frontend, TypeScript-/Fastify-Backend, SQLite, Authentifizierung, Odin-API und Messwerthistorie sind vorhanden.

**Analysiere vor jeder Änderung den tatsächlichen Repository-Stand. Bestehende Funktionen und Architekturentscheidungen dürfen nicht unbeabsichtigt verändert werden.**

## 1. Neue Architekturentscheidung

Die bisherige Planung in `docs/entwicklung/stufe-04-shelly.md` sieht noch eine direkte Shelly-Abfrage durch MIRA vor.

Diese Entscheidung wird hiermit ausdrücklich ersetzt.

Wir entwickeln einen eigenständigen Docker-Container mit dem Arbeitsnamen:

`mira-shelly-logger`

Dieser Container wird dauerhaft auf Asgard betrieben und erfasst den Stromverbrauch des KI-Servers Odin über einen Shelly Plug PM.

Er arbeitet unabhängig von MIRA und Odin.

Auch wenn Odin schläft oder MIRA neu startet, muss die Messwerterfassung weiterlaufen.

Der Logger erhält eine eigene persistente SQLite-Datenbank. Es darf keinen gemeinsamen schreibenden Zugriff mehrerer Container auf dieselbe SQLite-Datei geben.

Die spätere MIRA-Integration erfolgt ausschließlich über eine kleine interne, lesende API des Loggers.

## 2. Technische Rahmenbedingungen

Verwende bevorzugt die vorhandenen Technologien:

- Node.js 22
- TypeScript
- Fastify für die interne API
- SQLite
- Docker / Portainer

Lege den Logger als eigenständiges Paket im bestehenden Monorepository an.

Vermeide ein zweites Frontend, unnötige Frameworks, Microservices oder zusätzliche Datenbankserver.

Der Logger benötigt keine eigene Benutzeroberfläche.

Das Container-Image soll getrennt vom bisherigen MIRA-Image gebaut und versioniert werden können.

Vorgesehener Image-Name:

`ghcr.io/madebyzwen/mira-shelly-logger`

## 3. Lokale Shelly-Anbindung

Der Logger kommuniziert ausschließlich über das lokale Netzwerk mit dem Shelly.

Keine Herstellercloud, kein Shelly-Benutzerkonto und keine externen Dienste.

Vor der Implementierung müssen Modell, Gerätegeneration und API-Fähigkeiten erkannt beziehungsweise verifiziert werden.

Beim Shelly Plug PM Gen3 erfolgt die Leistungsabfrage über:

`GET /rpc/PM1.GetStatus?id=0`

Relevante Messwerte sind insbesondere:

- `apower`: aktuelle Wirkleistung in Watt
- `voltage`: Spannung
- `current`: Stromstärke
- `aenergy.total`: kumulierter Energieverbrauch in Wh

Implementiere keine Schaltbefehle, keine Energiezähler-Resets und keine Änderung der Shelly-Gerätekonfiguration.

Die Anwendung soll ausschließlich Messwerte lesen.

## 4. Live-Messung

Das Standard-Abfrageintervall beträgt:

**1.000 Millisekunden.**

Es muss über eine Konfiguration auf 2.000 Millisekunden umgestellt werden können.

Die Erfassung läuft permanent, unabhängig davon, ob MIRA geöffnet ist.

Wichtige Anforderungen:

- Nur ein zentraler Polling-Prozess.
- Keine parallelen HTTP-Abfragen an den Shelly.
- Asynchrone, nicht blockierende Netzwerkzugriffe.
- Verbindung nach Möglichkeit wiederverwenden.
- Kurze, konfigurierbare Timeouts.
- Fehler und Unterbrechungen sauber behandeln.
- Kein unkontrolliertes Retry-Verhalten.
- Beim Beenden des Containers laufende Arbeiten sauber abschließen.

Der jeweils aktuellste gültige Messwert wird im Arbeitsspeicher gehalten.

Er muss sofort über die interne API verfügbar sein, ohne dass dafür SQLite abgefragt wird.

Jeder Live-Wert enthält seinen Messzeitpunkt.

Ist der letzte Messwert älter als eine konfigurierbare Frist, muss die API ihn als veraltet beziehungsweise das Gerät als nicht erreichbar kennzeichnen.

Alte Werte dürfen niemals als neue Live-Messung dargestellt werden.

## 5. Messwertspeicherung

Live-Messungen werden zunächst im Arbeitsspeicher gesammelt.

Alle 30 Sekunden wird ein verdichteter Datensatz in SQLite geschrieben.

Dieser enthält mindestens:

- Zeitstempel und Intervallgrenzen
- Durchschnittliche Leistungsaufnahme
- Minimale Leistungsaufnahme
- Maximale Leistungsaufnahme
- Anzahl gültiger Messungen
- Durchschnittliche Spannung
- Energieverbrauch in Wh
- Datenqualitätsstatus

Der Durchschnitt soll bei unregelmäßigen Messabständen nach Möglichkeit zeitgewichtet berechnet werden.

Der tatsächliche Energieverbrauch wird bevorzugt aus der Differenz der kumulierten Energiezählerstände des Shelly ermittelt.

**Die aktuelle Wattzahl darf nicht mit dem tatsächlich verbrauchten Energiewert gleichgesetzt werden.**

Erkenne Zählerrücksetzungen, unplausible Sprünge, Messausfälle und Unterbrechungen.

Fehlende Messwerte dürfen nicht als gemessene 0 Watt oder 0 Wh gespeichert werden.

Bei längeren Ausfällen muss zwischen rekonstruierbarer Gesamtenergie und unbekannter zeitlicher Verteilung unterschieden werden.

Bei Neustarts des Loggers dürfen bereits gespeicherte Verbrauchswerte nicht doppelt gezählt werden.

## 6. Verbrauchsstatistiken

Der Logger soll folgende Verbrauchswerte bereitstellen:

1. Tagesverbrauch: heute seit 00:00 Uhr
2. Wochenverbrauch: Montag 00:00 Uhr bis jetzt
3. Monatsverbrauch: erster Kalendertag bis jetzt
4. Jahresverbrauch: 1. Januar bis jetzt

Alle Zeiträume verwenden die Zeitzone `Europe/Berlin`.

Die Speicherung interner Zeitstempel erfolgt in UTC.

Sommer- und Winterzeitwechsel müssen korrekt berücksichtigt werden.

Nicht abgeschlossene Tage, Wochen, Monate und Jahre zeigen jeweils nur den bereits tatsächlich erfassten Verbrauch.

Historische, abgeschlossene Zeiträume müssen abrufbar bleiben.

### Datenbank

Vorgeschlagene Tabellen:

- `power_samples`: 30-Sekunden-Verdichtungen
- `daily_energy`: tägliche Verbrauchssummen

Wochen-, Monats- und Jahreswerte werden aus den Tageswerten berechnet.

Zusätzliche Verdichtungstabellen sollen nur entstehen, wenn sie nachweislich erforderlich sind.

Die Verdichtung muss nach Neustarts und bei wiederholter Ausführung konsistente Ergebnisse liefern.

## 7. Datenaufbewahrung

Zunächst erfolgt **keine automatische Löschung von Messdaten**.

Insbesondere darf der Jahreswechsel keine Bereinigung auslösen.

Auch die Tagesstatistiken bleiben dauerhaft erhalten.

Eine spätere manuelle Datenbankbereinigung soll möglich sein, gehört aber noch nicht zum ersten Implementierungsumfang.

Die bestehende Aufbewahrung der Odin-Systemmesswerte in MIRA darf durch diese Entscheidung nicht verändert werden.

### Datenbankgröße

Der Logger soll über seine API Informationen zur Datenbank bereitstellen:

- Aktuelle physische Datenbankgröße einschließlich relevanter SQLite-Nebendateien
- Anzahl gespeicherter Messintervalle
- Ältester und neuester Messzeitpunkt

Diese Informationen müssen nicht sekündlich aktualisiert werden.

Eine periodische Aktualisierung ist ausreichend.

## 8. Interne API

Der Logger benötigt eine kleine, ausschließlich lesende HTTP-API.

Vorgeschlagene Endpunkte:

- `GET /health`
- `GET /api/v1/live`
- `GET /api/v1/consumption?period=day`
- `GET /api/v1/consumption?period=week`
- `GET /api/v1/consumption?period=month`
- `GET /api/v1/consumption?period=year`
- `GET /api/v1/history`
- `GET /api/v1/database/stats`

Die Verbrauchsabfragen sollen später auch abgeschlossene historische Zeiträume unterstützen.

Lege die API-Verträge klar fest und verwende konsistente JSON-Antworten.

Die API darf keine Schalt-, Lösch- oder sonstigen administrativen Aktionen am Shelly anbieten.

Die Verbindung zwischen MIRA und Logger bleibt auf das interne Docker-Netzwerk beschränkt und darf nicht öffentlich veröffentlicht werden.

Prüfe, wie die Container auf Asgard sicher miteinander kommunizieren können, ohne unnötigen Zugriff auf Management-Netzwerke zu eröffnen.

## 9. Performance-Anforderungen

Dieser Punkt hat hohe Priorität.

**Die Live-Ansicht in MIRA darf durch das sekündliche Polling nicht spürbar träger werden.**

Deshalb:

- Der Browser darf niemals direkt den Shelly abfragen.
- Der Logger hält Live-Werte im RAM.
- Live-API-Anfragen dürfen keine Datenbankabfrage auslösen.
- Schreiboperationen müssen die Live-Abfrage möglichst wenig beeinflussen.
- Statistische Auswertungen dürfen nicht bei jeder Live-Abfrage neu berechnet werden.
- Eine hängende Shelly-Anfrage darf den API-Server nicht blockieren.
- Kein unnötiges Logging jedes einzelnen erfolgreichen Polling-Vorgangs.
- Keine permanente Übertragung großer Datensätze für die Live-Anzeige.

Für die spätere MIRA-Integration soll zunächst das vorhandene Polling-Konzept genutzt werden, statt vorsorglich eine neue WebSocket- oder SSE-Infrastruktur einzuführen.

Die Aktualisierung der MIRA-Oberfläche soll mit einem Intervall von einer oder zwei Sekunden möglich sein und nur bei sichtbarer Ansicht erfolgen.

Das tatsächliche Polling-Intervall am Shelly bleibt davon unabhängig.

Entwickle einen nachvollziehbaren Test, der die Last und Stabilität bei einsekündigem Polling überprüft.

Dokumentiere dabei:

- Tatsächlich erreichte Abfragefrequenz
- Antwortzeiten des Shelly
- Fehlerrate
- CPU- und RAM-Verbrauch des Loggers
- API-Antwortzeiten
- Schreiblast der SQLite-Datenbank

Falls das Ein-Sekunden-Intervall nachweislich problematisch ist, muss ein Wechsel auf zwei Sekunden ohne Codeänderung möglich sein.

## 10. Datensicherheit und Betrieb

- SQLite-Datenbank in einem persistenten Docker-Volume beziehungsweise NAS-Verzeichnis.
- Keine Datenbankdateien im Container-Image.
- Konsistente Backups mit einer SQLite-kompatiblen Backup-Methode.
- Kein Docker-Socket im Container.
- Betrieb als unprivilegierter Benutzer.
- Keine unnötigen Linux-Capabilities.
- Möglichst schreibgeschütztes Root-Dateisystem.
- Konfiguration über Umgebungsvariablen und gegebenenfalls Secret-Dateien.
- Keine Passwörter oder Zugangsdaten im Repository.
- Keine öffentlich veröffentlichten API-Ports.
- Healthcheck für den Container.
- Geordneter Neustart ohne Beschädigung der Messdaten.

Der Logger muss weiterlaufen, wenn Odin ausgeschaltet oder suspendiert ist.

Der Status „Odin schläft“ ist nicht gleichbedeutend mit einem Fehler der Shelly-Messung.

## 11. Docker-Integration

Der Shelly-Logger soll als eigenständiger Container auf Asgard betrieben werden.

Erstelle eine geeignete Dockerfile und Compose-Konfiguration.

Prüfe den bestehenden Portainer-Stack und die verwendeten Docker-Netzwerke, bevor du Änderungen vorschlägst.

Vorhandene MIRA-, Nginx-Proxy-Manager- und Odin-Verbindungen dürfen nicht beeinträchtigt werden.

Deployment-Anpassungen am produktiven Stack müssen separat dokumentiert werden.

Nimm keine eigenständigen Änderungen an Asgard, Odin, der Firewall oder dem Shelly vor.

## 12. Umsetzung in getrennten Entwicklungsstufen

### Stufe A – Shelly Logger

Implementiere zunächst ausschließlich:

- Eigenständiges Logger-Paket.
- Lokale Shelly-Abfrage.
- Live-Cache.
- 30-Sekunden-Verdichtung.
- SQLite-Persistenz.
- Tages-, Wochen-, Monats- und Jahresstatistiken.
- Interne Lese-API.
- Docker-Image.
- Automatisierte Tests.
- Installations- und Betriebshandbuch.

Die bestehende MIRA-Weboberfläche soll in dieser Stufe unverändert bleiben.

### Stufe B – MIRA-Integration (später)

Erst nach gesonderter Freigabe:

- Logger über das MIRA-Backend anbinden.
- Live-Anzeige in der Shelly-View.
- Verbrauch heute, Woche, Monat und Jahr.
- Historische Diagramme.
- Datenbankgröße anzeigen.
- Stromkosten aus der MIRA-Tarifkonfiguration berechnen.
- Bestehende MIRA-Komponenten und API-Konventionen wiederverwenden.

Der Strompreis bleibt in der Konfiguration von MIRA und wird nicht als Teil der Messwerterfassung im Shelly-Logger gespeichert.

## 13. Testanforderungen

Nutze zunächst einen simulierten Shelly für reproduzierbare Tests.

Teste mindestens:

- Erfolgreiche Abfragen alle 1.000 ms.
- Wechsel auf 2.000 ms per Konfiguration.
- Langsame beziehungsweise hängende Antworten.
- Keine parallelen Geräteabfragen.
- Durchschnitt, Minimum und Maximum.
- Fehlende Messwerte.
- Energiezähler-Rücksetzungen.
- Neustarts während eines laufenden Messintervalls.
- Korrekte tägliche Verbrauchssummen.
- Wochenwechsel.
- Monats- und Jahreswechsel.
- Sommer- und Winterzeit.
- Konsistente API-Antworten.
- Datenbankwachstum und Persistenz.
- Verhalten bei suspendiertem Odin.
- Neustart und Wiederherstellung des Loggers.

Die Messdaten müssen die Grundlage der Berechnungen nachvollziehbar machen.

## 14. Dokumentation und bestehende Entscheidungen

Aktualisiere die Architektur- und Roadmap-Dokumentation.

Insbesondere muss die alte Entscheidung „kein separater Shelly-Container“ nachvollziehbar durch die neue Entscheidung ersetzt werden.

Bereits akzeptierte ADRs dürfen nicht einfach stillschweigend umgeschrieben werden. Dokumentiere gegebenenfalls die neue Entscheidung als ergänzende ADR mit Verweis auf die abgelöste Planung.

Die bisherige Odin-Messwerthistorie bleibt unverändert.

## 15. Aktueller Arbeitsauftrag

1. Analysiere zuerst das Repository und die vorhandene Shelly-Planung.
2. Lege einen kurzen technischen Plan für die neue Logger-Architektur vor.
3. Implementiere anschließend ausschließlich **Stufe A**.
4. Ergänze automatisierte Tests und die Docker-Build-Konfiguration.
5. Führe Tests, Typecheck und Build aus.
6. Dokumentiere Inbetriebnahme, API, Datenformat und Betrieb.
7. Berichte über die Ergebnisse, verbleibende Risiken und noch benötigte Konfigurationswerte.

**Keine produktive Installation und keine MIRA-Frontend-Integration ohne unsere ausdrückliche Freigabe.**

Halte die Lösung einfach, modular, nachvollziehbar und performant.
