#!/usr/bin/env node
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

// Check if API_TOKEN is set
const API_TOKEN = process.env.ADMIN_API_TOKEN;
if (!API_TOKEN) {
  console.error('❌ Error: API_TOKEN not set in environment variables');
  process.exit(1);
}

// derive base url similar to env.config
let API_BASE_URL = '/api';
if (process.env.VERCEL_URL) {
  API_BASE_URL = `https://${process.env.VERCEL_URL}/api`;
}

console.log('Using API base URL:', API_BASE_URL);

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
      Authorization: `Bearer ${API_TOKEN}`
    }
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
