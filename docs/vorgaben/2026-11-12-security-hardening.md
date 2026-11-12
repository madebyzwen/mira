# Arbeitsauftrag für Claude Code: MIRA – Security Hardening, Bugfixes und Qualitätssicherung

## 1. Rolle und Zielsetzung

Du arbeitest als erfahrener Senior Software Architect, Security Engineer und TypeScript-Entwickler am Projekt **MIRA – Management, Infrastructure, Resources & Automation**.

Repository: https://github.com/madebyzwen/mira

Deine Aufgabe ist eine umfassende Überprüfung und anschließende Behebung bereits identifizierter Programmfehler, Sicherheitsrisiken und Schwachstellen der Betriebssicherheit.

**Ziel:** MIRA soll vor der Implementierung weiterer Funktionen eine stabilere, sicherere und besser getestete Grundlage erhalten.

Es handelt sich ausdrücklich um einen Wartungs- und Härtungsauftrag, nicht um die Implementierung neuer Funktionen aus der Roadmap.

### Verbindliche Arbeitsregeln

1. Lies zunächst die aktuelle Projektarchitektur, Dokumentation, Roadmap und den tatsächlichen Quellcode.
2. Überprüfe jeden beschriebenen Befund unabhängig. Übernimm keine frühere Bewertung ungeprüft.
3. Unterscheide zwischen bestätigten Fehlern, konfigurationsabhängigen Risiken und optionalen Verbesserungen.
4. Behebe bestätigte Probleme vollständig und an ihrer eigentlichen Ursache.
5. Bewahre bestehende Schnittstellen, Datenmodelle und Funktionen, sofern eine Änderung nicht zwingend notwendig ist.
6. Bevorzuge klare, wartbare Lösungen gegenüber unnötiger Abstraktion und zusätzlichen Frameworks.
7. Ergänze für jeden behobenen Fehler geeignete automatisierte Tests.
8. Prüfe Auswirkungen auf bestehende Docker-Stacks, Datenbanken, Konfigurationsdateien und Installationen.
9. Führe keine Änderungen an produktiven Servern, Netzwerkregeln oder Zugangsdaten durch.
10. Frage nur dann nach, wenn eine Entscheidung nicht reversibel ist, Produktionszugriff verändert oder der Betreiber ausdrücklich eingreifen muss.
11. Verheimliche keine Probleme und stelle keine ungetestete Lösung als erfolgreich getestet dar.
12. Implementiere keine neuen Features aus Stufe 4c, 5a oder späteren Roadmap-Stufen.

Änderungen am Quellcode im lokalen Arbeitsverzeichnis sind ausdrücklich erwünscht. Deployment, Push auf GitHub und Änderungen an produktiven Systemen sind nicht Bestandteil dieses Auftrags.

## 2. Projektarchitektur

MIRA ist eine selbst gehostete Anwendung mit folgenden Bestandteilen:

| Komponente | Technologie | Aufgabe |
|---|---|---|
| Frontend | React, TypeScript, Vite | Weboberfläche |
| Backend | Node.js, Fastify, TypeScript | Authentifizierung, API, Scheduler und Fachmodule |
| Datenhaltung | SQLite | Benutzer, Sessions, Einstellungen, Historie |
| MIRA-Agent | Node.js, Fastify, HTTPS | Monitoring des KI-Servers |
| Shelly-Logger | Node.js, SQLite | Kontinuierliche Stromverbrauchserfassung |
| Deployment | Docker, Docker Compose, Portainer | Betrieb der Container |
| Netzwerk | macvlan, internes Docker-Netz, Reverse Proxy | Kommunikation zwischen den Komponenten |
| CI/CD | GitHub Actions | Tests, Builds und Container-Images |

MIRA und der Shelly-Logger laufen auf einem Homeserver mit Docker. Der MIRA-Agent läuft als systemd-Dienst auf einem Linux-KI-Server.

Die Weboberfläche ist über einen Nginx Proxy Manager mit HTTPS erreichbar. Die Kommunikation zwischen MIRA und dem Agent erfolgt über HTTPS mit Zertifikats-Pinning und Bearer-Token.

Der Shelly-Logger kommuniziert ausschließlich lesend mit einem Shelly Plug über dessen lokale HTTP-API und stellt MIRA Messwerte über ein internes Docker-Netz bereit.

### Architekturprinzipien, die erhalten bleiben müssen

