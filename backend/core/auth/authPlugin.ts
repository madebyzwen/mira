import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { changePasswordRequestSchema, loginRequestSchema, type SessionResponse, type SessionUser } from '@mira/shared';
import type { AppConfig } from '../config.ts';
import type { AuditLog } from '../audit.ts';
import type { Db } from '../db/database.ts';
import { AppError } from '../errors.ts';
import { LoginLimiter } from './loginLimiter.ts';
import { getDummyHash, hashPassword, verifyPassword } from './passwords.ts';
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
  db: Db;
  users: UserRepository;
  sessions: SessionStore;
  audit: AuditLog;
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const { config, db, users, sessions, audit } = deps;
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

  /**
   * Passwort ändern: aktuelles Passwort erforderlich (gleiche Fehlversuch-Sperre wie die
   * Anmeldung). Neuer Hash und das Beenden aller Sessions des Benutzers in einer Transaktion –
   * danach ist eine neue Anmeldung nötig, auch auf allen anderen Geräten.
   */
  app.post('/api/v1/auth/password', async (request, reply) => {
    const me = request.user!;
    const { currentPassword, newPassword } = changePasswordRequestSchema.parse(request.body);
    const ip = request.ip;
    const fail = (reason: string) =>
      audit.write({ actor: me.username, module: 'core', action: 'auth.password_change', result: 'failure', ip, details: { reason } });

    const wait = limiter.retryAfterSeconds(ip, me.username);
    if (wait > 0) {
      fail('rate_limited');
      reply.header('Retry-After', String(wait));
      throw new AppError('rate_limited', 429, 'Zu viele fehlgeschlagene Versuche.', { retryAfterSeconds: wait });
    }
    const stored = users.findById(me.id);
    if (!stored || !(await verifyPassword(currentPassword, stored.passwordHash))) {
      limiter.recordFailure(ip, me.username);
      fail('invalid_current_password');
      // 403 statt 401: die Session bleibt gültig, die Oberfläche meldet nicht „abgemeldet“
      throw new AppError('invalid_credentials', 403, 'Das aktuelle Passwort ist falsch.');
    }

    const newHash = await hashPassword(newPassword);
    let revoked = 0;
    const changed = db.transaction(() => {
      if (!users.replacePasswordHash(me.id, stored.passwordHash, newHash)) return false;
      revoked = sessions.revokeAllForUser(me.id);
      return true;
    })();
    if (!changed) {
      fail('concurrent_change');
      throw new AppError('invalid_credentials', 409, 'Das Passwort wurde inzwischen geändert. Bitte erneut anmelden.');
    }
    limiter.reset(ip, me.username);
    audit.write({ actor: me.username, module: 'core', action: 'auth.password_change', result: 'success', ip, details: { revokedSessions: revoked } });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  /** Alle Sessions des eigenen Kontos beenden (alle Geräte, auch diese Sitzung). */
  app.post('/api/v1/auth/sessions/revoke', async (request, reply) => {
    const me = request.user!;
    const revoked = sessions.revokeAllForUser(me.id);
    audit.write({ actor: me.username, module: 'core', action: 'auth.sessions_revoke', result: 'success', ip: request.ip, details: { revokedSessions: revoked } });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });
}
