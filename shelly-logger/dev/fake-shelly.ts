/**
 * Simulierter Shelly für die lokale Entwicklung:
 *   npm run fake-shelly -w @mira/shelly-logger            # http://127.0.0.1:8099
 *   PORT=8099 POWER=95 PASSWORD=geheim npm run fake-shelly -w @mira/shelly-logger
 * Die Leistung schwankt leicht um POWER (W).
 */
import { FakeShelly } from '../test/fakeShelly.ts';

const port = Number(process.env.PORT ?? 8099);
const base = Number(process.env.POWER ?? 95);
const shelly = new FakeShelly({ password: process.env.PASSWORD || undefined, powerW: base });
const url = await shelly.listen(port, process.env.HOST ?? '127.0.0.1');
setInterval(() => shelly.setPower(Number((base + (Math.random() - 0.5) * base * 0.2).toFixed(1))), 1000).unref();
console.log(`Simulierter Shelly läuft unter ${url} (Leistung ≈ ${base} W${process.env.PASSWORD ? ', mit Passwort' : ''})`);
await new Promise(() => undefined);
