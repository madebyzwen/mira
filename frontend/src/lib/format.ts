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

/** Kosten: Beträge unter einem Cent nicht als „0,00 €“ verschleiern */
export function formatCost(eur: number): string {
  return eur > 0 && eur < 0.005 ? '< 0,01 €' : formatEuro(eur);
}

/** Energie: unter 1 kWh in Wh, darüber in kWh */
export function formatEnergy(wh: number): string {
  if (wh < 1000) return `${formatNumber(wh, wh < 10 ? 1 : 0, wh < 10 ? 1 : 0)} Wh`;
  const kwh = wh / 1000;
  return `${formatNumber(kwh, kwh < 100 ? 2 : 1, kwh < 100 ? 2 : 1)} kWh`;
}

/** Dateigröße mit passender Einheit (KB, MB, GB; Basis 1024) */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024, 0)} KB`;
  if (bytes < 1024 ** 3) return `${formatNumber(bytes / 1024 ** 2, 1, 1)} MB`;
  return formatBytes(bytes);
}

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

/** Bytes in GB/TB (Basis 1024, wie `df -h`), deutsches Zahlenformat. */
export function formatBytes(bytes: number): string {
  if (bytes >= TIB) return `${formatNumber(bytes / TIB, 2, 2)} TB`;
  const gb = bytes / GIB;
  return `${formatNumber(gb, gb >= 100 ? 0 : 1, gb >= 100 ? 0 : 1)} GB`;
}

/** Installierter Arbeitsspeicher: Der Kernel meldet etwas weniger als verbaut ist – auf volle 4 GB aufrunden. */
export function formatInstalledMemory(totalBytes: number): string {
  return `${Math.ceil(totalBytes / GIB / 4) * 4} GB`;
}

export function formatGib(bytes: number, digits = 1): string {
  return formatNumber(bytes / GIB, digits, digits);
}

/** Laufzeit wie „3 Tage, 14:27 h“. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const time = `${hours}:${String(minutes).padStart(2, '0')} h`;
  if (days === 0) return time;
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}, ${time}`;
}

/** Relative Zeitangabe wie „vor 3 Min.“ */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  const days = Math.floor(diff / 86400);
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

/** „Intel(R) Core(TM) i7-14700“ → „i7-14700“ */
export function shortCpuModel(model: string): string {
  return model
    .replace(/\((R|TM)\)/g, '')
    .replace(/^Intel\s+Core\s+/i, '')
    .replace(/^AMD\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
