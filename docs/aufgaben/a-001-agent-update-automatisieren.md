# A-001 – Update des MIRA-Agents auf dem KI-Server automatisieren

- Status: 📝 notiert (Details werden später geklärt)
- Notiert: 2026-11-06

## Ziel

Neue Versionen des MIRA-Agents sollen ohne manuelle Schritte auf dem KI-Server
(Herunterladen, Prüfsumme, Auspacken, `sudo ./install.sh`) eingespielt werden können.

## Ausgangslage

- Pakete entstehen bei jedem Versions-Tag als GitHub-Release
  (`mira-agent-X.Y.Z.tar.gz` + `.sha256`, [ADR 0008](../adr/0008-images-ueber-github-container-registry.md)).
- Ein Update ist heute: Paket laden, Prüfsumme prüfen, `sudo ./install.sh` ohne Parameter.
  Konfiguration, Zertifikat und Token bleiben erhalten (getestet 0.1.1 → 0.1.2).
- Die Installation braucht root-Rechte; der Agent selbst läuft bewusst ohne Rechte
  und ist nur lesend ([ADR 0005](../adr/0005-odin-http-api-statt-ssh.md)).

## Später zu klären

- Wer stößt das Update an: Knopf in MIRA, Zeitplan auf dem KI-Server oder beides?
- Wie erhält der Update-Vorgang root-Rechte, ohne den Agent selbst zu privilegieren
  (z. B. eigener, eng begrenzter Update-Dienst bzw. exakte sudo-Regel)?
- Prüfung der Echtheit über die Prüfsumme hinaus (z. B. Signatur der Releases).
- Verträglichkeit: Reihenfolge der Updates von MIRA und Agent; die Verträge in
  `shared/` werden bereits rückwärtsverträglich gehalten.
- Verhalten bei Fehlschlag: automatisches Zurückkehren zur vorherigen Version.