- Keine Abhängigkeit von Cloud-Diensten für den normalen MIRA-Betrieb.
- Kein öffentlich erreichbarer Internetzugang zu MIRA.
- Zugang ausschließlich aus den ausdrücklich erlaubten Netzen beziehungsweise über VPN.
- Keine Speicherung von Passwörtern oder Tokens im Repository.
- Keine Zugangsdaten im Browser.
- Keine beliebige Befehlsausführung über den MIRA-Agent.
- Unprivilegierte Prozesse und Container.
- Modulare Backend-Architektur.
- Bestehende SQLite-Daten müssen erhalten bleiben.
- Migrationen müssen wiederholbar beziehungsweise sicher vor erneuter Anwendung sein.
- Der Shelly-Logger muss unabhängig von MIRA weiterlaufen können.
- Die Stromverbrauchsmessung darf bei einem MIRA-Update nicht verloren gehen.

Lies vor dem Beginn insbesondere:

- `README.md`
- `docs/README.md`
- `docs/entwicklung/roadmap.md`
- `docs/architektur/sicherheit.md`
- `docs/architektur/zielarchitektur.md`
- `docs/adr/`
- `deploy/portainer-stack.yml`
- `deploy/shelly-logger-stack.yml`
- `agent/install/`
- `backend/core/`
- `backend/modules/systems/`
- `shelly-logger/src/`

## 3. Vorgehensweise

Arbeite in fünf Phasen.

### Phase A – Bestandsaufnahme und Verifikation

1. Bestimme den aktuellen Git-Commit und den Zustand des Arbeitsverzeichnisses.
2. Prüfe, ob bereits uncommittete Änderungen vorhanden sind, und bewahre diese vollständig.
3. Lies die vorhandenen Tests.
4. Führe vorhandene Typechecks, Tests und Builds aus.
5. Prüfe die nachfolgend aufgeführten Befunde auf technische Richtigkeit.
6. Dokumentiere abweichende Erkenntnisse.
7. Prüfe insbesondere, ob eine vermeintliche Sicherheitslücke bereits durch eine andere Schutzschicht zuverlässig verhindert wird.

Erstelle eine interne Arbeitstabelle mit den Spalten:

- ID
- Komponente
- Befund
- Risikostufe
- Bestätigt / nicht bestätigt / konfigurationsabhängig
- Ursache
- Geplante Korrektur
- Erforderliche Tests

Anschließend sollst du die bestätigten Probleme bearbeiten.

### Phase B – Sicherheitsprobleme beheben

### S-01: Unverschlüsselter HTTP-Direktzugriff auf MIRA

**Betroffene Stellen:**

- `deploy/portainer-stack.yml`
- `backend/core/auth/authPlugin.ts`
- `backend/core/http/security.ts`
- `backend/core/config.ts`

**Problem:**

MIRA besitzt über macvlan eine eigene Adresse im Server-VLAN und lauscht dort standardmäßig auf HTTP-Port 80.

Gleichzeitig wird der Zugriff über den Reverse Proxy mittels HTTPS angeboten.

Bei einem direkten HTTP-Zugriff können Benutzername, Passwort und Session-Cookie unverschlüsselt übertragen werden.

Zusätzlich setzt das Backend das `Secure`-Attribut des Session-Cookies abhängig vom erkannten Anfrageprotokoll.

**Aufgaben:**

1. Prüfe sämtliche vorgesehenen Zugriffswege zu MIRA.
2. Erarbeite eine Lösung, die Benutzeranmeldungen ausschließlich über einen vertrauenswürdigen HTTPS-Zugang erlaubt.
3. Verhindere, dass Zugangsdaten über direkte HTTP-Zugriffe übertragen werden können.
4. Erzwinge für den Produktionsbetrieb sichere Session-Cookies.
5. Prüfe, ob HTTP-Anfragen serverseitig eindeutig abgelehnt werden können.
6. Beachte, dass die macvlan-Verbindung gegebenenfalls weiterhin für ausgehende Verbindungen zum KI-Server und spätere Wake-on-LAN-Funktionen benötigt wird.
7. Verlasse dich nicht ausschließlich auf eine Anwendungsmeldung, wenn bereits Zugangsdaten per HTTP übertragen wurden.
8. Prüfe, welche Netzwerkschnittstellen tatsächlich als Listener benötigt werden.
9. Dokumentiere erforderliche Anpassungen am Reverse Proxy und an der Netzwerkisolation.

