import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuditLog } from '../audit.ts';
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

/** Browser merken sich für ein Jahr, MIRA unter diesem Hostnamen nur per HTTPS aufzurufen. */
const HSTS = 'max-age=31536000';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SecurityOptions {
  /** `https://host[:port]` – gesetzt = HTTPS-Pflicht (`MIRA_PUBLIC_URL`) */
  publicOrigin?: string;
  audit?: AuditLog;
}

const pathOf = (request: FastifyRequest) => request.url.split('?')[0];

/**
 * Sicherheits-Header für alle Antworten, HTTPS-Pflicht und Schutz gegen Cross-Site-Anfragen.
 *
 * HTTPS-Pflicht (mit `publicOrigin`): Ob eine Anfrage per HTTPS kam, weiß MIRA nur vom
 * vertrauenswürdigen Reverse Proxy (`X-Forwarded-Proto`, nur von `MIRA_TRUST_PROXY`).
 * Unverschlüsselte Aufrufe der Oberfläche werden auf die HTTPS-Adresse umgeleitet – das
 * Anmeldeformular wird also nie über HTTP ausgeliefert. API-Anfragen über HTTP werden ohne
 * Verarbeitung abgelehnt. `/health` bleibt für den Docker-Healthcheck erreichbar.
 *
 * Cross-Site: Ändernde API-Aufrufe werden abgewiesen, wenn der Browser einen fremden
 * `Origin` mitsendet (ergänzend zum SameSite=Strict-Cookie). Mit HTTPS-Pflicht muss der
 * `Origin` exakt der öffentlichen Adresse entsprechen (Protokoll, Host und Port).
 */
export function registerSecurity(app: FastifyInstance, options: SecurityOptions = {}): void {
  const { publicOrigin, audit } = options;

  if (publicOrigin) {
    app.addHook('onRequest', async (request, reply) => {
      const url = pathOf(request);
      if (url === '/health' || request.protocol === 'https') return;
      if ((request.method === 'GET' || request.method === 'HEAD') && !url.startsWith('/api/') && url !== '/api') {
        return reply.redirect(`${publicOrigin}${request.url.startsWith('/') ? request.url : '/'}`, 308);
      }
      if (url === '/api/v1/auth/login' || url === '/api/v1/auth/password') {
        // Zugangsdaten wurden möglicherweise bereits unverschlüsselt übertragen – festhalten
        request.log.warn({ ip: request.ip, url }, 'Anmeldedaten über unverschlüsseltes HTTP abgelehnt');
        audit?.write({ module: 'core', action: 'auth.insecure_transport', target: url, result: 'failure', ip: request.ip });
      }
      throw new AppError('https_required', 403, `MIRA ist nur über HTTPS erreichbar: ${publicOrigin}`, { url: publicOrigin });
    });
  }

  app.addHook('onRequest', async (request) => {
    if (!STATE_CHANGING.has(request.method) || !request.url.startsWith('/api/')) return;
    const origin = request.headers.origin;
    if (!origin) return;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new AppError('forbidden_origin', 403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
    const sameOrigin = publicOrigin
      ? parsed.origin === publicOrigin
      : (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === request.host;
    if (!sameOrigin) {
      throw new AppError('forbidden_origin', 403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (publicOrigin && request.protocol === 'https') reply.header('Strict-Transport-Security', HSTS);
    return payload;
  });
}
