# syntax=docker/dockerfile:1
# MIRA – ein Container für Backend (API) und Weboberfläche

# ---------- Build ----------
FROM node:22-alpine AS build
# Build-Werkzeuge für das native SQLite-Modul (falls kein fertiges Binary passt)
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY odin-api/package.json odin-api/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY backend backend
COPY frontend frontend
RUN npm run build

# ---------- Laufzeit-Abhängigkeiten (nur Backend + shared, ohne Frontend-Bibliotheken) ----------
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY odin-api/package.json odin-api/
RUN npm ci --omit=dev --no-audit --no-fund -w @mira/backend -w @mira/shared \
 && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src \
           node_modules/better-sqlite3/build/Release/obj* node_modules/better-sqlite3/build/Release/.deps

# ---------- Laufzeit ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    MIRA_DATA_DIR=/data \
    MIRA_STATIC_DIR=/app/frontend/dist \
    MIRA_PORT=8080
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
# Datenverzeichnis gehört dem unprivilegierten Benutzer „node“
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
# prüft den tatsächlich eingestellten Port (MIRA_PORT, Standard 8080)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "wget -q -O /dev/null http://127.0.0.1:${MIRA_PORT}/health || exit 1"]
CMD ["node", "backend/dist/server.js"]
