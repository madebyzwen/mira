# MIRA – Architekturbriefing und Implementierungsplanung

> Originalwortlaut, übergeben am 2026-11-05. Überholte Punkte: siehe [Übersicht](README.md).

## 1. Projekt und Zielsetzung

Du arbeitest am Projekt **MIRA – Management, Infrastructure, Resources & Automation**.

Repository: https://github.com/madebyzwen/mira

MIRA ist eine selbst gehostete Managementplattform zur Verwaltung und Automatisierung lokaler KI-Infrastruktur.

Die Anwendung soll modular, erweiterbar, ressourcenschonend und langfristig wartbar sein.

Unser Ziel ist eine professionelle Webanwendung, die schrittweise ausgebaut wird.

**Wichtig: Wir entwickeln MIRA ausdrücklich stufenweise, View für View und Funktion für Funktion. Keine Komplettimplementierung in einem einzigen Entwicklungsschritt.**

## 2. Bestehender Entwicklungsstand

Im Repository liegen bereits:

- Die vorbereitete Projektstruktur.
- Eine README.md und .gitignore.
- Freigegebene grafische UI-Mockups unter `docs/mockups/`.
- Gegebenenfalls bereits erste Frontend-Implementierungen.

Analysiere zuerst den tatsächlichen Repository-Stand. Vorhandene Arbeiten sollen nicht unnötig ersetzt werden.

Die freigegebenen Mockups sind die verbindliche visuelle Grundlage.

## 3. Zielinfrastruktur

### Asgard – NAS und MIRA-Host

MIRA soll dauerhaft auf dem UGREEN-NAS Asgard betrieben werden.

- Deployment über Docker.
- Zentrales MIRA-Backend.
- Weboberfläche.
- SQLite-Datenbank.
- Konfigurationsverwaltung.
- Hintergrundaufgaben und Scheduler.
- Kommunikation mit verwalteten Servern.
- Zentrale Protokollierung.

Das NAS bleibt eingeschaltet, auch wenn der KI-Server schläft.

### Odin – verwalteter KI-Server

Odin ist ein separater Linux-Server mit leistungsfähiger CPU, AMD-GPU und lokalen LLMs.

Aktuelle grundlegende Ausstattung:

- Ubuntu Server 26.04 LTS.
- Intel Core i7-14700.
- 64 GB RAM.
- AMD Radeon AI Pro R9700 mit 32 GB VRAM.
- Docker mit llama.cpp und weiteren Diensten.
- Open WebUI läuft unabhängig auf Asgard.
- Ein separates GGUF-Modellverzeichnis ist auf Odin vorhanden.

Odin kann eingeschaltet, heruntergefahren oder in Suspend-to-RAM versetzt werden.

MIRA soll Odin bedarfsgesteuert verwalten.

Die bestehenden Netzwerkkonfigurationen, Verzeichniszuordnungen und Containerdefinitionen müssen vor der Implementierung geprüft werden. Nichts davon soll ungeprüft überschrieben werden.

## 4. Architekturprinzipien

MIRA wird als **modularer Monolith** umgesetzt.

Keine unnötige Microservice-Architektur und zunächst kein dynamisches Plugin-System.

Vorgesehen sind ein gemeinsamer Core und getrennte Funktionsmodule.

### Core

Der Core stellt übergreifende Dienste bereit:

- Authentifizierung und Autorisierung.
- Zentrale Konfiguration.
- Datenbankzugriff und Migrationen.
- Gemeinsame API-Grundlagen.
- Scheduler und Hintergrundaufgaben.
- Strukturierte Protokollierung.
- Kommunikation mit verwalteten Servern.
- Einheitliche Fehlerbehandlung.

### Fachmodule

Die geplanten Hauptmodule sind:

- Dashboard
- Systeme
- Agents
- LLM

Jedes Fachmodul soll seine Ansichten, Backend-Logik, Datenmodelle und Konfiguration möglichst eigenständig verwalten.

Module dürfen mehrere Datenbanktabellen besitzen, aber sollen keine separaten Datenbanken benötigen.

Neue Module oder Views müssen sich später ohne größere Umbauten ergänzen lassen.

