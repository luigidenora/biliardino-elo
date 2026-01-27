#!/usr/bin/env node
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

// Check if API_TOKEN is set
const API_TOKEN = process.env.CRON_API_TOKEN;
if (!API_TOKEN) {
  console.error('❌ Error: API_TOKEN not set in environment variables');
  process.exit(1);
}
// Check if API_TOKEN is set
const API_BASE_URL = process.env.VITE_API_BASE_URL;
if (!API_BASE_URL) {
  console.error('❌ Error: API_BASE_URL not set in environment variables');
  process.exit(1);
}

// Set default MATCH_TIME if not provided
const MATCH_TIME = process.env.MATCH_TIME || new Date().toISOString().replace('T', ' ').slice(0, 19);

console.log('🚀 Testing broadcast endpoint...');
console.log('📤 Request details:');
console.log(`  URL: ${API_BASE_URL}/send-broadcast`);
console.log('  Match Time:', MATCH_TIME);
console.log('');

// Make the request
try {
  const response = await fetch(`${API_BASE_URL}/send-broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ matchTime: MATCH_TIME }),
  });

  const body = await response.text();
  const http_code = response.status;

  console.log('📥 Response code:', http_code);
  console.log('📄 Response body:');

  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }

  if (http_code === 200) {
    console.log('✅ Success!');
    process.exit(0);
  } else {
    console.log('❌ Error!');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Request failed:', error.message);
  process.exit(1);
}
