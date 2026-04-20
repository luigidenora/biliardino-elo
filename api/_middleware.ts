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
