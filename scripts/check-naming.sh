#!/bin/sh
# Prüft, dass der frühere Name des KI-Servers nicht wieder fest eingebaut wird
# (Stufe 3a, ADR 0009). MIRA spricht vom „KI-Server“; sein Name ist eine Einstellung
# (MIRA_AI_SERVER_NAME). Erlaubt bleibt der Name nur in den Ausnahmen unten.
set -eu
cd "$(dirname "$0")/.."

# Groß-/Kleinschreibung bewusst getrennt: „Encoding“ o. Ä. soll nicht anschlagen.
PATTERN='(^|[^a-z])odin|Odin|ODIN'

hits=$(git grep --untracked -n -I -E "$PATTERN" -- . \
  ':(exclude)scripts/check-naming.sh' \
  ':(exclude)docs/vorgaben/' \
  ':(exclude)docs/mockups/' \
  ':(exclude,glob)docs/adr/000[1-8]-*.md' \
  ':(exclude,glob)docs/entwicklung/stufe-0[0-3]-*.md' \
  ':(exclude)docs/entwicklung/stufe-03a-ki-server-bereinigung.md' \
  ':(exclude)backend/modules/systems/migrations.ts' \
  ':(exclude)backend/core/db/coreMigrations.ts' \
  ':(exclude)backend/test/migrations.test.ts' \
  ':(exclude)agent/install/install.sh' \
  ':(exclude)agent/install/uninstall.sh' \
  ':(exclude)agent/install/README.md' \
  ':(exclude)frontend/src/App.tsx' \
  | grep -v -E '0005-odin-http-api-statt-ssh|stufe-02-odin-lesen' || true)
# Ausnahmen:
# - historische Dokumente (Vorgaben, Mockups, ADRs 0001–0008, Stufen 0–3) und Dateinamen darin
# - Datenbankmigrationen (bereits angewendet, unveränderlich) und ihr Test
# - Übergang für den Umstieg (Installer, Weiterleitung der alten Route) – entfällt mit A-006

if [ -n "$hits" ]; then
  echo "Früherer Name des KI-Servers gefunden – bitte „KI-Server“ bzw. den konfigurierten Namen verwenden (ADR 0009):" >&2
  echo "$hits" >&2
  exit 1
fi
echo "Benennung in Ordnung: kein fest eingebauter Name des KI-Servers."
