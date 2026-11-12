# 0009 – KI-Server als Rolle, Name konfigurierbar, Agent `mira-agent`

- Status: angenommen
- Datum: 2026-11-10
- Ergänzt: [ADR 0005](0005-agent-http-api-statt-ssh.md) (Bezeichnung des Dienstes)

## Kontext

Bis MIRA 0.6.x war der Name des verwalteten Rechners fest eingebaut: in Code,
Routen, Umgebungsvariablen, Datenbank, Paket- und Dienstnamen, Pfaden auf dem Rechner
und in den Update-Hinweisen. Ein Update der Software auf dem KI-Server erschien so als
Update eines bestimmten Rechners statt als Update für den KI-Server. MIRA soll
allgemein vom KI-Server sprechen; der Name des konkreten Rechners ist eine Einstellung.

## Entscheidung

- **KI-Server** ist die Rolle des Rechners, den MIRA verwaltet. Code, Oberfläche, Doku,
  Logs und Update-Hinweise sprechen vom KI-Server.
- Der **Anzeigename** ist optional und frei wählbar (`MIRA_AI_SERVER_NAME`, 1–32 Zeichen).
  Ohne Angabe heißt er „KI-Server“. Er erscheint dort, wo der konkrete Rechner gemeint
  ist (Navigation, Seitentitel, Dashboard, Schnellaktionen); Update-Hinweise,
  Konfiguration und Fehlermeldungen nennen immer die Rolle.
- Der feste, namensunabhängige Schlüssel ist `ai-server` (Datenbank `systems.slug`,
  REST-API `/api/v1/systems/ai-server`); die Route der Oberfläche ist `/systeme/ki-server`.
- Die Software auf dem KI-Server heißt **MIRA-Agent** (`mira-agent`): Paket
  `mira-agent-X.Y.Z.tar.gz`, Dienst `mira-agent`, Pfade `/opt/mira-agent`, `/etc/mira-agent`.
  Das greift die Bezeichnung „MIRA Node Agent“ aus dem
  [Architekturbriefing](../vorgaben/2026-11-05-architekturbriefing.md) auf; der Betriebsweg
  bleibt der aus ADR 0005 (HTTP-Dienst statt SSH).
- Code-Bezeichner sind englisch (`aiServer`, `AgentClient`), Umgebungsvariablen
  `MIRA_AI_SERVER_*`.

## Alternativen

- **Nur Texte ändern, Bezeichner behalten:** wenig Aufwand, aber Paket-, Dienst- und
  Variablennamen hätten den alten Namen weiter nach außen getragen – verworfen.
- **Name des Agents `mira-ki-server-agent`:** eindeutiger, aber lang; `mira-agent` deckt sich
  mit dem bestehenden Systembenutzer – verworfen.
- **Alte Variablennamen weiter lesen:** sanfterer Umstieg, hält aber den alten Namen dauerhaft
  im Code – verworfen; der Umstieg ist einmalig und dokumentiert (Stufe 3a).

## Konsequenzen

- Einmaliger, inkompatibler Umstieg (MIRA 0.7.0 / Agent 0.2.0): Stack-Variablen und
  Secret-Datei werden umbenannt, der Agent wird neu installiert (`install.sh` übernimmt die
  Altinstallation, das Zertifikat wird erneuert). Ablauf: [Stufe 3a](../entwicklung/stufe-03a-ki-server-bereinigung.md).
- Übergangsregeln (Übernahme im Installer, alte Route) werden nach der Umstellung entfernt
  ([A-006](../aufgaben/a-006-uebergang-ki-server-aufraeumen.md)).
- Eine Prüfung in der CI (`scripts/check-naming.sh`) verhindert, dass der frühere Name
  außerhalb der Ausnahmen wieder fest eingebaut wird.
- Historische Dokumente (ADRs 0001–0008, Vorgaben, abgeschlossene Stufen 0–3) bleiben
  unverändert und tragen einen Hinweis.
