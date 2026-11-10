// Bündelt den MIRA-Agent zu einer einzigen Datei (inkl. Abhängigkeiten).
// Auf dem KI-Server wird nur Node.js benötigt – kein npm, keine node_modules.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: [new URL('../src/main.ts', import.meta.url).pathname],
  outfile: new URL('../dist/mira-agent.mjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  conditions: ['source'],
  define: { __AGENT_VERSION__: JSON.stringify(version) },
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'info',
});