**Wichtig:** Eine Anmeldung darf nicht versehentlich unbrauchbar werden. Eine Änderung, die produktiv die Erreichbarkeit beeinflusst, muss klar dokumentiert und für ein kontrolliertes Deployment vorbereitet werden.

**Abnahmekriterien:**

- Benutzeranmeldung über HTTPS funktioniert.
- Session-Cookies besitzen im Produktionsbetrieb `Secure`, `HttpOnly` und `SameSite=Strict`.
- Ein unverschlüsselter Direktzugriff ermöglicht keine Übertragung von Anmeldedaten.
- Der Reverse Proxy bleibt funktionsfähig.
- Die interne Kommunikation zu den verwalteten Systemen bleibt erhalten.

### S-02: Vertrauenswürdige Reverse-Proxy-Adressen einschränken

**Betroffene Stellen:**

- `backend/core/config.ts`
- `backend/core/http/security.ts`
- `deploy/portainer-stack.yml`

**Problem:**

`MIRA_TRUST_PROXY` kann ein vollständiges Docker-Subnetz als vertrauenswürdig markieren.

Befinden sich darin weitere Container, könnten diese möglicherweise Forwarded-Header beeinflussen und Client-IP-Adressen vortäuschen.

**Aufgaben:**

- Prüfe die tatsächliche Fastify-Implementierung von `trustProxy`.
- Empfehle beziehungsweise implementiere ein möglichst enges Vertrauensmodell.
- Bevorzuge eine konkrete Proxy-IP oder ein dediziertes Proxy-Netz.
- Prüfe die Auswertung von `X-Forwarded-For`, `X-Forwarded-Proto` und `X-Forwarded-Host`.
- Stelle sicher, dass fremde Absender Forwarded-Header nicht unberechtigt verwenden können.
- Prüfe außerdem die Origin-Prüfung bei schreibenden API-Anfragen: Nicht nur Host und Port, sondern auch das Protokoll müssen korrekt berücksichtigt werden.
- Bewahre die Kompatibilität mit legitimen API-Aufrufen, die keinen Origin-Header senden.

**Tests:**

- Vertrauenswürdiger Reverse Proxy.
- Nicht vertrauenswürdiger Container.
- Manipulierte Forwarded-Header.
- Unterschiedliche Protokolle bei identischem Hostnamen.
- Korrekte IP-Adressen im Audit-Log und bei der Login-Sperre.

### S-03: Sichere Passwortänderung implementieren

**Betroffene Stellen:**

- `backend/core/auth/`
- `backend/core/db/`
- `frontend/src/pages/config/ConfigMiraPage.tsx`

**Problem:**

Aktuell fehlt eine reguläre Funktion zur Passwortänderung.

**Aufgaben:**

Implementiere eine sichere Passwortänderung für den angemeldeten Benutzer.

Anforderungen:

1. Das aktuelle Passwort muss korrekt eingegeben werden.
2. Das neue Passwort muss mindestens die bestehende Mindestlänge erfüllen.
3. Das neue Passwort wird ausschließlich über die vorhandene scrypt-Implementierung gehasht.
4. Das Passwort darf niemals in Logs, Fehlermeldungen oder API-Antworten erscheinen.
5. Die Änderung muss atomar in der Datenbank erfolgen.
6. Nach erfolgreicher Änderung müssen bestehende Sessions des Benutzers widerrufen werden.
7. Der Benutzer muss sich anschließend erneut anmelden.
8. Die Aktion muss angemessen im Audit-Log erscheinen.
9. Die Benutzeroberfläche soll eine verständliche Passwortänderung unter Konfiguration › MIRA anbieten.
10. Das ursprüngliche Startpasswort aus der Secret-Datei darf niemals bei einem Neustart das neue Passwort überschreiben.

Implementiere außerdem eine Möglichkeit, alle aktiven Sessions des eigenen Kontos zu widerrufen, sofern dies ohne unverhältnismäßige Erweiterung des Projekts möglich ist.

**Tests:**

- Richtiges aktuelles Passwort.
- Falsches aktuelles Passwort.
- Ungültiges neues Passwort.
- Erfolgreiche Änderung.
- Erneute Anmeldung.
- Alte Session ist ungültig.
- Andere aktive Sessions desselben Benutzers sind ungültig.
- Keine Offenlegung von Passwörtern.

