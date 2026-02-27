/**
 * JWT Auth System — Unit Tests
 *
 * Tests verifyAuth, withAuth middleware, and admin config.
 * Uses real jose JWT creation/verification with the real AUTH_JWT_SECRET
 * loaded from .env.local via tests/setup.ts (setupFiles).
 */
import * as jose from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { verifyAuth, withAuth } from '../../api/_auth';
import { mockRequest, mockResponse } from '../helpers/mock-vercel';

// ── Helpers ──────────────────────────────────────────────────────────────────
// Usa il vero AUTH_JWT_SECRET dal .env.local (caricato da tests/setup.ts)
const SECRET = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

async function signToken(
  payload: Record<string, any>,
  options?: { expiresIn?: string; algorithm?: string; secret?: Uint8Array }
): Promise<string> {
  const builder = new jose.SignJWT(payload)
    .setProtectedHeader({ alg: options?.algorithm ?? 'HS256' });

  if (options?.expiresIn) {
    builder.setExpirationTime(options.expiresIn);
  } else {
    builder.setExpirationTime('1h');
  }

  return builder.sign(options?.secret ?? SECRET);
}

// ═════════════════════════════════════════════════════════════════════════════
// verifyAuth
// ═════════════════════════════════════════════════════════════════════════════

describe('verifyAuth', () => {
  it('accetta un JWT valido senza requisito di ruolo', async () => {
    const token = await signToken({ sub: 'user-1', role: 'admin' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    const payload = await verifyAuth(req);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
  });

  it('accetta un JWT valido con ruolo corretto', async () => {
    const token = await signToken({ role: 'admin' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    const payload = await verifyAuth(req, 'admin');

    expect(payload.role).toBe('admin');
  });

  it('accetta ruolo cron', async () => {
    const token = await signToken({ role: 'cron' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    const payload = await verifyAuth(req, 'cron');
    expect(payload.role).toBe('cron');
  });

  it('accetta ruolo notify', async () => {
    const token = await signToken({ role: 'notify' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    const payload = await verifyAuth(req, 'notify');
    expect(payload.role).toBe('notify');
  });

  it('rifiuta se manca l\'header Authorization (401)', async () => {
    const req = mockRequest({ headers: {} });

    await expect(verifyAuth(req)).rejects.toThrow('Missing Authorization header');
  });

  it('rifiuta formato Authorization invalido (senza Bearer)', async () => {
    const req = mockRequest({ headers: { authorization: 'Basic abc123' } });

    await expect(verifyAuth(req)).rejects.toThrow('Invalid Authorization format');
  });

  it('rifiuta token vuoto', async () => {
    const req = mockRequest({ headers: { authorization: 'Bearer ' } });

    await expect(verifyAuth(req)).rejects.toThrow();
  });

  it('rifiuta token con firma invalida (401)', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-completely-different');
    const token = await signToken({ role: 'admin' }, { secret: wrongSecret });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    await expect(verifyAuth(req, 'admin')).rejects.toThrow();
  });

  it('rifiuta token scaduto (401)', async () => {
    const token = await signToken({ role: 'admin' }, { expiresIn: '-1s' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    await expect(verifyAuth(req, 'admin')).rejects.toThrow();
  });

  it('rifiuta ruolo non corrispondente (403)', async () => {
    const token = await signToken({ role: 'cron' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    try {
      await verifyAuth(req, 'admin');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain("required role 'admin'");
    }
  });

  it('rifiuta token senza claim di ruolo quando il ruolo è richiesto (403)', async () => {
    const token = await signToken({ sub: 'user-1' }); // no role
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });

    try {
      await verifyAuth(req, 'admin');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
  });

  it('rifiuta token malformato (non-JWT)', async () => {
    const req = mockRequest({ headers: { authorization: 'Bearer not-a-jwt-at-all' } });

    await expect(verifyAuth(req)).rejects.toThrow();
  });

  it('AUTH_JWT_SECRET è configurato nell\'ambiente di test', () => {
    // Verifica che il setup.ts abbia caricato correttamente il secret
    expect(process.env.AUTH_JWT_SECRET).toBeDefined();
    expect(process.env.AUTH_JWT_SECRET!.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// withAuth middleware
// ═════════════════════════════════════════════════════════════════════════════

describe('withAuth middleware', () => {
  it('esegue l\'handler per un token admin valido', async () => {
    const handler = vi.fn(async (_req, res) => res.status(200).json({ ok: true }));
    const protectedHandler = withAuth(handler, 'admin');

    const token = await signToken({ role: 'admin' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true });
  });

  it('allega il payload JWT alla request', async () => {
    const handler = vi.fn(async (req, res) => {
      const auth = (req as any).auth;
      return res.status(200).json({ role: auth.role });
    });
    const protectedHandler = withAuth(handler, 'admin');

    const token = await signToken({ role: 'admin', sub: 'user-1' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(res._json.role).toBe('admin');
  });

  it('gestisce CORS preflight senza autenticazione (200)', async () => {
    const handler = vi.fn();
    const protectedHandler = withAuth(handler, 'admin');

    const req = mockRequest({ method: 'OPTIONS' });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).not.toHaveBeenCalled(); // L'handler non viene chiamato
    expect(res._status).toBe(200);
    expect(res._ended).toBe(true);
  });

  it('blocca richieste senza token (401)', async () => {
    const handler = vi.fn();
    const protectedHandler = withAuth(handler, 'admin');

    const req = mockRequest({ method: 'POST' });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('blocca richieste con token invalido (401)', async () => {
    const handler = vi.fn();
    const protectedHandler = withAuth(handler, 'admin');

    const req = mockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer fake-token-here' },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('blocca richieste con ruolo sbagliato (403)', async () => {
    const handler = vi.fn();
    const protectedHandler = withAuth(handler, 'admin');

    const token = await signToken({ role: 'notify' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('permette accesso senza requisito di ruolo (null)', async () => {
    const handler = vi.fn(async (_req, res) => res.status(200).json({ ok: true }));
    const protectedHandler = withAuth(handler, null);

    const token = await signToken({ role: 'cron' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('blocca token scaduto (401)', async () => {
    const handler = vi.fn();
    const protectedHandler = withAuth(handler, 'admin');

    const token = await signToken({ role: 'admin' }, { expiresIn: '-1s' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();

    await protectedHandler(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Security middleware integration con auth
// ═════════════════════════════════════════════════════════════════════════════

describe('combineMiddlewares (auth + security)', () => {
  it('applica auth prima di eseguire l\'handler', async () => {
    const { combineMiddlewares, withSecurityMiddleware } = await import('../../api/_middleware');
    const callOrder: string[] = [];

    const handler = vi.fn(async (_req, res) => {
      callOrder.push('handler');
      return res.status(200).json({ ok: true });
    });

    const combined = combineMiddlewares(
      handler,
      (h) => withAuth(h, 'admin'),
      (h) => withSecurityMiddleware(h, { timeout: 5000 }),
    );

    const token = await signToken({ role: 'admin' });
    const req = mockRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { data: 'test' },
    });
    const res = mockResponse();

    await combined(req, res);

    expect(res._status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('blocca con auth prima di raggiungere la security middleware', async () => {
    const { combineMiddlewares, withSecurityMiddleware } = await import('../../api/_middleware');

    const handler = vi.fn();

    const combined = combineMiddlewares(
      handler,
      (h) => withAuth(h, 'admin'),
      (h) => withSecurityMiddleware(h),
    );

    const req = mockRequest({
      method: 'POST',
      body: { data: 'test' },
    });
    const res = mockResponse();

    await combined(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});
