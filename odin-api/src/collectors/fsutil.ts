import fs from 'node:fs/promises';
import path from 'node:path';

/** Liest eine Textdatei; `null`, wenn sie fehlt oder nicht lesbar ist. */
export async function readText(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function readNumber(file: string): Promise<number | null> {
  const text = await readText(file);
  if (text === null || text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export async function listDir(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {
    return [];
  }
}

export function join(...parts: string[]): string {
  return path.join(...parts);
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Bereich wie „0-15,20,22-23“ → Liste von Zahlen (Format von /sys/devices/…/cpus). */
export function parseRangeList(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [a, b] = part.split('-').map(Number);
    if (Number.isNaN(a)) continue;
    for (let i = a; i <= (Number.isNaN(b) || b === undefined ? a : b); i += 1) out.push(i);
  }
  return out;
}

/** Oktal-Escapes in /proc/mounts (z. B. `\040` für Leerzeichen) auflösen. */
export function unescapeMount(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}