### S-04: Sicherheitsprüfungen in die CI integrieren

**Betroffene Stellen:**

- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- Dockerfiles

**Problem:**

Die bestehende CI führt Tests und Typechecks durch, jedoch keine verpflichtende Schwachstellenanalyse der Abhängigkeiten und Container-Images.

**Aufgaben:**

1. Ergänze eine Prüfung der npm-Abhängigkeiten.
2. Ergänze eine Sicherheitsprüfung der produktiven Docker-Images.
3. Prüfe bekannte Schwachstellen der verwendeten Node.js-Basisimages.
4. Prüfe, ob GitHub-Actions-Abhängigkeiten sicher versioniert sind.
5. Bewerte die Abhängigkeiten hinsichtlich bekannter Sicherheitslücken.
6. Aktualisiere gefährdete Bibliotheken nur unter Beachtung ihrer Kompatibilität.
7. Dokumentiere verbleibende Schwachstellen und begründete Ausnahmen.
8. Verwende einen sinnvollen Severity-Schwellwert für fehlgeschlagene CI-Läufe.
9. Stelle sicher, dass der Workflow keine Secrets preisgibt.

Geeignete Werkzeuge sind beispielsweise `npm audit`, OSV-Scanner und Trivy.

Wähle eine wartbare Kombination, ohne unnötig viele Scanner parallel einzuführen.

### S-05: Container-Härtung vereinheitlichen

**Betroffene Stellen:**

- `Dockerfile`
- `shelly-logger/Dockerfile`
- `deploy/portainer-stack.yml`
- `deploy/shelly-logger-stack.yml`

**Problem:**

Der Shelly-Logger besitzt bereits `cap_drop: ALL`. Im MIRA-Stack fehlt diese Einstellung.

**Aufgaben:**

- Ergänze `cap_drop: ALL`, sofern die vorhandenen Funktionen dies erlauben.
- Prüfe `no-new-privileges`.
- Prüfe den unprivilegierten Container-Benutzer.
- Prüfe das schreibgeschützte Root-Dateisystem.
- Prüfe notwendige Schreibverzeichnisse und tmpfs.
- Prüfe unnötige Linux-Capabilities.
- Verhindere privilegierte Container-Ausführung.
- Prüfe die Auswirkungen auf Netzwerkzugriffe und den vorgesehenen UDP-Broadcast für spätere Wake-on-LAN-Funktionen.

**Abnahmekriterien:**

- MIRA startet weiterhin korrekt.
- SQLite ist beschreibbar.
- HTTPS-Verbindung zum Agent funktioniert.
- Verbindung zum Shelly-Logger funktioniert.
- Keine unnötigen Container-Berechtigungen.

### S-06: Interne Shelly-Logger-API zusätzlich absichern

**Betroffene Stellen:**

- `shelly-logger/src/server.ts`
- `shelly-logger/src/config.ts`
- `backend/modules/systems/shelly/loggerClient.ts`
- beide Portainer-Stacks

**Problem:**

Die Logger-API unterstützt bereits Bearer-Token, diese sind im vorgesehenen Stack standardmäßig nicht aktiviert.

**Aufgaben:**

1. Prüfe zunächst die vorhandene Netzwerkisolation.
2. Aktiviere für den Produktionsbetrieb eine zusätzliche Token-Authentifizierung.
3. Verwende ein ausreichend zufälliges Token.
4. Übergib das Token ausschließlich über Secret-Dateien.
5. Ergänze die erforderlichen Stack-Konfigurationen.
6. Dokumentiere die einmalige Einrichtung.
7. Implementiere eine fehlertolerante, aber sichere Inbetriebnahme.
8. Stelle sicher, dass die öffentliche Healthcheck-Route weiterhin wie vorgesehen funktioniert.
9. Erhalte die rein lesende API.

Achte besonders darauf, dass bei einer Umstellung nicht versehentlich ein funktionierender Logger von MIRA getrennt wird.

## 4. Programmfehler beheben

### F-01: Dauerhaft veraltete historische Verbrauchswerte

**Datei:** `backend/modules/systems/shelly/shellyService.ts`

**Problem:**

Abgeschlossene Verbrauchszeiträume werden unbegrenzt zwischengespeichert.

Werden Messwerte nachträglich rekonstruiert oder korrigiert, kann MIRA alte Werte aus dem Cache ausliefern.

**Aufgaben:**