Gemeinsame Funktionen dürfen nicht in mehreren Modulen unabhängig nachgebaut werden.

## 5. Datenbank

Wir haben uns grundsätzlich für **SQLite als zentrale Datenbank** entschieden.

Sie läuft auf Asgard im persistenten Speicherbereich der MIRA-Installation.

Die Datenbank soll perspektivisch unter anderem enthalten:

- MIRA-Konfiguration.
- Einstellungen der einzelnen Module.
- Verwaltete Systeme und ihre Verbindungsdaten.
- Agenten-Konfigurationen.
- LLM-bezogene Konfiguration.
- Automatisierungsregeln.
- Zustände und Informationen zu Hintergrundaufgaben.
- Historische Messwerte, soweit erforderlich.
- Strukturierte Aktions- und Fehlerprotokolle.

Dabei sind folgende Grundsätze einzuhalten:

- Datenbankmigrationen mit Versionsverwaltung.
- Modulbezogene Tabellen und Migrationen.
- Transaktionale Änderungen, soweit sinnvoll.
- Kein unkontrolliertes Wachstum von Protokollen und Messwerten.
- Konfigurierbare Aufbewahrungsregeln; für historische Protokolle sind zunächst bis zu zwölf Monate vorgesehen.
- Backup- und Wiederherstellungskonzept.

Gehe zunächst von einer Single-User-Installation aus.

Zugangsdaten, private SSH-Schlüssel und andere Geheimnisse sollen nicht ungeschützt in SQLite gespeichert werden.

Erstelle zunächst ein konzeptionelles Datenmodell, noch keine vollständige Datenbankimplementierung.

## 6. Kommunikation zwischen Asgard und Odin

Auf Odin soll eine kleine zusätzliche Software installiert werden.

Arbeitsbezeichnung: **MIRA Node Agent**.

Diese Software ist die definierte Kommunikationsschnittstelle zwischen MIRA und Odin.

Sie soll systembezogene Informationen bereitstellen und ausdrücklich autorisierte Aktionen entgegennehmen.

### Sicherheitsanforderung: SSH-Key-Authentifizierung

Die Kommunikation soll über SSH mit einem dedizierten Schlüsselpaar abgesichert werden.

Das Sicherheitsziel lautet:

**Nur die autorisierte MIRA-Installation auf Asgard soll die für MIRA vorgesehenen Befehle auf Odin ausführen dürfen.**

Dafür gelten folgende Anforderungen:

1. Ein eigenes SSH-Schlüsselpaar ausschließlich für MIRA.
2. Ein dedizierter, möglichst unprivilegierter Linux-Servicebenutzer auf Odin.
3. Anmeldung dieses Benutzers nur mit dem vorgesehenen Public Key.
4. Wo sinnvoll, Beschränkung auf die tatsächliche Quelladresse von Asgard.
5. Keine allgemeine Shell für die MIRA-Verbindung.
6. Nur explizit freigegebene Agent-Befehle.
7. Keine ungefilterte Ausführung beliebiger Shell-Kommandos.
8. Keine pauschalen Root-Rechte.
9. Bei privilegierten Aktionen nur gezielte, eng begrenzte Berechtigungen.
10. Deaktivierung unnötiger SSH-Funktionen wie Port-Forwarding und PTY für diesen Zugang.
11. Sichere Speicherung des privaten Schlüssels auf Asgard, mit restriktiven Dateirechten und ohne Ablage im Repository.
12. Überprüfung des SSH-Host-Keys von Odin.
13. Strukturierte Protokollierung sicherheitsrelevanter Aktionen.

Der vorhandene administrative SSH-Zugang des Benutzers zu Odin darf dadurch nicht beeinträchtigt werden.

Prüfe als bevorzugte Lösung einen kleinen Agenten, der bei Bedarf über einen eingeschränkten SSH-Aufruf gestartet wird und strukturierte Anfragen und Antworten verarbeitet.

Ein zusätzlicher dauerhaft erreichbarer HTTP-Dienst auf Odin ist nicht erwünscht, sofern er technisch nicht erforderlich ist.

