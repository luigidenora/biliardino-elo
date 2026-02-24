import { Redis } from '@upstash/redis';
console.log('🔌 Inizializzazione Redis Client...');
console.log('URL:', process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
console.log(
  'Token configured:',
  !!(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
);

const vercelEnv = (process.env.VERCEL_ENV || process.env.NODE_ENV || 'development').toLowerCase();

function makeVercelPrefix(): string {
  const id = process.env.VERCEL_GIT_COMMIT_REF
    || process.env.VERCEL_GIT_BRANCH
    || process.env.VERCEL_URL
    || 'local';
  const safe = String(id).replace(/[^a-z0-9-_]/gi, '_').toLowerCase().slice(0, 64);
  return `${vercelEnv}_${safe}_`;
}

export const redisPrefix = makeVercelPrefix();

export const prefixed = (key: string) => {
  console.log('Prefissando chiave Redis:', key, '->', `${redisPrefix}${key}`);
  return `${redisPrefix}${key}`
};

// underlying client from environment
const _redis = Redis.fromEnv();

// Create a small explicit wrapper that prefixes string keys (first arg).
const wrap = <T extends Record<string, any>>(client: T, methods: string[]) => {
  const out: Record<string, any> = {};
  for (const m of methods) {
    const fn = (client as any)[m];
    if (typeof fn !== 'function') continue;
    out[m] = (...args: any[]) => {
      if (args.length > 0) {
        const a0 = args[0];
        if (typeof a0 === 'string') args[0] = prefixed(a0);
        else if (Array.isArray(a0)) args[0] = a0.map((v: any) => (typeof v === 'string' ? prefixed(v) : v));
      }
      return fn.apply(client, args);
    };
  }
  return out as T;
};

const methodsToWrap = [
  'get', 'set', 'del', 'keys', 'lrange', 'lpush', 'expire', 'incr', 'ttl', 'scan'
];

export const redisRaw = _redis;
export const redis = wrap(_redis as any, methodsToWrap) as unknown as typeof _redis;