- Prüfe die Cache-Strategie von `consumptionCache` und `monthCache`.
- Identifiziere sämtliche Stellen, an denen abgeschlossene Zeiträume dauerhaft gecacht werden.
- Implementiere eine zuverlässige Invalidierung historischer Werte.
- Verwende bei Bedarf einen Datenrevisionsmechanismus oder zeitlich begrenzte Cache-Gültigkeit.
- Erhalte die Performance der API.
- Vermeide unnötig häufige SQLite-Abfragen.
- Prüfe auch die Jahreskostenberechnung und die monatlichen Zwischensummen.

**Abnahmetest:**

1. Historischer Tagesverbrauch wird gelesen.
2. Der Logger rekonstruiert nachträglich Energie.
3. MIRA liest den Zeitraum erneut.
4. Der aktualisierte Verbrauch und die aktualisierten Kosten müssen angezeigt werden.

### F-02: Fehlerhafte Klassifikation von Messlücken

**Datei:** `shelly-logger/src/aggregator.ts`

**Problem:**

Die aktuelle Lückenerkennung berücksichtigt die Intervallgrenze. Dadurch kann eine längere Unterbrechung innerhalb eines einzelnen 30-Sekunden-Intervalls falsch als regulär gemessene Energie eingestuft werden.

**Aufgaben:**

- Analysiere die Behandlung aufeinanderfolgender Zählerstände.
- Erkenne Messlücken unabhängig von 30-Sekunden-Grenzen.
- Verhindere doppelte Verbrauchszählung.
- Erhalte die korrekte Behandlung von Zähler-Resets.
- Bewahre die getrennte Speicherung gemessener und rekonstruierter Energie.
- Prüfe die Aufteilung über Mitternacht.
- Prüfe das Verhalten bei Neustarts des Containers.
- Prüfe das Verhalten bei Zeitumstellungen.

**Abnahmetests:**

- Lücke innerhalb desselben Intervalls.
- Lücke über mehrere Intervalle.
- Lücke über Mitternacht.
- Zähler-Reset.
- Neustart während eines Intervalls.
- Keine Doppelzählung.
- Summe aus gemessener und rekonstruierter Energie entspricht dem plausiblen Zählerfortschritt.

### F-03: Fehlerhafte Datenabdeckung bei längeren Ausfällen

**Datei:** `shelly-logger/src/reports.ts`

**Problem:**

Die Verbrauchsberechnung wird anhand der Aggregator-Version gecacht.

Wenn keine neuen Messintervalle entstehen, verändert sich diese Version nicht. Die verstrichene Zeit wächst jedoch weiter.

Dadurch kann `coverage` einen zu hohen Wert anzeigen.

**Aufgaben:**

- Analysiere die zeitabhängigen Felder aller Verbrauchsantworten.
- Sorge dafür, dass diese Werte nicht unbegrenzt aus dem Cache stammen.
- Trenne gegebenenfalls stabile Verbrauchssummen von zeitabhängigen Qualitätskennzahlen.
- Berücksichtige längere Shelly-Ausfälle.
- Prüfe die Berechnung bei Tages-, Wochen-, Monats- und Jahreswechseln.

**Abnahmetest:**

Bei einem zehnminütigen Messausfall darf die Datenabdeckung nicht unverändert bei 100 Prozent stehen bleiben.

### F-04: Race Conditions beim Frontend-Polling

**Datei:** `frontend/src/lib/usePolling.ts`

**Problem:**

Mehrere asynchrone Abfragen können gleichzeitig laufen.

Wird ein neuer Zeitraum gewählt, kann eine ältere Anfrage später zurückkehren und die neueren Daten überschreiben.

**Aufgaben:**

- Führe eine eindeutige Identifikation laufender Abfragen ein oder verwende einen geeigneten Abbruchmechanismus.
- Verhindere, dass veraltete Antworten neue Daten überschreiben.
- Verhindere Zustandsänderungen nach einem Unmount.
- Prüfe das Verhalten beim Tab-Wechsel.
- Prüfe das Verhalten beim erneuten Sichtbarwerden einer Seite.
- Erhalte das vorhandene Polling-Intervall.
- Verhindere unnötige parallele Abfragen.
- Achte darauf, Fehleranzeigen und Ladezustände korrekt zurückzusetzen.

**Abnahmetests:**

