#!/bin/sh
# Erstellt das Installationspaket für den KI-Server: release/mira-agent-<version>.tar.gz
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NAME="mira-agent-$VERSION"
rm -rf "release/$NAME" && mkdir -p "release/$NAME"
cp dist/mira-agent.mjs "release/$NAME/"
cp install/install.sh install/uninstall.sh install/mira-agent.service \
   install/mira-agent-firewall.service install/config.example.json install/README.md "release/$NAME/"
chmod 755 "release/$NAME/install.sh" "release/$NAME/uninstall.sh"
tar -C release -czf "release/$NAME.tar.gz" "$NAME"
( cd release && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256" )
echo "Paket: agent/release/$NAME.tar.gz"
cat "release/$NAME.tar.gz.sha256"
