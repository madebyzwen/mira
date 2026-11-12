import { describe, expect, it } from 'vitest';
import { LoginLimiter } from '../core/auth/loginLimiter.ts';

const WINDOW = 15 * 60_000;

describe('Login-Sperre › Speicher begrenzt', () => {
  it('sperrt nach der Zahl der Fehlversuche und gibt nach Ablauf des Fensters frei', () => {
    const limiter = new LoginLimiter(5, WINDOW);
    for (let i = 0; i < 5; i++) limiter.recordFailure('198.51.100.1', 'sven', 1_000 + i);
    expect(limiter.retryAfterSeconds('198.51.100.1', 'sven', 2_000)).toBeGreaterThan(0);
    expect(limiter.retryAfterSeconds('198.51.100.1', 'sven', 1_004 + WINDOW)).toBe(0);
  });

  it('viele ausgedachte Benutzernamen lassen den Speicher nicht unbegrenzt wachsen', () => {
    const limiter = new LoginLimiter(5, WINDOW, 1_000);
    for (let i = 0; i < 20_000; i++) limiter.recordFailure(`198.51.${Math.floor(i / 250)}.${i % 250}`, `user${i}`, 1_000 + i);
    expect(limiter.size).toBeLessThanOrEqual(1_000);
  });

  it('abgelaufene Einträge werden entfernt', () => {
    const limiter = new LoginLimiter(5, WINDOW);
    for (let i = 0; i < 100; i++) limiter.recordFailure('198.51.100.1', `user${i}`, 1_000);
    expect(limiter.size).toBe(101);
    limiter.recordFailure('198.51.100.2', 'sven', 1_000 + 2 * WINDOW);
    expect(limiter.size).toBe(2);
  });

  it('die eigene IP-Sperre eines Angreifers bleibt auch beim Überlauf bestehen', () => {
    const limiter = new LoginLimiter(5, WINDOW, 100);
    for (let i = 0; i < 1_000; i++) limiter.recordFailure('203.0.113.9', `user${i}`, 1_000 + i);
    expect(limiter.retryAfterSeconds('203.0.113.9', 'sven', 2_100)).toBeGreaterThan(0);
  });
});