- Schneller Wechsel zwischen Diagrammzeiträumen.
- Langsame HTTP-Anfragen.
- Fehlgeschlagene Anfrage.
- Komponenten-Unmount.
- Hintergrund- und Vordergrundwechsel des Browsers.

## 5. Betriebssicherheit verbessern

### B-01: Sicherungsstrategie erweitern

**Betroffene Stellen:**

- `backend/core/backup.ts`
- `shelly-logger/src/store.ts`
- Deployment-Dokumentation

**Problem:**

Die vorhandenen SQLite-Sicherungen liegen innerhalb des Datenverzeichnisses der jeweiligen Anwendung.

Ein Schaden am zugrunde liegenden Speicher kann deshalb sowohl Datenbank als auch Sicherungen betreffen.

**Aufgaben:**

1. Prüfe die bestehenden Sicherungsmechanismen.
2. Erhalte die konsistente SQLite-Backup-API.
3. Prüfe, ob Sicherungen regelmäßig und erfolgreich erstellt werden.
4. Ergänze eine sinnvolle Integritätsprüfung.
5. Prüfe die Wiederherstellbarkeit der Sicherungsdateien automatisiert.
6. Erarbeite eine optionale zusätzliche Sicherung auf ein getrenntes Speicherziel.
7. Vermeide die Einführung einer zwingenden Abhängigkeit von externen Diensten.
8. Berücksichtige restriktive Dateirechte und Geheimnisse.
9. Dokumentiere Wiederherstellung und Datenverlustszenarien.
10. Dokumentiere den Umgang mit fehlgeschlagenen Sicherungen.

Die bestehenden Sicherungsdateien dürfen nicht gelöscht oder beschädigt werden.

Ein tatsächlich neues Backup-Ziel ist vom Betreiber einzurichten und darf nicht eigenständig auf dem Homeserver angelegt werden.

### B-02: Sperrfrist der manuellen Update-Prüfung aktivieren

**Datei:** `backend/core/updates/updateService.ts`

**Problem:**

`MANUAL_CHECK_INTERVAL_MS` steht für die Entwicklungsphase auf `0`.

Damit sind unbegrenzt häufige manuelle Prüfungen möglich.

**Aufgaben:**

- Aktiviere die bereits vorgesehene Sperrfrist von einer Stunde.
- Berücksichtige parallele Anfragen.
- Verhindere mehrere gleichzeitige GitHub-Abfragen.
- Erhalte die automatische tägliche Update-Prüfung.
- Stelle die verbleibende Sperrfrist korrekt im Frontend dar.
- Ergänze Tests für erfolgreiche und fehlgeschlagene Prüfungen.

## 6. Zusätzliche Sicherheitsüberprüfung

Prüfe bei der Bearbeitung auch, ob weitere Risiken bestehen.

Untersuche insbesondere:

- SQL-Injection und dynamische SQL-Abfragen.
- Cross-Site-Scripting und unsichere Ausgabe dynamischer Inhalte.
- Cross-Site-Request-Forgery.
- Session-Fixation und Session-Replay.
- Fehlerhafte Autorisierungsprüfungen.
- Unzureichende API-Eingabevalidierung.
- Informationslecks in Logs und Fehlermeldungen.
- Unbegrenzte Speichernutzung durch Rate-Limiter oder Caches.
- Unbegrenzte oder unnötig große HTTP-Antworten.
- Fehlende Verbindungs- und Zeitlimits.
- Unsichere TLS-Konfiguration.
- Fehlende Sicherheits-Header.
- Secret-Dateien und Dateiberechtigungen.
- Unzureichende Fehlerbehandlung.
- Risiken durch fremde npm-Abhängigkeiten.
- Fehlerhafte Datenbankmigrationen.
- Fehler bei parallelen Schreibzugriffen und asynchronen Hintergrundprozessen.
- Ungewollten Netzwerkzugriff zwischen Docker-Netzen.

Wenn du zusätzliche Probleme findest, dokumentiere und priorisiere diese. Behebe sie, sofern sie in den Rahmen dieses Wartungsauftrags passen.

Vermeide jedoch ungeplante Architekturumbauten.

## 7. Teststrategie

Jede Fehlerbehebung benötigt nachvollziehbare Testfälle.

### Verpflichtende Prüfungen

