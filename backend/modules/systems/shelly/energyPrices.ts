import type { EnergyPrice } from '@mira/shared';
import type { Db } from '../../../core/db/database.ts';
import { nowIso } from '../../../core/db/database.ts';

interface PriceRow {
  id: number;
  valid_from: string;
  cents_per_kwh: number;
  created_at: string;
}

const fromRow = (r: PriceRow): EnergyPrice => ({ id: r.id, validFrom: r.valid_from, centsPerKwh: r.cents_per_kwh, createdAt: r.created_at });

/** Kosten eines Zeitraums aus Tageswerten */
export interface CostResult {
  costEur: number | null;
  costComplete: boolean;
}

/**
 * Strompreis mit Gültigkeitsdatum: Ein Preis gilt ab seinem Tag bis zum nächsten
 * Eintrag. Kosten werden je Kalendertag mit dem an diesem Tag gültigen Preis
 * berechnet – bei einem Tarifwechsel bleiben vergangene Kosten richtig.
 */
export class EnergyPrices {
  private readonly db: Db;
  private cache: EnergyPrice[] | null = null;

  constructor(db: Db) {
    this.db = db;
  }

  list(): EnergyPrice[] {
    this.cache ??= this.db.prepare<[], PriceRow>('SELECT * FROM energy_prices ORDER BY valid_from').all().map(fromRow);
    return this.cache;
  }

  /** Preis ab einem Tag setzen; derselbe Tag wird ersetzt. */
  set(validFrom: string, centsPerKwh: number): EnergyPrice {
    this.db
      .prepare(
        `INSERT INTO energy_prices (valid_from, cents_per_kwh, created_at) VALUES (?, ?, ?)
         ON CONFLICT(valid_from) DO UPDATE SET cents_per_kwh = excluded.cents_per_kwh, created_at = excluded.created_at`,
      )
      .run(validFrom, centsPerKwh, nowIso());
    this.cache = null;
    return this.list().find((p) => p.validFrom === validFrom)!;
  }

  remove(id: number): EnergyPrice | null {
    const existing = this.list().find((p) => p.id === id) ?? null;
    if (existing) this.db.prepare('DELETE FROM energy_prices WHERE id = ?').run(id);
    this.cache = null;
    return existing;
  }

  /** gültiger Preis (ct/kWh) an einem Tag `JJJJ-MM-TT` */
  priceOn(day: string): number | null {
    let price: number | null = null;
    for (const p of this.list()) {
      if (p.validFrom <= day) price = p.centsPerKwh;
      else break;
    }
    return price;
  }

  /** Kosten aus Tageswerten (Wh); Tage ohne Verbrauch brauchen keinen Preis */
  cost(days: { day: string; energyWh: number }[]): CostResult {
    let eur = 0;
    let priced = false;
    let complete = true;
    for (const { day, energyWh } of days) {
      if (energyWh <= 0) continue;
      const cents = this.priceOn(day);
      if (cents === null) {
        complete = false;
        continue;
      }
      eur += (energyWh / 1000) * (cents / 100);
      priced = true;
    }
    return { costEur: priced ? Math.round(eur * 10_000) / 10_000 : null, costComplete: complete };
  }
}
