import type { FastifyInstance } from 'fastify';
import {
  markNotificationsReadSchema,
  notificationsQuerySchema,
  type ManualUpdateCheckResponse,
  type NotificationsResponse,
  type UpdateStatusResponse,
} from '@mira/shared';
import { z } from 'zod';
import type { AuditLog } from '../audit.ts';
import { AppError } from '../errors.ts';
import type { NotificationStore } from '../notifications.ts';
import type { UpdateService } from './updateService.ts';

interface Deps {
  notifications: NotificationStore;
  updates: UpdateService;
  audit: AuditLog;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Benachrichtigungen (Glocke) und Update-Status – alle Routen nur angemeldet. */
export function registerNotificationRoutes(app: FastifyInstance, { notifications, updates, audit }: Deps): void {
  app.get('/api/v1/notifications', async (request): Promise<NotificationsResponse> => {
    const { refresh } = notificationsQuerySchema.parse(request.query);
    if (refresh === 'true') {
      // Erster Aufruf am Tag: Prüfung im Hintergrund – die Antwort wartet nicht darauf.
      void updates.checkOnVisit()?.catch((err: unknown) => request.log.error({ err }, 'Update-Prüfung beim Aufruf fehlgeschlagen'));
    }
    return { notifications: notifications.list(), unread: notifications.unreadCount(), checking: updates.checking };
  });

  app.post('/api/v1/notifications/read', async (request, reply) => {
    const { ids } = markNotificationsReadSchema.parse(request.body ?? {});
    notifications.markRead(ids);
    return reply.status(204).send();
  });

  app.delete('/api/v1/notifications/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    if (!notifications.dismiss(id)) throw new AppError('not_found', 404, 'Benachrichtigung nicht gefunden.');
    return reply.status(204).send();
  });

  app.get('/api/v1/system/update', async (): Promise<UpdateStatusResponse> => updates.status());

  // Prüfung von Hand (Knopf „Jetzt prüfen“ unter Konfiguration › MIRA) – Sperrfrist siehe UpdateService.
  app.post('/api/v1/system/update/check', async (request): Promise<ManualUpdateCheckResponse> => {
    const result = await updates.checkManually();
    if (result) {
      audit.write({
        actor: request.user?.username,
        module: 'core',
        action: 'update.check',
        result: result.ok ? 'success' : 'failure',
        ip: request.ip,
        details: result.error ? { error: result.error } : undefined,
      });
    }
    return { performed: result !== null, status: updates.status() };
  });
}