Die interne SSH-Kommunikation darf nicht öffentlich aus dem Internet erreichbar sein.

Erarbeite zunächst das Sicherheits- und Kommunikationskonzept. Installiere noch nichts auf Odin.

## 7. Funktionsmodul Systeme

### Odin

Die Odin-View soll den KI-Server überwachen und verwalten.

Geplante Informationen:

- Online-/Offline- und Schlafzustand.
- CPU, RAM, GPU und VRAM.
- Temperaturen.
- Betriebssystem und Kernel.
- Uptime und Systemlast.
- Lokale Datenträger.
- Auf Odin gemountete NAS-Netzlaufwerke.
- Netzwerkinterfaces und Verbindungsinformationen.
- Betriebszustand wichtiger Systemkomponenten.

### Serversteuerung

Geplante Aktionen:

- Odin über Wake-on-LAN aufwecken.
- Suspend-to-RAM auslösen.
- Herunterfahren.
- Regulärer Neustart.
- Einmaliger Neustart in Windows über GRUB.
- Verfügbarkeit nach einem Neustart oder Aufwecken prüfen.

### Automatisierung

Odin soll perspektivisch nach konfigurierbarer Inaktivität automatisch schlafen.

Der ursprünglich vorgesehene Standardwert beträgt 45 Minuten.

Eine aktive KI-Anfrage oder ein geschützter Hintergrundauftrag darf nicht unkontrolliert unterbrochen werden.

Außerdem soll es möglich sein, den automatischen Schlafmodus vorübergehend zu sperren.

Laufende Jobs müssen beim Neustart und nach unerwartetem Verbindungsverlust korrekt behandelt werden.

### Wake-on-LAN

Wake-on-LAN ist ein gesonderter Kommunikationsweg, da ein schlafender Server kein SSH entgegennehmen kann.

Der WoL-fähige Netzwerkadapter von Odin ist `eno1`.

Der Zugriff soll netzwerkseitig gezielt aus dem autorisierten SERVER-VLAN beziehungsweise über ausdrücklich erlaubte ADMIN-VPN-Wege möglich sein.

Keine pauschale WoL-Freigabe für andere Client-VLANs.

Die noch offenen WoL-Netzwerkfragen müssen vor der produktiven Implementierung überprüft werden.

### Shelly Plug

Ein Shelly Plug PM misst den Stromverbrauch von Odin.

Die Anbindung soll ausschließlich lokal erfolgen, ohne verpflichtende Herstellercloud oder zusätzliche vollständige Home-Automation-Plattform.

Die Shelly-View soll unter anderem bieten:

- Gerätestatus.
- Aktuelle Leistungsaufnahme.
- Energieverbrauch.
- Historische Verbrauchswerte.
- Kostenberechnung anhand eines konfigurierbaren Strompreises.
- Verbindungsinformationen.

Die Stromdaten sollen bei Bedarf auch auf dem Dashboard erscheinen.

## 8. Funktionsmodul LLM

Die LLM-View verwaltet die auf Odin vorhandenen GGUF-Modelldateien.

### Modellübersicht

- Auflisten vorhandener Modelle im konfigurierten Verzeichnis.
- Modellnamen und Dateiinformationen.
- Dateigröße.
- Quantisierung, soweit zuverlässig ermittelbar.
- Suche und Filter.
- Detailinformationen.
- Datei nach Sicherheitsabfrage löschen.

Es soll ausdrücklich **keinen Play- oder Laden-Button** geben.

Die Modellauswahl und Inferenz übernimmt weiterhin die bestehende llama.cpp-/Open-WebUI-Infrastruktur.

### Modelldownloads

MIRA soll neue GGUF-Dateien direkt auf Odin herunterladen können.

Die Bedienung bleibt bewusst einfach:

1. Direkten Download-Link eingeben.
2. Zielverzeichnis auf Odin auswählen.
3. Download starten.
4. Fortschritt und Fehler anzeigen.
5. Laufenden Download bei Bedarf abbrechen.

Keine integrierte Hugging-Face-Modellsuche und keine komplexen Auswahlassistenten.

