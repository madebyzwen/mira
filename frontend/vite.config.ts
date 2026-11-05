import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

// In der Entwicklung leitet Vite API-Aufrufe an das lokal laufende Backend weiter.
const backend = process.env.MIRA_BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @mira/shared direkt aus dem TypeScript-Quellcode verwenden
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': backend,
      '/health': backend,
    },
  },
});
