/**
 * Last- und Stabilitätstest des Shelly-Loggers.
 *
 *   npm run loadtest -w @mira/shelly-logger -- --duration 120 --interval 1000
 *   npm run loadtest -w @mira/shelly-logger -- --shelly http://<SHELLY_IP> --password-file pw.txt --duration 600
 *
 * Startet den Logger als eigenen Prozess (gegen den simulierten oder einen echten Shelly –
 * nur lesend), fragt die API so ab wie später MIRA (Live jede Sekunde, Verbrauch und
 * Verlauf gelegentlich) und gibt einen Bericht im Markdown-Format aus:
 * Abfragefrequenz, Antwortzeiten des Shelly, Fehlerrate, CPU/RAM des Loggers,
 * API-Antwortzeiten und Schreiblast der SQLite-Datenbank.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { DatabaseStatsResponse, LoggerHealth } from '@mira/shared';
import { FakeShelly } from '../test/fakeShelly.ts';
import { Store } from '../src/store.ts';

const { values } = parseArgs({
  options: {
    duration: { type: 'string', default: '120' },
    interval: { type: 'string', default: '1000' },
    shelly: { type: 'string' },
    'password-file': { type: 'string' },
    'live-rate': { type: 'string', default: '1' },
    /** gebauten Stand (dist/main.js) statt des Quellcodes starten – wie im Container */
    built: { type: 'boolean', default: false },
    report: { type: 'string' },
  },
});
const durationS = Number(values.duration);
const intervalMs = Number(values.interval);
const liveRate = Number(values['live-rate']);

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const fmt = (v: number | null, digits = 1) => (v === null ? '–' : v.toFixed(digits));

let fake: FakeShelly | null = null;
let shellyUrl = values.shelly;
if (!shellyUrl) {
  fake = new FakeShelly({ powerW: 95 });
  shellyUrl = await fake.listen();
  const f = fake;
  setInterval(() => f.setPower(Number((95 + (Math.random() - 0.5) * 20).toFixed(1))), 1000).unref();
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-load-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const entry = values.built
  ? [new URL('../dist/main.js', import.meta.url).pathname]
  : ['--conditions=source', new URL('../src/main.ts', import.meta.url).pathname];
const child = spawn(process.execPath, entry, {
  env: {
    ...process.env,
    LOGGER_SHELLY_URL: shellyUrl,
    LOGGER_SHELLY_PASSWORD_FILE: values['password-file'] ?? '',
    LOGGER_POLL_INTERVAL_MS: String(intervalMs),
    LOGGER_DATA_DIR: dataDir,
    LOGGER_HOST: '127.0.0.1',
    LOGGER_PORT: String(port),
    LOGGER_LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

async function timed(url: string): Promise<{ ms: number; ok: boolean; body: unknown }> {
  const t0 = performance.now();
  try {
    const res = await fetch(base + url);
    const body = await res.json();
    return { ms: performance.now() - t0, ok: res.ok, body };
  } catch {
    return { ms: performance.now() - t0, ok: false, body: null };
  }
}

// warten, bis der Logger antwortet
for (let i = 0; i < 100; i++) {
  if ((await timed('/health')).ok) break;
  await new Promise((r) => setTimeout(r, 100));
}

const live: number[] = [];
const reportsMs: number[] = [];
let apiErrors = 0;
const healthSamples: LoggerHealth[] = [];
const started = Date.now();
const until = started + durationS * 1000;

const liveLoop = (async () => {
  while (Date.now() < until) {
    const r = await timed('/api/v1/live');
    if (r.ok) live.push(r.ms);
    else apiErrors += 1;
    await new Promise((res) => setTimeout(res, 1000 / liveRate));
  }
})();
const reportLoop = (async () => {
  while (Date.now() < until) {
    for (const u of ['/api/v1/consumption?period=day', '/api/v1/consumption?period=month', '/api/v1/history?range=24h']) {
      const r = await timed(u);
      if (r.ok) reportsMs.push(r.ms);
      else apiErrors += 1;
    }
    await new Promise((res) => setTimeout(res, 10_000));
  }
})();
const healthLoop = (async () => {
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, 5_000));
    const r = await timed('/health');
    if (r.ok) healthSamples.push(r.body as LoggerHealth);
  }
})();
await Promise.all([liveLoop, reportLoop, healthLoop]);

const stats = (await timed('/api/v1/database/stats')).body as DatabaseStatsResponse;
const last = healthSamples.at(-1)!;
const stopT0 = Date.now();
child.kill('SIGTERM');
const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));
const stopMs = Date.now() - stopT0;
const dbFile = path.join(dataDir, 'shelly-logger.db');
const finalBytes = fs.statSync(dbFile).size;
const mode = values.built ? 'gebaut (dist, wie im Container)' : 'Quellcode (TypeScript)';

const cpu = healthSamples.map((h) => h.process.cpuPercent).filter((v): v is number => v !== null).slice(1);
const rss = healthSamples.map((h) => h.process.rssBytes / 1024 / 1024);
const minutes = durationS / 60;
const samplesPerHour = (stats.samples / minutes) * 60;
const failures = healthSamples.reduce((max, h) => Math.max(max, h.poller.failuresLastMinute), 0);
const growth = measureGrowth(30);