Führe mindestens aus:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run check:naming`

Ergänze die neuen Security-Scans und überprüfe außerdem die bestehenden Docker-Builds, sofern die Umgebung dies erlaubt.

### Testebenen

**Unit-Tests**

Prüfe isolierte Logik einschließlich Randfällen, Ausnahmen und ungültigen Eingaben.

**Integrationstests**

Prüfe insbesondere:

- Anmeldung und Sessions.
- Reverse Proxy und Sicherheits-Header.
- MIRA-Agent-Kommunikation.
- MIRA/Shelly-Logger-Kommunikation.
- Datenbankmigrationen.
- Messwertrekonstruktion.
- Stromkostenberechnung.
- Passwortänderung.
- Backup und Restore.

**Regressionstests**

Jeder bestätigte Programmfehler muss durch mindestens einen Test abgedeckt werden, der vor dem Fix fehlschlagen würde und nach dem Fix erfolgreich ist.

**Docker-Tests**

Prüfe mindestens:

- Start mit unprivilegiertem Benutzer.
- Schreibgeschütztes Dateisystem.
- Notwendige Datenbank-Schreibzugriffe.
- Interne Netzwerkverbindungen.
- Healthchecks.
- Neustart von Containern.
- Persistenz der Daten.

Falls Tests in der aktuellen Umgebung nicht ausführbar sind, benenne die konkreten Einschränkungen und führe sie nicht fälschlicherweise als erfolgreich auf.

## 8. Abwärtskompatibilität und Migration

Das bestehende System ist bereits im Betrieb.

Deshalb gelten folgende Regeln:

- Keine bestehenden Datenbanken löschen.
- Keine bisherigen Messwerte zurücksetzen.
- Keine Änderung ausgelieferter Datenbankmigrationen.
- Neue Migrationen nur ergänzen.
- Keine unnötigen Änderungen an API-Verträgen.
- Bestehende Konfigurationswerte möglichst beibehalten.
- Neue Konfigurationen mit sicheren Defaults versehen.
- Neue Sicherheitsanforderungen müssen dokumentierte Migrationsschritte erhalten.
- Keine eigenmächtige Rotation vorhandener Zugangsdaten.
- Keine Änderungen an der produktiven OPNsense.
- Keine Änderungen an den Netzwerkkonfigurationen von Asgard oder Odin.
- Keine automatische Aktualisierung laufender Portainer-Stacks.

**Besonders wichtig:** Änderungen an Authentifizierung, Netzwerkzugriff und Secret-Dateien müssen in einer sicheren Reihenfolge ausgerollt werden können.

Eine neue Sicherheitsanforderung darf nicht dazu führen, dass MIRA nach einem normalen Update ohne vorherige Warnung unerreichbar ist.

Falls sich eine solche Änderung nicht vermeiden lässt, dokumentiere einen konkreten Migrations- und Rollback-Ablauf.

## 9. Dokumentation

Erstelle einen Bericht im Repository unter:

`docs/entwicklung/security-hardening-review.md`

Der Bericht soll enthalten:

1. Ausgangszustand und geprüfter Git-Commit.
2. Überprüfte Sicherheitsrisiken und Programmfehler.
3. Bestätigte und widerlegte Befunde.
4. Tatsächlich durchgeführte Korrekturen.
5. Zusätzliche gefundene Probleme.
6. Änderungen an API, Datenbank, Konfiguration und Deployment.
7. Neue oder geänderte Tests.
8. Ergebnisse der Testläufe.
9. Ergebnisse der Abhängigkeits- und Container-Scans.
10. Verbleibende Risiken.
11. Notwendige manuelle Schritte beim Betreiber.
12. Konkrete Anleitung zum sicheren Deployment.
13. Rollback-Anleitung.

Aktualisiere außerdem betroffene README-Dateien, Architekturentscheidungen und Betriebshandbücher.

Die Roadmap darf die entsprechenden Arbeiten als separate Wartungsstufe dokumentieren. Bereits abgeschlossene Entwicklungsstufen dürfen nicht rückwirkend als unerledigt dargestellt werden.

## 10. Umsetzung und Git-Organisation

Lege nach Möglichkeit einen eigenen Branch an:

`fix/security-hardening-stability`

Arbeite in logisch getrennten Arbeitspaketen.

Bevorzuge nachvollziehbare Commits, beispielsweise:

- `fix(security): harden proxy and session transport`
- `feat(auth): add secure password rotation`
- `fix(shelly): correct historical caching and gap handling`
- `fix(frontend): prevent stale polling responses`
- `chore(security): harden containers and CI`
- `docs: document security review and deployment`

Passe die tatsächliche Aufteilung an die Ergebnisse deiner Analyse an.

Verändere keine nicht zum Auftrag gehörenden Dateien ohne nachvollziehbaren Grund.

Bestehende uncommittete Änderungen des Betreibers dürfen nicht überschrieben werden.

Erstelle keinen Push und keinen Pull Request ohne ausdrückliche Freigabe.

## 11. Abschließende Qualitätskontrolle

Überprüfe nach der Umsetzung nochmals unabhängig:

- Sind sämtliche bestätigten Befunde tatsächlich behoben?
- Haben die Korrekturen neue Sicherheitsrisiken geschaffen?
- Sind alle relevanten Tests vorhanden?
- Bestehen neue Race Conditions?
- Sind historische Messdaten weiterhin korrekt?
- Funktionieren bestehende API-Verträge?
- Sind MIRA und der Shelly-Logger weiterhin unabhängig deploybar?
- Können bestehende Benutzer sich weiterhin anmelden?
- Sind Secrets weiterhin geschützt?
- Sind bestehende Datenbanken weiterhin lesbar?
- Lässt sich das System sicher aktualisieren?
- Sind alle Änderungen dokumentiert?

Korrigiere selbst entdeckte Regressionsfehler vor dem Abschluss.

## 12. Gewünschte Abschlussausgabe

Erstelle nach Abschluss einen übersichtlichen Bericht direkt in deiner Antwort.

Verwende folgende Struktur:

### A. Zusammenfassung

Was wurde überprüft und umgesetzt?

### B. Behobene Probleme

Tabelle mit:

| ID | Problem | Ergebnis | Tests |
|---|---|---|---|

Verwende bei jedem Problem eine eindeutige Kennzeichnung:

- Behoben und getestet
- Behoben, aber nicht vollständig getestet
- Nicht bestätigt
- Noch offen
- Manuelle Maßnahme erforderlich

### C. Zusätzlich gefundene Probleme

Beschreibe neue Befunde einschließlich ihrer Risikostufe.

### D. Technische Änderungen

Liste die wichtigsten geänderten Dateien und deren Zweck auf.

### E. Qualitätssicherung

Nenne die tatsächlich ausgeführten Tests, deren Ergebnisse und die Resultate der Sicherheitsprüfungen.

### F. Erforderliche Maßnahmen des Betreibers

Beschreibe präzise, welche Anpassungen gegebenenfalls an folgenden Systemen notwendig sind:

- Asgard / Docker / Portainer
- Nginx Proxy Manager
- OPNsense
- Odin / MIRA-Agent
- Shelly-Logger

Trenne zwingend notwendige Maßnahmen von optionalen Verbesserungen.

### G. Deployment-Anleitung

Beschreibe die sichere Reihenfolge der Aktualisierung einschließlich Backup und Rollback.

### H. Offene Risiken

Nenne alle weiterhin bekannten Risiken ohne Beschönigung.

### I. Gesamtbewertung

Bewerte den Zustand von Architektur, Sicherheit, Stabilität, Datenintegrität und automatisierten Tests anhand der vorliegenden Nachweise.

## 13. Definition of Done

Der Auftrag gilt erst als abgeschlossen, wenn:

- alle bestätigten, im vereinbarten Umfang behebbaren Befunde korrigiert sind,
- die neuen Regressionstests erfolgreich laufen,
- bestehende Tests nicht beeinträchtigt sind,
- TypeScript und Produktionsbuild erfolgreich sind,
- die vorgesehenen Sicherheitsprüfungen durchgeführt oder konkrete Hindernisse dokumentiert wurden,
- Datenbankkompatibilität gewährleistet ist,
- alle erforderlichen Deployment-Anpassungen dokumentiert wurden,
- keine produktiven Systeme ohne Freigabe verändert wurden,
- verbleibende Risiken transparent dokumentiert sind.

Falls ein Problem nicht vollständig behoben werden kann, dokumentiere die Ursache und eine konkrete sichere Anschlussaufgabe.

**Beginne jetzt mit der Bestandsaufnahme und Verifikation der Befunde. Anschließend behebe die bestätigten Probleme systematisch und überprüfe deine Arbeit mit Tests. Beende den Auftrag mit dem vollständigen Sicherheits- und Stabilitätsbericht.**
