# A-001 – MIRA in Portainer immer mit dem neuesten Image betreiben

- Status: 🔎 in Klärung
- Notiert: 2026-11-06
- Entscheidung: 2026-11-06 – Update **auf Knopfdruck über die MIRA-Oberfläche**

## Ziel

Der Stack auf Asgard soll stets das neueste veröffentlichte Image verwenden,
ohne dass bei jedem Release die Variable `MIRA_VERSION` in Portainer angepasst
werden muss.

## Kontext

- Images entstehen über GitHub Actions ([ADR 0008](../adr/0008-images-ueber-github-container-registry.md)):
  `:main` bei jedem Push auf `main`, `:X.Y.Z`, `:X.Y` und `:latest` bei Versions-Tags.
- Der Stack (`deploy/portainer-stack.yml`) nutzt `ghcr.io/madebyzwen/mira:${MIRA_VERSION:-latest}`.
  Ohne gesetzte Variable wird also bereits `latest` verwendet.
- **Portainer lädt ein Image mit gleichem Tag nicht von selbst neu.** Auch mit
  `latest` braucht es einen Anstoß („Update the stack“ mit „Re-pull image“) –
  das eigentliche Ziel ist daher das **automatische Aktualisieren**.

## Entscheidung (2026-11-06)

Updates werden **nach Möglichkeit über die MIRA-Oberfläche angestoßen** – nicht
automatisch im Hintergrund. Naheliegender Ort: **Konfiguration › MIRA**.

Grundsätzliche Idee:

1. MIRA zeigt die laufende Version und prüft, ob ein neueres Release existiert
   (GitHub-Releases bzw. Image-Tags).
2. Auf Knopfdruck sichert MIRA zuerst seine Datenbank (SQLite-Backup-API).
3. MIRA beauftragt Portainer über dessen API, den Stack `mira` mit neu geladenem
   Image zu aktualisieren. Portainer ersetzt daraufhin den MIRA-Container.
4. Nach dem Neustart zeigt MIRA das Ergebnis (neue Version, Migrationen) an.

Damit entfällt das manuelle Anpassen von `MIRA_VERSION`; der Stack nutzt `latest`
(nur Releases, nicht `main`).

### Zu klären vor der Umsetzung

| Thema | Frage |
| --- | --- |
| Portainer-API | Welche Edition/Version läuft? Welcher Endpunkt aktualisiert einen Web-Editor-Stack mit „Re-pull image“? Stack-ID und Umgebungs-ID ermitteln. |
| Zugang | Portainer-API-Token für MIRA – als Secret-Datei ([ADR 0006](../adr/0006-geheimnisse-als-dateien.md)); möglichst eingeschränkter Benutzer. |
| Erreichbarkeit | Erreicht MIRA Portainer (macvlan/Server-Netz bzw. Proxy-Netz)? |
| Selbst-Update | MIRA wird während des Vorgangs von Portainer beendet – der Auftrag muss vollständig bei Portainer liegen; MIRA darf nicht auf eine Antwort angewiesen sein. Anzeige des Ergebnisses nach dem Neustart. |
| Versionsprüfung | MIRA braucht Zugriff auf GitHub (ausgehend ins Internet) – oder die Prüfung entfällt und der Knopf lädt einfach `latest`. |
| Fehlerfall | Was passiert, wenn das neue Image nicht startet? Rückkehr zur vorherigen Version (Image-Tag merken) und Wiederherstellung des Backups. |
| Sicherheit | Der Knopf erfordert die Anmeldung, die Aktion wird im Audit-Log protokolliert; ggf. Passwort erneut abfragen. |

Abhängigkeit: Backup-Konzept (vorgesehen in Stufe 3).

## Lösungswege (ursprünglich betrachtet)

1. **`MIRA_VERSION` entfernen (= `latest`) und manuell „Pull and redeploy“** – kein Eingriff
   in Variablen mehr, aber weiterhin ein Klick pro Update.
2. **Stack aus dem Git-Repository mit automatischen Updates (Portainer „GitOps updates“)** –
   Portainer liest `deploy/portainer-stack.yml` direkt aus dem Repo, prüft in einem Intervall
   auf Änderungen und kann dabei das Image neu laden. Zu prüfen: Verfügbarkeit in der
   eingesetzten Portainer-Edition/-Version, ob ein neues Image ohne Änderung der Stack-Datei
   erkannt wird.
3. **Webhook** – GitHub Actions ruft nach dem Release einen Portainer-Webhook auf, der den
   Stack neu lädt. Zu prüfen: Verfügbarkeit in der Edition; Asgard ist aus dem Internet nicht
   erreichbar (nur Heimnetz/WireGuard), ein Aufruf aus GitHub scheidet daher voraussichtlich aus.
4. **Watchtower o. Ä.** – zusätzlicher Container, der Images regelmäßig prüft und Container
   neu startet. Eigenständige Komponente mit Zugriff auf den Docker-Socket (Sicherheitsabwägung).

## Offene Fragen

- Soll ein Update **automatisch** (ohne Zutun) oder **auf Knopfdruck** erfolgen?
  MIRA verwaltet produktive Infrastruktur; ein ungeprüftes Update könnte z. B. eine
  Datenbankmigration ausführen.
- Soll nur `latest` (Releases) oder auch `main` (jeder Push) verwendet werden?
  Empfehlung: nur Releases.
- Datensicherung vor Updates (Migrationen sind nicht rückwärts umkehrbar,
  [ADR 0003](../adr/0003-sqlite-mit-modulmigrationen.md)) – Zusammenhang mit dem
  Backup-Konzept aus Stufe 3.
