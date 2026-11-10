#!/bin/sh
# Prüft, dass keine konkreten Gerätenamen fest eingebaut werden:
# - KI-Server statt des früheren Rechnernamens (Stufe 3a, ADR 0009)
# - Homeserver statt des Namens des NAS (2026-11-10)
# MIRA spricht von Rollen; Namen sind Einstellungen. Erlaubt nur in den Ausnahmen unten.
set -eu
cd "$(dirname "$0")/.."

# Gemeinsame Ausnahmen: historische Dokumente im Originalwortlaut bzw. zum damaligen Stand
COMMON='
:(exclude)scripts/check-naming.sh
:(exclude)docs/vorgaben/
:(exclude)docs/mockups/
:(exclude,glob)docs/entwicklung/stufe-0[0-3]-*.md
:(exclude)docs/entwicklung/stufe-03a-ki-server-bereinigung.md
'

# $1 = Muster (Groß-/Kleinschreibung bewusst getrennt, damit z. B. „Encoding“ nicht anschlägt),
# $2 = Beschreibung, danach zusätzliche Ausnahmen (pathspecs)
check() {
  pattern=$1; label=$2; shift 2
  # shellcheck disable=SC2086
  hits=$(git grep --untracked -n -I -E "$pattern" -- . $(printf '%s\n' "$COMMON" | sed '/^$/d') "$@" \
    | grep -v -E '0005-odin-http-api-statt-ssh|stufe-02-odin-lesen' || true)
  if [ -n "$hits" ]; then
    echo "$label – bitte die Rolle verwenden:" >&2
    echo "$hits" >&2
    return 1
  fi
}

failed=0
check '(^|[^a-z])odin|Odin|ODIN' 'Früherer Name des KI-Servers gefunden („KI-Server“ bzw. konfigurierter Name, ADR 0009)' \
  ':(exclude,glob)docs/adr/000[1-8]-*.md' \
  ':(exclude)backend/modules/systems/migrations.ts' \
  ':(exclude)backend/core/db/coreMigrations.ts' \
  ':(exclude)backend/test/migrations.test.ts' \
  ':(exclude)agent/install/install.sh' \
  ':(exclude)agent/install/uninstall.sh' \
  ':(exclude)agent/install/README.md' \
  ':(exclude)frontend/src/App.tsx' || failed=1
# ADRs 0001–0010 bleiben im damaligen Wortlaut
check '(^|[^a-z])asgard|Asgard|ASGARD' 'Name des NAS gefunden („Homeserver“)' \
  ':(exclude,glob)docs/adr/000[1-9]-*.md' \
  ':(exclude)docs/adr/0010-shelly-logger-als-eigener-container.md' || failed=1

[ "$failed" -eq 0 ] || exit 1
echo "Benennung in Ordnung: keine fest eingebauten Gerätenamen (KI-Server, Homeserver)."
