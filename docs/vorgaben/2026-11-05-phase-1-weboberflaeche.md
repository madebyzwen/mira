# MIRA – Phase 1: Umsetzung der Weboberfläche

> Originalwortlaut, übergeben am 2026-11-05. Umsetzung: [Stufe 0](../entwicklung/stufe-00-weboberflaeche.md).

## Projektbeschreibung

Du arbeitest am Projekt **MIRA – Management, Infrastructure, Resources & Automation**.

MIRA ist eine modular aufgebaute, selbst gehostete Webanwendung zur Überwachung, Verwaltung und Automatisierung lokaler KI-Infrastruktur.

Das GitHub-Repository enthält bereits eine vorbereitete Verzeichnisstruktur und freigegebene UI-Mockups unter `docs/mockups/`.

**Deine erste Aufgabe ist ausschließlich die Umsetzung einer klickbaren Weboberfläche anhand dieser Mockups.**

Es sollen noch keine produktiven Funktionen implementiert werden.

## Zielarchitektur

MIRA wird später als Docker-Anwendung auf dem UGREEN-NAS **Asgard** betrieben.

Von dort aus wird MIRA den separaten KI-Server **Odin** verwalten. Auf Odin laufen Ubuntu Server, lokale LLMs und verschiedene KI-Dienste.

Die spätere Architektur sieht ein zentrales Backend mit modularen Funktionsbereichen und einer SQLite-Datenbank vor. Die Datenbank speichert unter anderem Konfigurationen und Betriebsinformationen.

Die Kommunikation mit Odin wird später ausschließlich über das MIRA-Backend erfolgen. Das Frontend soll nicht direkt auf Odin zugreifen.

**Diese Backend-Funktionen gehören ausdrücklich nicht zu Phase 1.**

## Technische Vorgaben für Phase 1

Verwende React, TypeScript und Vite.

Die Oberfläche soll aus wiederverwendbaren Komponenten bestehen. Nutze React Router für die Navigation, Lucide für Icons und ein einheitliches CSS-Designsystem.

Verwende keine umfangreiche UI-Komponentenbibliothek, die den Stil der Mockups verfälscht. Diagramme können vorerst mit einfachen SVG- oder CSS-Darstellungen umgesetzt werden.

Die Anwendung soll lokal auf dem Mac über den Vite-Entwicklungsserver starten können.

Bereite außerdem einen schlanken Docker-Build vor, über den sich die Weboberfläche später auf Asgard betreiben lässt. Hierfür genügt zunächst ein Container, der die gebauten Frontend-Dateien ausliefert.

## Designvorgaben

Analysiere zunächst sämtliche Grafiken unter `docs/mockups/`.

Setze diese als echte HTML-/CSS-/React-Oberflächen um. Die Mockup-Bilder dürfen nicht einfach als Hintergrundbilder verwendet werden.

Übernimm insbesondere Farben, Typografie, Abstände, Karten, Icons, Rahmen, Navigation und die allgemeine visuelle Gestaltung möglichst originalgetreu.

Die Anwendung soll zunächst für Desktop-Browser optimiert sein, aber auch auf kleineren Bildschirmen sinnvoll funktionieren.

## Umzusetzende Ansichten

### Login

Eigenständige Login-Seite ohne Navigationsmenü.

Benutzername, Passwort und Anmelden-Button sollen sichtbar und bedienbar sein.

Für Phase 1 genügt eine ausdrücklich als Demo gekennzeichnete Anmeldung, die zum Dashboard navigiert. Es findet noch keine echte Authentifizierung statt.

### Dashboard

Setze die beiden freigegebenen Ansichten mit ausgeklapptem und eingeklapptem Seitenmenü um.

Der Benutzer muss das Menü ein- und ausklappen können.

Die Widgets zeigen Beispieldaten. Es dürfen keine echten Serverabfragen stattfinden.

Ein eigenständiger Menüpunkt „Dienste“ ist ausdrücklich nicht vorgesehen. Die Docker-Statusanzeige auf dem Dashboard bleibt dagegen bestehen.

### Systeme

