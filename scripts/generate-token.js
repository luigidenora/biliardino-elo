#!/usr/bin/env node
import dotenv from 'dotenv';
import * as jose from 'jose';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

/**
 * Script per generare JWT firmati con HS256
 * Utilizzare per creare token di autenticazione per le API
 *
 * Usage:
 *   node scripts/generate-token.js <role> [expiration]
 *
 * Arguments:
 *   role: admin | cron | notify
 *   expiration: durata in secondi (opzionale, se omesso il token non scade)
 *
 * Example:
 *   node scripts/generate-token.js cron
 *   node scripts/generate-token.js admin 86400
 *   AUTH_JWT_SECRET=your-secret node scripts/generate-token.js notify
 *
 * Se hai un file .env o .env.local nella root, viene caricato automaticamente.
 */

const SECRET = process.env.AUTH_JWT_SECRET;
const VALID_ROLES = ['admin', 'cron', 'notify'];

async function generateToken(role, expirationSeconds) {
  if (!SECRET) {
    console.error('Errore: AUTH_JWT_SECRET non configurato');
    console.error('Usa: AUTH_JWT_SECRET=your-secret node scripts/generate-token.js <role>');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Errore: ruolo "${role}" non valido`);
    console.error(`Ruoli validi: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const secret = new TextEncoder().encode(SECRET);

  let signer = new jose.SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt();

  // Imposta exp solo se fornita (token senza scadenza se expirationSeconds assente)
  if (typeof expirationSeconds === 'number' && Number.isFinite(expirationSeconds)) {
    signer = signer.setExpirationTime(`${expirationSeconds}s`);
  }

  const token = await signer.sign(secret);

  console.log('\n✅ Token generato con successo!\n');
  console.log(`🔑 Role: ${role}`);
  if (typeof expirationSeconds === 'number' && Number.isFinite(expirationSeconds)) {
    console.log(`⏰ Scadenza: ${expirationSeconds}s (${Math.floor(expirationSeconds / 86400)} giorni)`);
  } else {
    console.log('⏰ Scadenza: nessuna (token senza exp)');
  }
  console.log(`\n📋 Token:\n${token}\n`);
  console.log('💡 Usa questo token nell\'header Authorization:');
  console.log(`   Authorization: Bearer ${token}\n`);
  console.log('💡 Per GitHub Actions, salvalo come secret API_TOKEN\n');

  return token;
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Errore: ruolo mancante');
  console.error('\n💡 Usage: node scripts/generate-token.js <role> [expiration]');
  console.error(`💡 Ruoli validi: ${VALID_ROLES.join(', ')}`);
  console.error('💡 Esempio: node scripts/generate-token.js cron\n');
  process.exit(1);
}

const role = args[0];
const expiration = args[1] ? parseInt(args[1], 10) : undefined;

if (args[1] && (isNaN(expiration) || expiration <= 0)) {
  console.error('❌ Errore: expiration deve essere un numero positivo di secondi');
  process.exit(1);
}

generateToken(role, expiration).catch((err) => {
  console.error('❌ Errore generazione token:', err.message);
  process.exit(1);
});
