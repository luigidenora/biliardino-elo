import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

import { describe, expect, it } from 'vitest';

const BASE_URL = process.env.VITE_API_BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

describe('admin-notify API', () => {
  describe('Authentication', () => {
    it('should reject request without Authorization header', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'player-selected',
          playerId: 1,
          matchTime: '14:30'
        })
      });

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token'
        },
        body: JSON.stringify({
          type: 'player-selected',
          playerId: 1,
          matchTime: '14:30'
        })
      });

      expect(response.status).toBe(401);
    });

    it('should validate that ADMIN_TOKEN is configured', () => {
      expect(ADMIN_TOKEN).toBeDefined();
      expect(ADMIN_TOKEN.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject request without type', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          playerId: 1,
          matchTime: '14:30'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('type');
    });

    it('should reject request without playerId', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'player-selected',
          matchTime: '14:30'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('playerId');
    });

    it('should reject invalid type', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'invalid-type',
          playerId: 1,
          matchTime: '14:30'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Tipo non valido');
    });

    it('should reject player-selected without matchTime', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'player-selected',
          playerId: 1
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('matchTime');
    });

    it('should reject rank-change without oldRank or newRank', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'rank-change',
          playerId: 1,
          oldRank: 3
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('oldRank e newRank');
    });

    it('should reject rank-change with non-numeric ranks', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'rank-change',
          playerId: 1,
          oldRank: '3',
          newRank: '1'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('devono essere numeri');
    });
  });

  describe('Player-Selected Notifications', () => {
    it('should send player-selected notification with valid data', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'player-selected',
          playerId: 1,
          matchTime: '14:30'
        })
      });

      // Should either succeed or return 404 if subscription not found
      expect([200, 404]).toContain(response.status);

      const data = await response.json();
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.type).toBe('player-selected');
        expect(data.playerId).toBe(1);
        expect(data.playerName).toBeDefined();
        expect(data.message).toContain('Notifica inviata');
      } else {
        expect(data.error).toBeDefined();
      }
    });

    it('should send player-selected notification with custom message', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;
      const customMessage = 'Messaggio personalizzato di test';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'player-selected',
          playerId: 1,
          matchTime: '14:30',
          message: customMessage
        })
      });

      // Should either succeed or return 404 if subscription not found
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Rank-Change Notifications', () => {
    it('should send rank-change notification for improvement', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'rank-change',
          playerId: 1,
          oldRank: 3,
          newRank: 1
        })
      });

      // Should either succeed or return 404 if subscription not found
      expect([200, 404]).toContain(response.status);

      const data = await response.json();
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.type).toBe('rank-change');
        expect(data.playerId).toBe(1);
        expect(data.playerName).toBeDefined();
        expect(data.message).toContain('Notifica inviata');
      } else {
        expect(data.error).toBeDefined();
      }
    });

    it('should send rank-change notification for decline', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'rank-change',
          playerId: 1,
          oldRank: 1,
          newRank: 5
        })
      });

      // Should either succeed or return 404 if subscription not found
      expect([200, 404]).toContain(response.status);
    });

    it('should send rank-change notification with custom message', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;
      const customMessage = 'Messaggio personalizzato di cambio classifica';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          type: 'rank-change',
          playerId: 1,
          oldRank: 3,
          newRank: 1,
          message: customMessage
        })
      });

      // Should either succeed or return 404 if subscription not found
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Endpoint Configuration', () => {
    it('should format endpoint correctly', () => {
      const endpoint = `${BASE_URL}/admin-notify`;
      expect(endpoint).toContain('/admin-notify');
      expect(endpoint).toMatch(/^https?:\/\//);
    });

    it('should only accept POST method', async () => {
      const endpoint = `${BASE_URL}/admin-notify`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ADMIN_TOKEN}`
        }
      });

      expect(response.status).toBe(405);
    });
  });
});
