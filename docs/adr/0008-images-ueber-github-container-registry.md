# 0008 – Images über GitHub Actions und die GitHub Container Registry

- Status: angenommen
- Datum: 2026-11-06
- Ergänzt: [ADR 0002](0002-ein-container-fuer-api-und-frontend.md)

## Kontext

Auf Asgard werden Anwendungen ausschließlich als Stacks über Portainer installiert.
Ein Stack aus dem Web-Editor kann kein Image aus Quellcode bauen. Auf Asgard ist
außerdem kein `git` vorhanden.

## Entscheidung

- Ein GitHub-Actions-Workflow (`.github/workflows/ci.yml`) führt bei jedem Push
  Typecheck und Tests aus und baut danach das Image für `linux/amd64`.
- Das Image wird in der GitHub Container Registry veröffentlicht:
  `ghcr.io/madebyzwen/mira` mit den Tags `main`, `sha-<commit>` und bei
  Versions-Tags `X.Y.Z`, `X.Y`, `latest`.
- Bei Versions-Tags (`vX.Y.Z`) entsteht zusätzlich ein GitHub-Release, an dem das
  Installationspaket der Odin-API hängt. Auf Odin genügt damit ein Download.
- Asgard nutzt `deploy/portainer-stack.yml` mit einer festen Version
  (`MIRA_VERSION`). Lokales Bauen bleibt mit `deploy/docker-compose.yml` möglich.

## Alternativen

- **Bauen per SSH auf Asgard:** kein öffentliches Image, aber Quellcode,
  Build-Werkzeuge und manuelle Schritte auf dem NAS; Updates nicht über Portainer.
- **Image auf dem Mac bauen und übertragen:** Cross-Build für amd64, manuelle Übertragung.

## Konsequenzen

- Das Image ist öffentlich – wie der Quellcode. Es enthält keine Geheimnisse;
  Passwörter und Tokens liegen nur auf Asgard (`appdata/mira/secrets`).
- Jedes Image entspricht genau einem Commit; nur getestete Stände werden gebaut.
- Updates in Portainer: `MIRA_VERSION` anpassen und „Update the stack“ (mit Pull).
