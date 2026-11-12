import { describe, expect, it } from 'vitest';
import { Poller, type PollEnvironment, type PollState } from '../src/lib/poller.ts';

/** Nachgebildeter Browser: Intervall und Sichtbarkeit werden von Hand ausgelöst. */
function fakeEnvironment() {
  const intervals = new Set<() => void>();
  const visible = new Set<() => void>();
  const state = { hidden: false };
  const api: PollEnvironment = {
    isHidden: () => state.hidden,
    every: (_ms, fn) => {
      intervals.add(fn);
      return () => intervals.delete(fn);
    },
    onVisible: (fn) => {
      visible.add(fn);
      return () => visible.delete(fn);
    },
  };
  return {
    intervals,
    visible,
    api,
    set hidden(value: boolean) {
      state.hidden = value;
    },
    tick: () => intervals.forEach((fn) => fn()),
    show: () => {
      state.hidden = false;
      visible.forEach((fn) => fn());
    },
  };
}

/** Abfrage, deren Antworten der Test einzeln freigibt (langsame HTTP-Anfragen). */
function controlledFetcher<T>() {
  const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  return {
    pending,
    calls: () => pending.length,
    fetcher: () => new Promise<T>((resolve, reject) => pending.push({ resolve, reject })),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup<T>(initialData: T | null = null) {
  const env = fakeEnvironment();
  const f = controlledFetcher<T>();
  const states: PollState<T>[] = [];
  const poller = new Poller<T>({ fetcher: f.fetcher, intervalMs: 1000, onChange: (s) => states.push(s), env: env.api, initialData });
  return { env, f, states, poller };
}

describe('Polling ohne Wettlauf (F-04)', () => {
  it('schneller Zeitraumwechsel: die Antwort des alten Zeitraums überschreibt nie den neuen', async () => {
    // Zeitraum „1h“ fragt an, der Benutzer wechselt sofort auf „24h“
    const a = setup<string>();
    a.poller.start();
    a.poller.stop(); // usePolling beendet den alten Poller beim Wechsel des Schlüssels
    const b = setup<string>();
    b.poller.start();

    b.f.pending[0].resolve('24h');
    await flush();
    a.f.pending[0].resolve('1h'); // die langsame alte Antwort kommt zuletzt
    await flush();
    expect(a.states).toEqual([]);
    expect(b.states.at(-1)).toEqual({ data: '24h', error: null, loading: false });
  });

  it('langsame Anfrage: eine ältere Antwort überschreibt keine neuere (refresh während einer Anfrage)', async () => {
    const { f, states, poller } = setup<number>();
    poller.start();
    poller.refresh();
    expect(f.calls()).toBe(2);
    f.pending[1].resolve(2);
    await flush();
    f.pending[0].resolve(1);
    await flush();
    expect(states).toEqual([{ data: 2, error: null, loading: false }]);
    expect(poller.current.data).toBe(2);
  });

  it('keine parallelen Abfragen: Intervall und Sichtbarwerden warten auf die laufende Anfrage', async () => {
    const { env, f, poller } = setup<number>();
    poller.start();
    env.tick();
    env.show();
    env.tick();
    expect(f.calls()).toBe(1);
    f.pending[0].resolve(1);
    await flush();
    env.tick();
    expect(f.calls()).toBe(2);
  });

  it('fehlgeschlagene Anfrage: Fehler wird gemeldet, alte Daten bleiben, der nächste Erfolg setzt den Fehler zurück', async () => {
    const { env, f, states, poller } = setup<number>();
    poller.start();
    f.pending[0].resolve(1);
    await flush();
    env.tick();
    const boom = new Error('offline');
    f.pending[1].reject(boom);
    await flush();
    expect(states.at(-1)).toEqual({ data: 1, error: boom, loading: false });
    env.tick();
    f.pending[2].resolve(3);
    await flush();
    expect(states.at(-1)).toEqual({ data: 3, error: null, loading: false });
  });

  it('auch eine synchron werfende Abfrage beendet den Ladezustand', async () => {
    const env = fakeEnvironment();
    const states: PollState<number>[] = [];
    const poller = new Poller<number>({
      fetcher: () => {
        throw new Error('kaputt');
      },
      intervalMs: 1000,
      onChange: (s) => states.push(s),
      env: env.api,
    });
    poller.start();
    await flush();
    expect(states.at(-1)?.loading).toBe(false);
    expect(states.at(-1)?.error).toBeInstanceOf(Error);
  });

  it('Unmount: nach stop() keine Zustandsänderung und keine weiteren Abfragen', async () => {
    const { env, f, states, poller } = setup<number>();
    poller.start();
    poller.stop();
    f.pending[0].resolve(1);
    await flush();
    env.tick();
    env.show();
    poller.refresh();
    expect(states).toEqual([]);
    expect(f.calls()).toBe(1);
    expect(env.intervals.size).toBe(0);
    expect(env.visible.size).toBe(0);
  });

  it('Hintergrund und Vordergrund: im Hintergrund keine Abfrage, beim Zurückkehren sofort', async () => {
    const { env, f, poller } = setup<number>();
    poller.start();
    f.pending[0].resolve(1);
    await flush();
    env.hidden = true;
    env.tick();
    env.tick();
    expect(f.calls()).toBe(1);
    env.show();
    expect(f.calls()).toBe(2);
  });

  it('neuer Zeitraum: bisherige Daten bleiben bis zur ersten Antwort sichtbar, Fehler und Ladezustand werden zurückgesetzt', () => {
    const { poller } = setup<string>('alte Daten');
    expect(poller.current).toEqual({ data: 'alte Daten', error: null, loading: true });
  });
});
