import { defineConfig } from 'vitest/config';

// Tests der browserunabhängigen Logik (z. B. Polling) – ohne DOM-Nachbildung
export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
