/** Formatierungshilfen (deutsches Zahlenformat). */

const cache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

export function formatNumber(value: number, fractionDigits = 0, minFractionDigits = fractionDigits): string {
  return nf(minFractionDigits, fractionDigits).format(value);
}

export function formatPercent(value: number): string {
  return `${formatNumber(Math.round(value))} %`;
}

export function percentOf(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

/** Speichergröße in GB, ab 1024 GB als TB. */
export function formatStorageGb(gb: number): string {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${formatNumber(tb, Number.isInteger(tb) ? 0 : 2)} TB`;
  }
  return `${formatNumber(gb)} GB`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatEuro(value: number): string {
  return `${formatNumber(value, 2)} €`;
}
