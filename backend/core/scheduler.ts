import type { FastifyBaseLogger } from 'fastify';

type Job = () => unknown | Promise<unknown>;

/** Nächster Zeitpunkt (Ortszeit) für „HH:MM“, streng nach `from`. */
export function nextDailyRun(time: string, from: Date = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const next = new Date(from);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Minimaler Scheduler für Hintergrundaufgaben im Prozess.
 * Fehler einer Aufgabe werden protokolliert und beenden weder die Aufgabe noch MIRA.
 * Eine Aufgabe läuft nie doppelt, falls ein Durchlauf länger dauert als ihr Intervall.
 */
export class Scheduler {
  private readonly log: FastifyBaseLogger;
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly pending: (() => void)[] = [];
  private started = false;
  private stopped = false;

  constructor(log: FastifyBaseLogger) {
    this.log = log;
  }

  private guarded(name: string, job: Job): () => Promise<void> {
    let running = false;
    return async () => {
      if (running || this.stopped) return;
      running = true;
      try {
        await job();
      } catch (err) {
        this.log.error({ err, job: name }, 'Hintergrundaufgabe fehlgeschlagen');
      } finally {
        running = false;
      }
    };
  }

  /** Aufgaben laufen erst nach `start()` (MIRA vollständig bereit). */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const activate of this.pending.splice(0)) activate();
  }

  private whenStarted(activate: () => void): void {
    if (this.started) activate();
    else this.pending.push(activate);
  }

  /** Alle `intervalMs` ausführen; optional sofort beim Start ein erstes Mal. */
  every(name: string, intervalMs: number, job: Job, options: { runNow?: boolean } = {}): void {
    this.whenStarted(() => this.activateEvery(name, intervalMs, job, options));
  }

  private activateEvery(name: string, intervalMs: number, job: Job, options: { runNow?: boolean }): void {
    const run = this.guarded(name, job);
    if (options.runNow) void run();
    const timer = setInterval(() => void run(), intervalMs);
    timer.unref();
    this.timers.add(timer);
  }

  /** Täglich zur Uhrzeit „HH:MM“ (Ortszeit) ausführen. */
  dailyAt(name: string, time: string, job: Job): void {
    this.whenStarted(() => this.activateDaily(name, time, job));
  }

  private activateDaily(name: string, time: string, job: Job): void {
    const run = this.guarded(name, job);
    const schedule = () => {
      if (this.stopped) return;
      const delay = nextDailyRun(time).getTime() - Date.now();
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void run().finally(schedule);
      }, delay);
      timer.unref();
      this.timers.add(timer);
    };
    schedule();
    this.log.info({ job: name, next: nextDailyRun(time).toString() }, 'Tägliche Aufgabe geplant');
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