/** Datenbankwachstum: 30 Tage synthetischer 30-s-Intervalle (2 880 je Tag) schreiben und messen */
function measureGrowth(days: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-growth-'));
  const store = new Store(path.join(dir, 'g.db'), 'Europe/Berlin');
  const insert = store.db.prepare(
    `INSERT INTO power_samples (interval_start, interval_end, avg_w, min_w, max_w, sample_count, covered_ms, avg_voltage, energy_wh, quality)
     VALUES (?, ?, ?, ?, ?, 30, 30000, ?, ?, 'ok')`,
  );
  const start = Date.parse('2026-01-01T00:00:00Z');
  const n = days * 2880;
  store.db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const w = 80 + Math.random() * 40;
      insert.run(start + i * 30_000, start + (i + 1) * 30_000, w, w - 5, w + 5, 230 + Math.random(), (w * 30) / 3600);
    }
  })();
  const dayKeys = Array.from({ length: days + 1 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  store.recomputeDays(dayKeys);
  const t0 = performance.now();
  store.history(start + (days - 30) * 86_400_000, start + days * 86_400_000, 4 * 3_600_000);
  const historyMs = performance.now() - t0;
  store.db.pragma('wal_checkpoint(TRUNCATE)');
  const bytes = fs.statSync(path.join(dir, 'g.db')).size;
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return { rows: n, bytes, perRow: bytes / n, perYearMiB: ((bytes / n) * 2880 * 365) / 1024 / 1024, historyMs };
}

const report = `# Lasttest Shelly-Logger

| | |
| --- | --- |
| Datum | ${new Date(started).toISOString()} |
| Shelly | ${fake ? 'simuliert (Gen3 Plug PM)' : shellyUrl} |
| Dauer | ${durationS} s |
| Abfrageintervall | ${intervalMs} ms |
| API-Last | Live ${liveRate}×/s, Verbrauch + Verlauf alle 10 s |
| Rechner | ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} Kerne), Node ${process.version} |
| Logger | ${mode} |

## Abfrage am Shelly (letzte 60 s)

| Kennzahl | Wert |
| --- | --- |
| Tatsächliche Frequenz | ${last.poller.frequencyHz} Hz (Soll ${(1000 / intervalMs).toFixed(2)} Hz) |
| Abfragen / Fehler | ${last.poller.pollsLastMinute} / ${last.poller.failuresLastMinute} (höchstens ${failures} Fehler in einer Minute) |
| Antwortzeit Shelly p50 / p95 / max | ${fmt(last.poller.responseMs.p50, 0)} / ${fmt(last.poller.responseMs.p95, 0)} / ${fmt(last.poller.responseMs.max, 0)} ms |

## Logger-Prozess

| Kennzahl | Wert |
| --- | --- |
| CPU Mittel / max | ${fmt(cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : null, 2)} % / ${fmt(cpu.length ? Math.max(...cpu) : null, 2)} % (eines Kerns) |
| RAM (RSS) Start / Ende / max | ${fmt(rss[0])} / ${fmt(rss.at(-1) ?? null)} / ${fmt(rss.length ? Math.max(...rss) : null)} MB |
| Geordnetes Beenden | ${stopMs} ms, Exit-Code ${exitCode} |

## API

| Kennzahl | Wert |
| --- | --- |
| Live p50 / p95 / max | ${fmt(quantile(live, 0.5), 2)} / ${fmt(quantile(live, 0.95), 2)} / ${fmt(live.length ? Math.max(...live) : null, 2)} ms (${live.length} Anfragen) |
| Verbrauch/Verlauf p50 / p95 / max | ${fmt(quantile(reportsMs, 0.5), 2)} / ${fmt(quantile(reportsMs, 0.95), 2)} / ${fmt(reportsMs.length ? Math.max(...reportsMs) : null, 2)} ms (${reportsMs.length} Anfragen) |
| Fehler | ${apiErrors} |

## SQLite

| Kennzahl | Wert |
| --- | --- |
| Schreibvorgänge im Test | ${stats.samples} Intervalle (≈ ${samplesPerHour.toFixed(0)} je Stunde – eine Transaktion je 30 s) |
| Dateigröße nach dem Test | ${(finalBytes / 1024).toFixed(1)} KiB (überwiegend Grundbedarf der Datei) |
| Wachstum (30 Tage synthetisch) | ${growth.rows} Intervalle → ${(growth.bytes / 1024 / 1024).toFixed(1)} MiB, ≈ ${growth.perRow.toFixed(0)} Byte je Intervall |
| Hochrechnung | ≈ ${growth.perYearMiB.toFixed(0)} MiB je Jahr (2 880 Intervalle je Tag, ohne Löschung) |
| Verlauf 30 Tage aus 86 400 Intervallen | ${growth.historyMs.toFixed(1)} ms |
`;
console.log(report);
if (values.report) fs.writeFileSync(values.report, report);
fs.rmSync(dataDir, { recursive: true, force: true });
await fake?.close();
process.exit(0);
