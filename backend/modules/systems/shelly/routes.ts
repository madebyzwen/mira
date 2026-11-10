import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  HISTORY_RANGES,
  SHELLY_SLUG,
  consumptionQuerySchema,
  createEnergyPriceSchema,
  type DatabaseStatsResponse,
  type EnergyPricesResponse,
  type PowerHistoryResponse,
  type ShellyConsumptionResponse,
  type ShellyStatusResponse,
  type ShellySummaryResponse,
} from '@mira/shared';
import type { AuditLog } from '../../../core/audit.ts';
import { AppError } from '../../../core/errors.ts';
import type { EnergyPrices } from './energyPrices.ts';
import { LoggerClientError } from './loggerClient.ts';
import { localDay, type ShellyService } from './shellyService.ts';

const base = `/api/v1/systems/${SHELLY_SLUG}`;
const historyQuerySchema = z.object({ range: z.enum(HISTORY_RANGES).default('1h') });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Logger nicht erreichbar → 503 statt alter oder erfundener Werte */
async function viaLogger<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LoggerClientError) {
      throw new AppError('service_unavailable', 503, 'Der Shelly-Logger ist nicht erreichbar.', { reason: err.code });
    }
    throw err;
  }
}

/**
 * Shelly Plug in MIRA – alle Routen nur angemeldet (Präfix /api/v1).
 * Messwerte kommen vom Shelly-Logger, Strompreis und Kosten aus MIRA.
 */
export function registerShellyRoutes(app: FastifyInstance, deps: { service: ShellyService; prices: EnergyPrices; audit: AuditLog }): void {
  const { service, prices, audit } = deps;

  app.get(base, async (): Promise<ShellyStatusResponse> => service.status());

  app.get(`${base}/summary`, async (): Promise<ShellySummaryResponse> => viaLogger(() => service.summaryPeriods()));

  app.get(`${base}/consumption`, async (request): Promise<ShellyConsumptionResponse> => {
    const { period, date } = consumptionQuerySchema.parse(request.query);
    return viaLogger(() => service.consumption(period, date));
  });

  app.get(`${base}/history`, async (request): Promise<PowerHistoryResponse> => {
    const { range } = historyQuerySchema.parse(request.query);
    return viaLogger(() => service.powerHistory(range));
  });

  app.get(`${base}/database`, async (): Promise<DatabaseStatsResponse> => viaLogger(() => service.databaseStats()));

  const priceList = (): EnergyPricesResponse => ({
    prices: prices.list(),
    currentPriceCents: prices.priceOn(localDay(new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)),
  });

  app.get(`${base}/prices`, async (): Promise<EnergyPricesResponse> => priceList());

  app.post(`${base}/prices`, async (request): Promise<EnergyPricesResponse> => {
    const { validFrom, centsPerKwh } = createEnergyPriceSchema.parse(request.body);
    prices.set(validFrom, centsPerKwh);
    service.pricesChanged();
    audit.write({ actor: request.user?.username, module: 'systems', action: 'energy_price.set', target: validFrom, result: 'success', ip: request.ip, details: { centsPerKwh } });
    return priceList();
  });

  app.delete(`${base}/prices/:id`, async (request): Promise<EnergyPricesResponse> => {
    const { id } = idParamSchema.parse(request.params);
    const removed = prices.remove(id);
    if (!removed) throw new AppError('not_found', 404, 'Strompreis nicht gefunden.');
    service.pricesChanged();
    audit.write({ actor: request.user?.username, module: 'systems', action: 'energy_price.delete', target: removed.validFrom, result: 'success', ip: request.ip, details: { centsPerKwh: removed.centsPerKwh } });
    return priceList();
  });
}
