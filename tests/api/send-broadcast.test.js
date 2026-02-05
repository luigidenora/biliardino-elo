import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

import { describe, expect, it } from 'vitest';

const BASE_URL = process.env.VITE_API_BASE_URL;

const API_TOKEN = process.env.CRON_API_TOKEN;

describe('send-broadcast API', () => {
  it('should send a broadcast notification with valid token', async () => {
    const endpoint = `${BASE_URL}/send-broadcast`;
    const matchTime = new Date().toISOString();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        matchTime: matchTime
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sent).toBeGreaterThanOrEqual(data.total);
    expect(data.failed).toBe(0);
  });

  it('should reject request without Authorization header', async () => {
    const endpoint = `${BASE_URL}/send-broadcast`;
    const matchTime = new Date().toISOString();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        matchTime: matchTime
      })
    });

    expect(response.status).toBe(401);
  });

  it('should reject request with invalid Authorization header', async () => {
    const endpoint = `${BASE_URL}/send-broadcast`;
    const matchTime = new Date().toISOString();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
      },
      body: JSON.stringify({
        matchTime: matchTime
      })
    });

    expect(response.status).toBe(401);
  });

  it('should validate that API_TOKEN is configured', () => {
    expect(API_TOKEN).toBeDefined();
    expect(API_TOKEN.length).toBeGreaterThan(0);
  });

  it('should format endpoint correctly', () => {
    const endpoint = `${BASE_URL}/send-broadcast`;
    expect(endpoint).toContain('/send-broadcast');
    expect(endpoint).toMatch(/^https?:\/\//);
  });
});
