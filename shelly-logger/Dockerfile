# syntax=docker/dockerfile:1
# MIRA Shelly-Logger – eigenständiger Container, getrennt vom MIRA-Image gebaut und versioniert.
# Build aus dem Wurzelverzeichnis:  docker build -f shelly-logger/Dockerfile -t mira-shelly-logger .

# ---------- Build ----------
FROM node:22-alpine AS build
# Build-Werkzeuge für das native SQLite-Modul (falls kein fertiges Binary passt)
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY agent/package.json agent/
COPY shelly-logger/package.json shelly-logger/
RUN npm ci --no-audit --no-fund -w @mira/shared -w @mira/shelly-logger
COPY shared shared
COPY shelly-logger shelly-logger
RUN npm run build -w @mira/shared && npm run build -w @mira/shelly-logger

# ---------- Laufzeit-Abhängigkeiten (nur Logger + shared) ----------
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY agent/package.json agent/
COPY shelly-logger/package.json shelly-logger/
RUN npm ci --omit=dev --no-audit --no-fund -w @mira/shelly-logger -w @mira/shared \
 && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src \
           node_modules/better-sqlite3/build/Release/obj* node_modules/better-sqlite3/build/Release/.deps

# ---------- Laufzeit ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    LOGGER_DATA_DIR=/data \
    LOGGER_PORT=8090
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shelly-logger/package.json shelly-logger/
COPY --from=build /app/shelly-logger/dist shelly-logger/dist
# Datenverzeichnis gehört dem unprivilegierten Benutzer „node“ (UID 1000); keine Datenbank im Image
# npm, npx und corepack werden zur Laufzeit nicht gebraucht (Start direkt mit node) – entfernt,
# damit das Image nur enthält, was MIRA braucht. Vorher die Alpine-Pakete aktualisieren.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8090
# Der Container ist gesund, solange der Logger läuft und antwortet – auch wenn der Shelly
# gerade nicht erreichbar ist (das zeigt /health im Feld „meter.state“). Geprüft wird die
# Adresse, auf der die API tatsächlich lauscht (LOGGER_HOST; 0.0.0.0 → 127.0.0.1).
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["sh", "-c", "H=${LOGGER_HOST:-0.0.0.0}; [ \"$H\" = 0.0.0.0 ] && H=127.0.0.1; wget -q -O /dev/null http://$H:${LOGGER_PORT}/health || exit 1"]
# SIGTERM (docker stop) beendet geordnet: laufende Abfrage abwarten, Intervall schreiben, Datenbank schließen
STOPSIGNAL SIGTERM
CMD ["node", "shelly-logger/dist/main.js"]
