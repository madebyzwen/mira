import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Simulierter Shelly (Gen3, z. B. Plug PM) für Tests und Lasttests – bildet die lokale
 * RPC-API nach: `GET /shelly`, `GET /rpc/Shelly.GetStatus`, `GET /rpc/PM1.GetStatus`
 * bzw. `Switch.GetStatus`, optional mit Digest-Anmeldung (SHA-256).
 * Der Energiezähler läuft aus der eingestellten Leistung mit der echten Zeit.
 */
export interface FakeShellyOptions {
  model?: string;
  generation?: number;
  component?: 'pm1' | 'switch';
  password?: string;
  powerW?: number;
  voltageV?: number;
  /** Verzögerung jeder Antwort */
  delayMs?: number;
  /** Gen1-Gerät nachbilden */
  gen1?: boolean;
}

export class FakeShelly {
  private server: http.Server;
  private readonly options: Required<Omit<FakeShellyOptions, 'password'>> & { password?: string };
  private energyWh = 12_345.678;
  private lastUpdate = Date.now();
  private nonce = randomBytes(8).toString('hex');
  url = '';
  powerW: number;
  delayMs: number;
  /** Antworten zurückhalten (Gerät hängt) */
  hang = false;
  /** Antwort mit diesem Status statt Messwerten */
  failStatus: number | null = null;
  requests = 0;
  statusRequests = 0;
  concurrent = 0;
  maxConcurrent = 0;
  connections = 0;
  private readonly sockets = new Set<import('node:net').Socket>();

  constructor(options: FakeShellyOptions = {}) {
    this.options = {
      model: options.model ?? 'S3PM-001PCEU16',
      generation: options.generation ?? 3,
      component: options.component ?? 'pm1',
      powerW: options.powerW ?? 120,
      voltageV: options.voltageV ?? 230.4,
      delayMs: options.delayMs ?? 0,
      gen1: options.gen1 ?? false,
      password: options.password,
    };
    this.powerW = this.options.powerW;
    this.delayMs = this.options.delayMs;
    this.server = http.createServer((req, res) => void this.handle(req, res));
    this.server.keepAliveTimeout = 30_000;
    this.server.on('connection', (socket) => {
      this.connections += 1;
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  async listen(port = 0, host = '127.0.0.1'): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(port, host, resolve));
    this.url = `http://${host}:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Energiezähler bis jetzt fortschreiben */
  private advance(): void {
    const now = Date.now();
    this.energyWh += (this.powerW * (now - this.lastUpdate)) / 3_600_000;
    this.lastUpdate = now;
  }

  setPower(w: number): void {
    this.advance();
    this.powerW = w;
  }

  /** Zähler zurücksetzen (wie nach Werksreset/Neustart mancher Geräte) */
  resetCounter(): void {
    this.advance();
    this.energyWh = 0;
  }

  get counterWh(): number {
    this.advance();
    return this.energyWh;
  }

  private realm(): string {
    return `shellyplugpmg3-aabbccddeeff`;
  }

  private authorized(req: http.IncomingMessage): boolean {
    if (!this.options.password) return true;
    const h = req.headers.authorization;
    if (!h?.startsWith('Digest ')) return false;
    const p = Object.fromEntries([...h.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');
    const ha1 = sha(`admin:${this.realm()}:${this.options.password}`);
    const ha2 = sha(`GET:${p.uri}`);
    return p.nonce === this.nonce && p.uri === req.url && p.response === sha(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.requests += 1;
    this.concurrent += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    try {
      if (this.hang) return; // keine Antwort – der Client muss abbrechen
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? '';
      if (req.method !== 'GET') return send(405, { error: 'method' });

      if (url === '/shelly') {
        if (this.options.gen1) return send(200, { type: 'SHPLG-S', mac: 'AABBCCDDEEFF', auth: false, fw: '20230913-114010/v1.14.0' });
        return send(200, {
          name: null,
          id: 'shellyplugpmg3-aabbccddeeff',
          mac: 'AABBCCDDEEFF',
          model: this.options.model,
          gen: this.options.generation,
          fw_id: '20250101-000000/1.5.0-gabcdef',
          ver: '1.5.0',
          app: 'PlugPMG3',
          auth_en: Boolean(this.options.password),
          auth_domain: this.options.password ? this.realm() : null,
        });
      }

      if (!this.authorized(req)) {
        this.nonce = randomBytes(8).toString('hex');
        return send(401, { code: 401, message: 'unauthorized' }, {
          'WWW-Authenticate': `Digest qop="auth", realm="${this.realm()}", nonce="${this.nonce}", algorithm=SHA-256`,
        });
      }
      if (this.failStatus) return send(this.failStatus, { code: this.failStatus, message: 'Fehler' });

      this.advance();
      const meter = {
        id: 0,
        voltage: this.options.voltageV,
        current: Number((this.powerW / this.options.voltageV).toFixed(3)),
        apower: this.powerW,
        freq: 50,
        aenergy: { total: Number(this.energyWh.toFixed(3)), by_minute: [0, 0, 0], minute_ts: Math.floor(Date.now() / 1000) },
        ret_aenergy: { total: 0, by_minute: [0, 0, 0], minute_ts: Math.floor(Date.now() / 1000) },
      };
      const comp = this.options.component;
      if (url === '/rpc/Shelly.GetStatus') {
        return send(200, { sys: { uptime: 1000 }, wifi: { rssi: -58 }, [`${comp}:0`]: comp === 'switch' ? { ...meter, output: true, temperature: { tC: 31.2 } } : meter });
      }
      if ((comp === 'pm1' && url === '/rpc/PM1.GetStatus?id=0') || (comp === 'switch' && url === '/rpc/Switch.GetStatus?id=0')) {
        this.statusRequests += 1;
        return send(200, comp === 'switch' ? { ...meter, output: true, temperature: { tC: 31.2 } } : meter);
      }
      return send(404, { code: 404, message: 'No handler' });
    } finally {
      this.concurrent -= 1;
    }
  }
}
