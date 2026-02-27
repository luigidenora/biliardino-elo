import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateJSON, validatePayloadSize, withTimeout } from './_validation.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void | VercelResponse>;

/**
 * Security middleware per proteggere contro vulnerabilità Node.js
 * - Prototype Pollution
 * - JSON Bombs
 * - Timeout su operazioni lunghe
 * - Validazione payload
 */
export function withSecurityMiddleware(handler: Handler, options?: {
  maxPayloadSize?: number;
  timeout?: number;
}): Handler {
  const maxPayloadSize = options?.maxPayloadSize || 1024 * 100; // 100KB default
  const timeout = options?.timeout || 30000; // 30s default

  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      // 1. Valida dimensione payload per prevenire JSON bombs
      if (req.body && typeof req.body === 'object') {
        try {
          validatePayloadSize(req.body, maxPayloadSize);
        } catch (err) {
          console.warn('⚠️ Payload troppo grande rilevato');
          return res.status(413).json({
            error: 'Payload troppo grande',
            message: (err as Error).message
          });
        }

        // 2. Previeni Prototype Pollution
        try {
          validateJSON(req.body);
        } catch (err) {
          console.error('🚨 Tentativo di Prototype Pollution rilevato:', (err as Error).message);
          return res.status(400).json({
            error: 'Richiesta non valida',
            message: 'Struttura dati non permessa'
          });
        }
      }

      // 3. Esegui handler con timeout per prevenire operazioni bloccanti
      return await withTimeout(
        handler(req, res),
        timeout,
        'Request timeout - operazione troppo lenta'
      );
    } catch (err) {
      // Gestione errori sicura
      const error = err as Error;

      if (error.message.includes('timeout')) {
        console.error('⏱️ Request timeout:', req.url);
        return res.status(504).json({
          error: 'Request timeout',
          message: 'Operazione impiegata troppo tempo'
        });
      }

      console.error('❌ Error in security middleware:', error.message);

      // Non esporre dettagli di errori interni
      return res.status(500).json({
        error: 'Errore del server',
        message: 'Si è verificato un errore'
      });
    }
  };
}

/**
 * Middleware per rate limiting a livello di memoria
 * Previene abusi limitando richieste per IP
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function withRateLimiting(
  handler: Handler,
  options?: {
    maxRequests?: number;
    windowMs?: number;
  }
): Handler {
  const maxRequests = options?.maxRequests || 100;
  const windowMs = options?.windowMs || 60000; // 1 minuto

  return async (req: VercelRequest, res: VercelResponse) => {
    // Ottieni IP (considera proxy headers)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]
      || req.headers['x-real-ip'] as string
      || 'unknown';

    const now = Date.now();
    const record = requestCounts.get(ip);

    if (record && record.resetAt > now) {
      // Finestra attiva
      if (record.count >= maxRequests) {
        console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Limite richieste raggiunto, riprova tra poco',
          retryAfter: Math.ceil((record.resetAt - now) / 1000)
        });
      }
      record.count++;
    } else {
      // Nuova finestra
      requestCounts.set(ip, {
        count: 1,
        resetAt: now + windowMs
      });
    }

    // Pulizia periodica della mappa (ogni 5 minuti)
    if (Math.random() < 0.01) { // 1% chance su ogni richiesta
      const cutoff = now - windowMs * 2;
      for (const [key, value] of requestCounts.entries()) {
        if (value.resetAt < cutoff) {
          requestCounts.delete(key);
        }
      }
    }

    return handler(req, res);
  };
}

/**
 * Combina multiple middlewares in uno
 */
export function combineMiddlewares(
  handler: Handler,
  ...middlewares: ((h: Handler) => Handler)[]
): Handler {
  return middlewares.reduceRight(
    (wrapped, middleware) => middleware(wrapped),
    handler
  );
}
