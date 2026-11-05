#!/bin/sh
# Erstellt das Installationspaket für Odin: release/mira-odin-api-<version>.tar.gz
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NAME="mira-odin-api-$VERSION"
rm -rf "release/$NAME" && mkdir -p "release/$NAME"
cp dist/odin-api.mjs "release/$NAME/"
cp install/install.sh install/uninstall.sh install/mira-odin-api.service \
   install/mira-odin-api-firewall.service install/config.example.json install/README.md "release/$NAME/"
chmod 755 "release/$NAME/install.sh" "release/$NAME/uninstall.sh"
tar -C release -czf "release/$NAME.tar.gz" "$NAME"
( cd release && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256" )
echo "Paket: odin-api/release/$NAME.tar.gz"
cat "release/$NAME.tar.gz.sha256"