Der Menüpunkt „Systeme“ ist aufklappbar und enthält die Unterpunkte „Odin“ und „Shelly Plug“.

Beide Ansichten sind anhand ihrer jeweiligen Mockups umzusetzen.

In der Odin-Ansicht ist die vereinbarte Reihenfolge der unteren Widgets einzuhalten:

Datenträger, Netzlaufwerk (NAS), Netzwerk, Temperaturen.

Es sollen nur Beispieldaten angezeigt werden.

### Agents

Die Agents-Ansicht zeigt vorerst ausschließlich die freigegebene leere Agentenübersicht mit dem Button „Agent hinzufügen“.

Keine technischen Hintergrundprozesse als KI-Agenten darstellen.

Es findet noch keine Verbindung zu Hermes oder anderen Agenten statt.

### LLM

Die LLM-Ansicht enthält eine Tabelle mit lokal gespeicherten GGUF-Modellen und den dazugehörigen Metadaten.

Pro Modell sind ausschließlich die Aktionen „Info“ und „Löschen“ vorgesehen.

Darunter befindet sich der Bereich „Neues LLM herunterladen“.

Dieser enthält lediglich ein Eingabefeld für einen direkten Download-Link, die Auswahl des Zielverzeichnisses auf Odin und den Button „Download starten“.

Keine Hugging-Face-Suche, keine Modellauswahl für den Download und keine zusätzlichen Dropdowns.

In Phase 1 darf kein echter Download stattfinden.

### Konfiguration

Der Menüpunkt „Konfiguration“ ist im linken Hauptmenü aufklappbar, genauso wie „Systeme“.

Er enthält direkt im Menübaum die Unterpunkte:

Dashboard, System, Agents und LLM.

Die Hauptansicht „Konfiguration“ zeigt lediglich den freigegebenen Hinweis zur Auswahl eines Konfigurationsbereichs.

Keine Einrichtungsstatus-Anzeige, keine Änderungsverläufe und keinen Setup-Assistenten implementieren.

Die vier Konfigurations-Unterseiten dürfen zunächst einfache, einheitlich gestaltete Platzhalter enthalten. Die konkreten Einstellungsformulare werden später separat festgelegt.

## Interaktionen

Die gesamte Navigation muss funktionieren.

Menüs, Untermenüs, Reiter und grundlegende Oberflächensteuerungen sollen anklickbar sein.

Buttons für produktive Aktionen wie Server starten, Server herunterfahren, LLM herunterladen oder Modell löschen dürfen keine echten Aktionen ausführen.

Bei Bedarf kann ein Dialog oder eine kurze Meldung anzeigen, dass die Funktion in Phase 1 noch nicht verfügbar ist.

Verwende für alle Ansichten zentral definierte Demo-Daten. Diese müssen später problemlos durch echte Backend-Daten ersetzt werden können.

## Wichtige Einschränkungen

Implementiere noch keine SQLite-Datenbank, keine Backend-API, keine echte Anmeldung, keine Docker-Verwaltung, keine Wake-on-LAN-Steuerung und keine Anbindung an Odin oder Shelly.

Erfinde keine neuen Menüpunkte, Widgets oder Funktionen.

Falls sich eine Mockup-Grafik und die hier beschriebenen Anforderungen widersprechen, gelten die Anforderungen dieses Prompts.

## Vorgehensweise

Prüfe zunächst die vorhandene Repository-Struktur und alle Mockup-Dateien.

Erstelle eine kurze technische Umsetzungsplanung und setze anschließend die Weboberfläche komponentenbasiert um.

Prüfe, dass alle Seiten erreichbar sind und die Anwendung ohne Backend startet.

Stelle sicher, dass der Produktionsbuild funktioniert, und dokumentiere in der README die lokale Installation, den Entwicklungsstart und den Docker-Build.

Verändere keine vorhandenen Mockup-Grafiken und füge keine unnötigen Abhängigkeiten hinzu.

**Ergebnis:** Eine optisch möglichst originalgetreue, vollständig navigierbare MIRA-Weboberfläche, die als Grundlage für die spätere Backend-Implementierung dient.
