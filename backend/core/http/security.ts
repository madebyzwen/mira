import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.ts';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // React setzt Inline-Styles (z. B. Balkenbreiten) – daher 'unsafe-inline' nur für Styles
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Sicherheits-Header für alle Antworten und Schutz gegen Cross-Site-Anfragen:
 * Ändernde API-Aufrufe werden abgewiesen, wenn der Browser einen fremden
 * `Origin` mitsendet (ergänzend zum SameSite=Strict-Cookie).
 */
export function registerSecurity(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    if (!STATE_CHANGING.has(request.method) || !request.url.startsWith('/api/')) return;
    const origin = request.headers.origin;
    if (!origin) return;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError('forbidden_origin', 403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
    if (originHost !== request.host) {
      throw new AppError('forbidden_origin', 403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    return payload;
  });
}