Der Download findet serverseitig auf Odin statt, nicht über den Browser.

Sichere Dateipfade, Downloadvalidierung, Fehlerbehandlung und die Vermeidung unzulässiger interner Netzwerkzugriffe sind bei der Implementierung zu berücksichtigen.

## 9. Funktionsmodul Agents

In diesem Bereich werden ausschließlich **echte KI-Agenten** verwaltet.

Hermes Agent ist ein vorgesehener erster Integrationskandidat, aber noch nicht als installierte Komponente vorauszusetzen.

Technische Monitoring-, Power- oder Maintenance-Dienste dürfen nicht als KI-Agenten dargestellt werden.

Geplante Funktionen:

- Konfigurierte KI-Agenten anzeigen.
- Verfügbarkeits- und Betriebsstatus.
- Zugeordnetes LLM, soweit auslesbar.
- Aktuelle und letzte Aktivität, soweit unterstützt.
- Starten, Stoppen oder Neustarten über unterstützte Schnittstellen.
- Agentenspezifische Konfiguration.

MIRA soll keine eigene komplexe KI-Agenten-Engine implementieren.

Die Integration weiterer Agentensysteme soll später modular möglich sein.

## 10. Dashboard

Das Dashboard bietet eine kompakte Übersicht.

Vorgesehen sind:

- Odin-Systemstatus.
- Aktuelle Ressourceninformationen.
- Stromverbrauch.
- Docker-Dienste und deren Status.
- Erreichbarkeit und Status tatsächlich installierter KI-Agenten.
- Verfügbare LLMs.
- Kontextabhängige Schnellaktionen.

Es gibt keinen eigenständigen Menüpunkt „Dienste“.

Die allgemeine Docker-Verwaltung bleibt bei Portainer. MIRA soll keine vollständige Portainer-Nachbildung werden.

Der Dashboard-Bereich darf vorhandene Modul-Funktionen verwenden, soll deren Geschäftslogik aber nicht duplizieren.

## 11. Konfiguration

Die Navigation enthält den aufklappbaren Menüpunkt „Konfiguration“ mit folgenden Unterpunkten:

- Dashboard
- System
- Agents
- LLM

Jeder Bereich erhält später seine eigenen Konfigurationsmöglichkeiten.

Beispiele sind:

- Serververbindungen und SSH-Einstellungen.
- Open-WebUI- und LLM-Backend-Verbindung.
- Modellverzeichnisse.
- WoL-Parameter.
- Suspend-Verhalten.
- Shelly-Verbindung.
- Strompreis.
- Messintervalle.
- Protokollaufbewahrung.
- Agentenspezifische Einstellungen.

Die konkrete Gestaltung der einzelnen Konfigurationsviews ist noch nicht abschließend festgelegt.

Die Hauptansicht „Konfiguration“ bleibt bewusst schlank.

Kein Setup-Assistent in der ersten Implementierung, keine künstlichen Einrichtungsstatus-Anzeigen und kein unnötiger Änderungsverlauf auf dieser Seite.

## 12. Authentifizierung und Netzwerkzugriff

MIRA soll eine eigene Login-Oberfläche mit echter serverseitiger Authentifizierung erhalten.

Die Login-Seite ist bereits als Mockup vorgesehen.

Das Frontend darf niemals direkt privilegierte Befehle auf Odin ausführen oder SSH-Schlüssel erhalten.

Externer Zugriff auf die private KI-Infrastruktur soll ausschließlich über eine autorisierte WireGuard-Verbindung erfolgen.

Keine öffentliche Veröffentlichung von Verwaltungs-APIs über Cloudflare Tunnel oder einen frei erreichbaren Reverse Proxy.

Eine interne HTTPS-Bereitstellung über die vorhandene Infrastruktur ist vorgesehen.

## 13. Modularität und Erweiterbarkeit

Dieser Punkt ist besonders wichtig.

Jeder Funktionsbereich soll möglichst unabhängig entwickelt, getestet und erweitert werden können.

Neue Views müssen später ohne grundlegende Änderungen an bestehenden Modulen hinzugefügt werden können.

