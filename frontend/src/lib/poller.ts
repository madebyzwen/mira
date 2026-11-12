/** Zustand einer regelmäßig neu geladenen Abfrage. */
export interface PollState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

/** Umgebung des Pollers – im Browser `document`/`window`, in Tests nachgebildet. */
export interface PollEnvironment {
  isHidden(): boolean;
  onVisible(listener: () => void): () => void;
  every(ms: number, fn: () => void): () => void;
}

export const browserEnvironment: PollEnvironment = {
  isHidden: () => document.hidden,
  onVisible(listener) {
    const handler = () => {
      if (!document.hidden) listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  every(ms, fn) {
    const timer = window.setInterval(fn, ms);
    return () => window.clearInterval(timer);
  },
};

/**
 * Lädt Daten sofort und danach in festem Intervall neu – ohne Wettlauf zwischen Anfragen:
 *
 * - Jede Anfrage erhält eine fortlaufende Nummer; nur die Antwort der **zuletzt gestarteten**
 *   Anfrage wird übernommen. Eine ältere, langsamere Antwort überschreibt nie neuere Daten.
 * - Läuft bereits eine Anfrage, lösen Intervall und Sichtbarwerden keine zweite aus.
 *   `refresh()` startet dagegen immer eine neue (die laufende wird dann verworfen).
 * - Im Hintergrund (Tab nicht sichtbar) wird nicht abgefragt, beim Zurückkehren sofort.
 * - Nach `stop()` (z. B. Unmount oder neuer Zeitraum) wird kein Zustand mehr gemeldet.
 */
export class Poller<T> {
  private readonly fetcher: () => Promise<T>;
  private readonly intervalMs: number;
  private readonly onChange: (state: PollState<T>) => void;
  private readonly env: PollEnvironment;
  private state: PollState<T>;
  private seq = 0;
  private running: number | null = null;
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: {
    fetcher: () => Promise<T>;
    intervalMs: number;
    onChange: (state: PollState<T>) => void;
    /** Daten einer vorigen Abfrage (z. B. anderer Zeitraum) bis zur ersten Antwort weiter anzeigen */
    initialData?: T | null;
    env?: PollEnvironment;
  }) {
    this.fetcher = options.fetcher;
    this.intervalMs = options.intervalMs;
    this.onChange = options.onChange;
    this.env = options.env ?? browserEnvironment;
    this.state = { data: options.initialData ?? null, error: null, loading: true };
  }

  get current(): PollState<T> {
    return this.state;
  }

  start(): void {
    if (this.stopped) return;
    this.cleanups.push(this.env.every(this.intervalMs, () => this.load(false)));
    this.cleanups.push(this.env.onVisible(() => this.load(false)));
    this.load(true);
  }

  stop(): void {
    this.stopped = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  /** Sofort neu laden (z. B. nach einer Änderung durch den Benutzer). */
  refresh(): void {
    this.load(true);
  }

  private load(force: boolean): void {
    if (this.stopped) return;
    if (!force && (this.running !== null || this.env.isHidden())) return;
    const id = ++this.seq;
    this.running = id;
    let request: Promise<T>;
    try {
      request = this.fetcher();
    } catch (err) {
      request = Promise.reject(err);
    }
    request.then(
      (data) => this.settle(id, { data, error: null, loading: false }),
      (error: unknown) => this.settle(id, { data: this.state.data, error, loading: false }),
    );
  }

  private settle(id: number, next: PollState<T>): void {
    if (this.running === id) this.running = null;
    // Nach dem Beenden oder bei einer überholten Anfrage nichts mehr übernehmen
    if (this.stopped || id !== this.seq) return;
    this.state = next;
    this.onChange(next);
  }
}
