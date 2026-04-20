/**
 * Validation and Sanitization utilities for API security
 * Prevents injection attacks and validates input formats
 */

/* `validateMatchTime` rimosso: il concetto di matchTime è deprecato nel nuovo flusso lobby */

/**
 * Valida e sanitizza il playerId
 * Previene injection attacks e garantisce che sia un numero positivo
 */
export function validatePlayerId(playerId: unknown): number {
  const id = Number(playerId);

  if (Number.isNaN(id)) {
    throw new Error('playerId deve essere un numero valido');
  }

  if (!Number.isInteger(id)) {
    throw new Error('playerId deve essere un numero intero');
  }

  if (id <= 0) {
    throw new Error('playerId deve essere maggiore di 0');
  }

  // Limite ragionevole per prevenire overflow
  if (id > 999999) {
    throw new Error('playerId non valido');
  }

  return id;
}

/**
 * Sanitizza una stringa per uso sicuro in chiavi Redis
 * Rimuove caratteri speciali che potrebbero causare injection
 */
export function sanitizeRedisKey(input: string): string {
  // Rimuovi caratteri pericolosi per Redis pattern matching
  // Mantieni solo alfanumerici, trattini, underscore e due punti
  return input.replace(/[^a-zA-Z0-9\-_:]/g, '');
}

/**
 * Valida l'host header per prevenire Host Header Injection
 * Usa una whitelist di domini conosciuti
 */
export function validateHost(host: string | undefined): string {
  if (!host) {
    throw new Error('Host header mancante');
  }

  // Previeni injection di caratteri di controllo
  if (/[\r\n\t\x00-\x1F]/.test(host)) {
    console.warn(`⚠️ Host con caratteri invalidi: ${host}`);
    throw new Error('Host non autorizzato');
  }

  // Whitelist di host permessi (configura in base al tuo deployment)
  const allowedHosts = [
    'localhost:3000',
    'localhost:5173',
    process.env.VERCEL_URL, // Auto-populated by Vercel
    process.env.PRODUCTION_URL // Custom domain
  ].filter(Boolean);

  // Rimuovi porta per comparazione più flessibile
  const hostWithoutPort = host.split(':')[0];

  const isAllowed = allowedHosts.some((allowedHost) => {
    if (!allowedHost) return false;
    const allowedHostWithoutPort = allowedHost.split(':')[0];
    return host === allowedHost || hostWithoutPort === allowedHostWithoutPort;
  });

  if (!isAllowed) {
    console.warn(`⚠️ Host non permesso: ${host}`);
    throw new Error('Host non autorizzato');
  }

  return host;
}

/**
 * Valida un numero con range specifico
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  const num = Number(value);

  if (Number.isNaN(num)) {
    throw new Error(`${fieldName} deve essere un numero valido`);
  }

  if (min !== undefined && num < min) {
    throw new Error(`${fieldName} deve essere >= ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new Error(`${fieldName} deve essere <= ${max}`);
  }

  return num;
}

/**
 * Valida una stringa con lunghezza massima
 * Previene DoS tramite input eccessivamente lunghi
 */
