/**
 * Begrenzt fehlgeschlagene Anmeldeversuche – getrennt nach IP-Adresse und
 * nach Benutzername. Ist eines von beiden über dem Limit, wird gesperrt.
 * Bewusst im Speicher: nach einem Neustart beginnt die Zählung neu, was bei
 * einer Single-User-Installation im Heimnetz ausreicht. Der Speicher ist begrenzt:
 * Abgelaufene Einträge werden regelmäßig entfernt, höchstens `maxKeys` Einträge
 * (z. B. bei vielen ausgedachten Benutzernamen) – darüber fallen die ältesten weg.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private lastSweep = 0;

  constructor(maxFailures: number, windowMs: number, maxKeys = 10_000) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** Anzahl gespeicherter Einträge (für Tests) */
  get size(): number {
    return this.failures.size;
  }

  private sweep(now: number): void {
    if (this.failures.size + 2 <= this.maxKeys && now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, list] of this.failures) {
      if (!list.some((t) => now - t < this.windowMs)) this.failures.delete(key);
    }
    // Weiterhin zu viele: älteste Einträge (Einfügereihenfolge) verwerfen – Platz für die
    // zwei Einträge (IP und Benutzername), die der aktuelle Fehlversuch anlegt
    for (const key of this.failures.keys()) {
      if (this.failures.size + 2 <= this.maxKeys) break;
      this.failures.delete(key);
    }
  }

  private keys(ip: string, username: string): string[] {
    return [`ip:${ip}`, `user:${username.toLowerCase()}`];
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Sekunden bis zur nächsten erlaubten Anmeldung, oder 0 wenn erlaubt. */
  retryAfterSeconds(ip: string, username: string, now = Date.now()): number {
    let wait = 0;
    for (const key of this.keys(ip, username)) {
      const list = this.recent(key, now);
      if (list.length >= this.maxFailures) {
        const oldestRelevant = list[list.length - this.maxFailures];
        wait = Math.max(wait, Math.ceil((oldestRelevant + this.windowMs - now) / 1000));
      }
    }
    return wait;
  }

  recordFailure(ip: string, username: string, now = Date.now()): void {
    this.sweep(now);
    for (const key of this.keys(ip, username)) {
      const list = [...this.recent(key, now), now].slice(-this.maxFailures);
      // neu einfügen, damit die Einfügereihenfolge der letzten Aktivität entspricht
      this.failures.delete(key);
      this.failures.set(key, list);
    }
  }

  reset(ip: string, username: string): void {
    for (const key of this.keys(ip, username)) this.failures.delete(key);
  }
}