Dafür erwarten wir:

- Klare Modulgrenzen.
- Wiederverwendbare Frontend-Komponenten.
- Einheitliche API-Konventionen.
- Definierte Schnittstellen zum Node Agent.
- Modulbezogene Konfigurationsbereiche.
- Datenbankmigrationen pro Modul.
- Zentrale Rechte- und Fehlerbehandlung.
- Austauschbare Integrationsadapter, sofern tatsächlich erforderlich.

Bitte keine abstrakte Erweiterungsarchitektur entwickeln, die aktuell keinerlei praktischen Nutzen bietet.

**Erweiterbarkeit ja, Overengineering nein.**

## 14. Vorgehen bei der Implementierung

Wir wollen die Anwendung in kleinen, überprüfbaren Entwicklungsschritten aufbauen.

Nicht alle Module gleichzeitig implementieren.

Jede Ausbaustufe soll:

1. Einen klar definierten Funktionsumfang haben.
2. Auf vorhandenen Komponenten aufbauen.
3. Möglichst unabhängig getestet werden können.
4. Automatisierte Tests erhalten, soweit sinnvoll.
5. Dokumentiert werden.
6. Nach menschlicher Prüfung abgeschlossen werden.

Idealerweise entwickeln wir vertikale Funktionsabschnitte: Frontend, Backend, Datenbank und gegebenenfalls Node Agent für genau eine Funktion.

Die bereits bestehenden Mockups und das Frontend dürfen dabei nicht unnötig neu entwickelt werden.

## 15. Dein aktueller Auftrag: ausschließlich planen

**Beginne noch nicht mit der Implementierung.**

Analysiere zuerst den aktuellen Stand des Repositories und die freigegebenen Mockups.

Erstelle anschließend einen konkreten Architektur- und Umsetzungsplan.

Der Plan soll folgende Punkte enthalten:

### A. Bestandsaufnahme
Was existiert bereits, welche Teile fehlen und welche bisherigen Entscheidungen sind technisch relevant?

### B. Zielarchitektur
Wie strukturieren wir Frontend, Backend, SQLite, gemeinsame Core-Funktionen und Fachmodule?

### C. MIRA Node Agent
Wie sollte die Kommunikationssoftware auf Odin aussehen? Welche Aufgaben übernimmt sie, wie wird sie aufgerufen und wie sichern wir die Kommunikation über SSH ab?

### D. Datenmodell
Welche grundlegenden Tabellen und Beziehungen sind notwendig? Welche Daten sind zentrale Konfiguration und welche gehören zu einzelnen Modulen?

### E. Implementierungsphasen
Schlage eine sinnvolle Reihenfolge vor, in der wir die vorhandenen Views und ihre Funktionen realisieren.

Berücksichtige technische Abhängigkeiten. Begründe die Reihenfolge.

### F. Erste konkrete Entwicklungsstufe
Definiere ein möglichst kleines, funktionierendes erstes Implementierungspaket mit eindeutigen Erfolgskriterien.

### G. Risiken und offene Entscheidungen
Benenne technische Risiken, ungeklärte Schnittstellen und Architekturfragen. Trenne zwingend notwendige Entscheidungen von Dingen, die wir später festlegen können.

## 16. Arbeitsregeln

- Bestehende Mockups bleiben unverändert.
- Vorhandene Implementierungen erhalten, sofern sie nicht begründet angepasst werden müssen.
- Keine neuen Features ohne ausdrückliche Freigabe.
- Keine unnötigen Abhängigkeiten.
- Keine Änderungen an Odin oder Asgard im Rahmen dieses Planungsauftrags.
- Keine Zugangsdaten oder privaten Schlüssel im Repository.
- Keine großflächigen Refactorings ohne Begründung.
- Architekturentscheidungen nachvollziehbar dokumentieren.
- Produktiv verwendete Infrastruktur nicht durch Experimente gefährden.

**Liefere zunächst ausschließlich deinen Architekturvorschlag und einen stufenweisen Entwicklungsplan. Warte danach auf unsere Freigabe, bevor du Code veränderst oder neue Komponenten implementierst.**
