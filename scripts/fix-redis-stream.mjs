#!/usr/bin/env node
/**
 * Deletes Redis keys that are stored as the wrong type for @upstash/realtime.
 * Run once when you get: WRONGTYPE Operation against a key holding the wrong kind of value
 */
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

const { Redis } = await import('@upstash/redis');
const redis = Redis.fromEnv();

const keysToCheck = ['development_lobby', 'preview_lobby', 'production_lobby'];

for (const key of keysToCheck) {
  const type = await redis.type(key);
  console.log(`'${key}' type:`, type);

  if (type !== 'stream' && type !== 'none') {
    await redis.del(key);
    console.log(`  → Deleted (was: ${type})`);
  } else {
    console.log(`  → OK, no action needed`);
  }
}
