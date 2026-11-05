/**
 * Begrenzt fehlgeschlagene Anmeldeversuche – getrennt nach IP-Adresse und
 * nach Benutzername. Ist eines von beiden über dem Limit, wird gesperrt.
 * Bewusst im Speicher: nach einem Neustart beginnt die Zählung neu, was bei
 * einer Single-User-Installation im Heimnetz ausreicht.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;

  constructor(maxFailures: number, windowMs: number) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
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
    for (const key of this.keys(ip, username)) {
      this.failures.set(key, [...this.recent(key, now), now]);
    }
  }

  reset(ip: string, username: string): void {
    for (const key of this.keys(ip, username)) this.failures.delete(key);
  }
}
