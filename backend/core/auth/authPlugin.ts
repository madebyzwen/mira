import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loginRequestSchema, type SessionResponse, type SessionUser } from '@mira/shared';
import type { AppConfig } from '../config.ts';
import type { AuditLog } from '../audit.ts';
import { AppError } from '../errors.ts';
import { LoginLimiter } from './loginLimiter.ts';
import { getDummyHash, verifyPassword } from './passwords.ts';
import { SESSION_COOKIE, SessionStore } from './sessions.ts';
import type { UserRepository } from './users.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Angemeldeter Benutzer – auf allen geschützten Routen gesetzt. */
    user?: SessionUser;
  }
}

/** Routen unter /api, die ohne Anmeldung erreichbar sind. */
const PUBLIC_API_ROUTES = new Set(['POST /api/v1/auth/login', 'POST /api/v1/auth/logout']);

interface AuthDeps {
  config: AppConfig;
  users: UserRepository;
  sessions: SessionStore;
  audit: AuditLog;
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const { config, users, sessions, audit } = deps;
  const limiter = new LoginLimiter(config.loginMaxFailures, config.loginWindowMs);

  const setSessionCookie = (request: FastifyRequest, reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: config.cookieSecure === 'auto' ? request.protocol === 'https' : config.cookieSecure,
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
  };

  // Zugriffsschutz: jede /api-Route außer den öffentlichen erfordert eine gültige Session.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    if (PUBLIC_API_ROUTES.has(`${request.method} ${url}`)) return;

    const token = request.cookies[SESSION_COOKIE];
    const session = token ? sessions.validate(token) : undefined;
    const user = session ? users.findById(session.userId) : undefined;
    if (!token || !session || !user) {
      throw new AppError('unauthorized', 401, 'Anmeldung erforderlich.');
    }
    if (session.renewed) setSessionCookie(request, reply, token);
    request.user = { id: user.id, username: user.username, displayName: user.displayName };
  });

  app.post('/api/v1/auth/login', async (request, reply): Promise<SessionResponse> => {
    const { username, password } = loginRequestSchema.parse(request.body);
    const ip = request.ip;

    const wait = limiter.retryAfterSeconds(ip, username);
    if (wait > 0) {
      audit.write({ actor: username, module: 'core', action: 'auth.login', result: 'failure', ip, details: { reason: 'rate_limited' } });
      reply.header('Retry-After', String(wait));
      throw new AppError('rate_limited', 429, 'Zu viele fehlgeschlagene Anmeldeversuche.', { retryAfterSeconds: wait });
    }

    const user = users.findByUsername(username);
    // Auch bei unbekanntem Benutzer wird ein Hash geprüft – gleiche Antwortzeit, keine Benutzer-Enumeration.
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) {
      limiter.recordFailure(ip, username);
      audit.write({ actor: username, module: 'core', action: 'auth.login', result: 'failure', ip, details: { reason: 'invalid_credentials' } });
      throw new AppError('invalid_credentials', 401, 'Benutzername oder Passwort ist falsch.');
    }

    limiter.reset(ip, username);
    const { token } = sessions.create(user.id, { ip, userAgent: request.headers['user-agent'] });
    users.touchLogin(user.id);
    audit.write({ actor: user.username, module: 'core', action: 'auth.login', result: 'success', ip });
    setSessionCookie(request, reply, token);
    return { user: { id: user.id, username: user.username, displayName: user.displayName } };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const session = sessions.validate(token);
      const user = session ? users.findById(session.userId) : undefined;
      sessions.revoke(token);
      if (user) audit.write({ actor: user.username, module: 'core', action: 'auth.logout', result: 'success', ip: request.ip });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/v1/auth/session', async (request): Promise<SessionResponse> => ({ user: request.user! }));
}