export function validateString(
  value: unknown,
  fieldName: string,
  maxLength = 1000,
  minLength = 1
): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} deve essere una stringa`);
  }

  if (value.length < minLength) {
    throw new Error(`${fieldName} non può essere vuoto`);
  }

  if (value.length > maxLength) {
    throw new Error(`${fieldName} troppo lungo (max ${maxLength} caratteri)`);
  }

  return value;
}

/**
 * Escaping per log output per prevenire log injection
 */
export function sanitizeLogOutput(input: unknown): string {
  if (typeof input !== 'string') {
    return String(input);
  }

  // Rimuovi newline e caratteri di controllo che potrebbero corrompere i log
  return input
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1F\x7F]/g, ''); // Rimuovi caratteri di controllo
}

/**
 * Previene Prototype Pollution validando che l'oggetto non contenga chiavi pericolose
 * Protegge contro attacchi che tentano di modificare Object.prototype
 *
 * NOTA: In produzione, usare anche parseJSONSafely() per validare il JSON prima del parse
 */
export function preventPrototypePollution(obj: any): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  function checkObject(current: any, path = '', depth = 0): void {
    if (!current || typeof current !== 'object') {
      return;
    }

    // Previeni loop infiniti
    if (depth > 10) {
      throw new Error('Struttura oggetto troppo profonda (max 10 livelli)');
    }

    // Usa solo Object.keys per evitare proprietà ereditate
    const ownKeys = Object.keys(current);

    // Check esplicito se __proto__ è stato settato come proprietà propria
    if (Object.prototype.hasOwnProperty.call(current, '__proto__')) {
      throw new Error(`Proprietà pericolosa rilevata: ${path ? path + '.' : ''}__proto__`);
    }

    // Check per constructor e prototype come proprietà proprie
    if (Object.prototype.hasOwnProperty.call(current, 'constructor')
      && path !== '') { // Permetti constructor a livello root (normale per oggetti)
      throw new Error(`Proprietà pericolosa rilevata: ${path ? path + '.' : ''}constructor`);
    }

    if (Object.prototype.hasOwnProperty.call(current, 'prototype')) {
      throw new Error(`Proprietà pericolosa rilevata: ${path ? path + '.' : ''}prototype`);
    }

    // Check per chiavi che contengono __proto__, constructor, prototype
    for (const key of ownKeys) {
      const fullPath = path ? `${path}.${key}` : key;

      // Block varianti case-insensitive e con encoding
      const lowerKey = key.toLowerCase();
      if (lowerKey === '__proto__' || lowerKey === 'constructor' || lowerKey === 'prototype') {
        throw new Error(`Proprietà pericolosa rilevata: ${fullPath}`);
      }

      // Controlla ricorsivamente oggetti nested
      if (current[key] && typeof current[key] === 'object') {
        try {
          checkObject(current[key], fullPath, depth + 1);
        } catch (e) {
          throw e;
        }
      }
    }
  }

  checkObject(obj);
}

/**
 * Parse JSON in modo sicuro prevenendo Prototype Pollution
 * Usa un reviver per bloccare chiavi pericolose
 */
export function parseJSONSafely(jsonString: string): any {
  return JSON.parse(jsonString, (key, value) => {
    // Blocca chiavi pericolose
    const lowerKey = key.toLowerCase();
    if (lowerKey === '__proto__' || lowerKey === 'constructor' || lowerKey === 'prototype') {
      throw new Error(`Proprietà pericolosa rilevata nel JSON: ${key}`);
    }

    return value;
  });
}

/**
 * Valida dimensione del payload per prevenire JSON bombs e DoS
 */
export function validatePayloadSize(body: any, maxSizeBytes = 1024 * 100): void {
  const size = JSON.stringify(body).length;

  if (size > maxSizeBytes) {
    throw new Error(`Payload troppo grande: ${size} bytes (max ${maxSizeBytes})`);
  }
}

/**
 * Timeout per operazioni che potrebbero bloccare l'event loop
 * Previene ReDoS e altre operazioni lente
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operazione timeout'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Valida una regex per prevenire ReDoS (Regular Expression Denial of Service)
 * Blocca pattern pericolosi che potrebbero causare backtracking esponenziale
 */
export function isSafeRegex(pattern: string): boolean {
  // Pattern noti per causare ReDoS - nested quantifiers
  const dangerousPatterns = [
    /\([^)]*\+\)\+/, // (x+)+ pattern
    /\([^)]*\*\)\*/, // (x*)* pattern
    /\([^)]*\+\)\*/, // (x+)* pattern
    /\([^)]*\*\)\+/ // (x*)+ pattern
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  // Limita lunghezza pattern
  if (pattern.length > 100) {
    return false;
  }

  return true;
}

/**
 * Valida un oggetto JSON in modo sicuro
 * Previene: Prototype Pollution, JSON bombs, circular references
 */
export function validateJSON(data: any): any {
  // Previeni payload troppo grandi
  validatePayloadSize(data);

  // Previeni Prototype Pollution
  preventPrototypePollution(data);

  return data;
}

/**
 * Sanitizza parametri per prevenire Command Injection in child_process
 * NON usare se possibile, preferire alternative sicure
 */
export function sanitizeCommandArg(arg: string): string {
  // Rimuovi caratteri pericolosi per shell
  const dangerous = /[;&|`$(){}[\]<>\\'"]/g;

  if (dangerous.test(arg)) {
    throw new Error('Argomento comando contiene caratteri non permessi');
  }

  // Whitelist: solo alfanumerici, trattini, underscore, punti
  if (!/^[a-zA-Z0-9\-_.]+$/.test(arg)) {
    throw new Error('Argomento comando non valido');
  }

  return arg;
}

/**
 * Previene Path Traversal attacks
 * Verifica che il path richiesto non esca dalla directory base
 */
export function validatePath(requestedPath: string, baseDir: string): string {
  const path = require('path');

  // Normalizza il path per risolvere .. e .
  const normalizedPath = path.normalize(requestedPath);

  // Blocca path assoluti
  if (path.isAbsolute(normalizedPath)) {
    throw new Error('Path assoluti non permessi');
  }

  // Blocca .. che esce dalla base
  if (normalizedPath.startsWith('..') || normalizedPath.includes('/../')) {
    throw new Error('Path traversal non permesso');
  }

  // Costruisci path finale e verifica che sia dentro baseDir
  const finalPath = path.join(baseDir, normalizedPath);
  const resolvedFinal = path.resolve(finalPath);
  const resolvedBase = path.resolve(baseDir);

  if (!resolvedFinal.startsWith(resolvedBase)) {
    throw new Error('Accesso fuori dalla directory base non permesso');
  }

  return finalPath;
}
