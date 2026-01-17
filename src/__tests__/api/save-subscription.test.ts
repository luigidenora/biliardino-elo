/**
 * API Tests for save-subscription endpoint
 *
 * This test suite validates the save-subscription API endpoint behavior,
 * including valid requests, input validation, error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Vercel Blob functions
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  list: vi.fn()
}));

import { put, list } from '@vercel/blob';
import handler from '../../../api/save-subscription';

// Mock request and response objects
const createMockRequest = (method: string, body?: any): any => ({
  method,
  body: body || {}
});

const createMockResponse = (): any => {
  const res: any = {
    statusCode: 200,
    data: null,
    status: vi.fn(function (code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (data: any) {
      this.data = data;
      return this;
    }),
    end: vi.fn()
  };
  return res;
};

describe('save-subscription API - POST requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock for put
    (put as any).mockResolvedValue({
      url: 'https://blob.vercel-storage.com/mock-url',
      downloadUrl: 'https://blob.vercel-storage.com/mock-url'
    });
  });

  it('should successfully save a valid subscription', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-12345',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key'
        }
      },
      playerId: 42,
      playerName: 'Mario Rossi'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        playerId: 42,
        url: expect.stringContaining('blob.vercel-storage.com')
      })
    );
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^biliardino-subs\//),
      expect.stringContaining('"playerId":42'),
      expect.objectContaining({
        access: 'public',
        contentType: 'application/json'
      })
    );
  });

  it('should convert string playerId to number', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: '123', // String instead of number
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 123 // Should be converted to number
      })
    );
  });

  it('should reject missing subscription field', async () => {
    const req = createMockRequest('POST', {
      playerId: 42,
      playerName: 'Mario Rossi'
      // subscription is missing
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('should reject missing playerId field', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerName: 'Mario Rossi'
      // playerId is missing
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('should reject missing playerName field', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42
      // playerName is missing
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('should reject invalid playerId (non-numeric)', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 'invalid-id', // Cannot be converted to number
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'playerId deve essere un numero'
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('should handle storage write errors gracefully', async () => {
    (put as any).mockRejectedValue(new Error('Storage error'));

    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'Mario Rossi'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Write error'
    });
  });

  it('should generate unique IDs for each subscription', async () => {
    const subscription1 = {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint1',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 1,
      playerName: 'Player 1'
    };

    const subscription2 = {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint2',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 2,
      playerName: 'Player 2'
    };

    const res1 = createMockResponse();
    const res2 = createMockResponse();

    await handler(createMockRequest('POST', subscription1), res1);
    await handler(createMockRequest('POST', subscription2), res2);

    // Verify put was called twice
    expect(put).toHaveBeenCalledTimes(2);

    // Get the keys from the two calls
    const call1Key = (put as any).mock.calls[0][0];
    const call2Key = (put as any).mock.calls[1][0];

    // Keys should be different
    expect(call1Key).not.toBe(call2Key);

    // Both should start with the correct prefix
    expect(call1Key).toMatch(/^biliardino-subs\//);
    expect(call2Key).toMatch(/^biliardino-subs\//);
  });

  it('should include createdAt timestamp in saved data', async () => {
    const beforeTime = new Date().toISOString();

    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'Mario Rossi'
    });
    const res = createMockResponse();

    await handler(req, res);

    const afterTime = new Date().toISOString();

    // Get the data that was passed to put
    const savedData = JSON.parse((put as any).mock.calls[0][1]);

    expect(savedData).toHaveProperty('createdAt');
    expect(savedData.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(savedData.createdAt >= beforeTime).toBe(true);
    expect(savedData.createdAt <= afterTime).toBe(true);
  });

  it('should handle empty request body', async () => {
    const req = createMockRequest('POST', {});
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
  });

  it('should handle null values in request body', async () => {
    const req = createMockRequest('POST', {
      subscription: null,
      playerId: null,
      playerName: null
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
  });

  it('should handle playerId of 0', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 0,
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    // playerId 0 is falsy and will be rejected by the validation
    // The API checks "if (!playerId)" which is true when playerId is 0
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing subscription, playerId or playerName'
    });
  });
});

describe('save-subscription API - GET requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all subscriptions', async () => {
    const mockBlobs = [
      {
        url: 'https://blob.vercel-storage.com/sub1.json',
        pathname: 'biliardino-subs/sub1.json'
      },
      {
        url: 'https://blob.vercel-storage.com/sub2.json',
        pathname: 'biliardino-subs/sub2.json'
      }
    ];

    const mockSubscription1 = {
      subscription: { endpoint: 'endpoint1', keys: {} },
      playerId: 1,
      playerName: 'Player 1',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    const mockSubscription2 = {
      subscription: { endpoint: 'endpoint2', keys: {} },
      playerId: 2,
      playerName: 'Player 2',
      createdAt: '2024-01-02T00:00:00.000Z'
    };

    (list as any).mockResolvedValue({ blobs: mockBlobs });

    // Mock global fetch
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve(mockSubscription1)
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve(mockSubscription2)
      });

    const req = createMockRequest('GET');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      subscriptions: [mockSubscription1, mockSubscription2]
    });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: 'biliardino-subs/'
      })
    );
  });

  it('should return empty array when no subscriptions exist', async () => {
    (list as any).mockResolvedValue({ blobs: [] });

    const req = createMockRequest('GET');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      subscriptions: []
    });
  });

  it('should handle storage read errors', async () => {
    (list as any).mockRejectedValue(new Error('Read error'));

    const req = createMockRequest('GET');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Read error'
    });
  });

  it('should handle fetch errors when retrieving blob content', async () => {
    const mockBlobs = [
      {
        url: 'https://blob.vercel-storage.com/sub1.json',
        pathname: 'biliardino-subs/sub1.json'
      }
    ];

    (list as any).mockResolvedValue({ blobs: mockBlobs });
    global.fetch = vi.fn().mockRejectedValue(new Error('Fetch error'));

    const req = createMockRequest('GET');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Read error'
    });
  });
});

describe('save-subscription API - Other HTTP methods', () => {
  it('should return 405 for PUT requests', async () => {
    const req = createMockRequest('PUT');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });

  it('should return 405 for DELETE requests', async () => {
    const req = createMockRequest('DELETE');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });

  it('should return 405 for PATCH requests', async () => {
    const req = createMockRequest('PATCH');
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('save-subscription API - Idempotency and edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (put as any).mockResolvedValue({
      url: 'https://blob.vercel-storage.com/mock-url'
    });
  });

  it('should allow multiple subscriptions for the same player', async () => {
    // This tests that a player can have subscriptions from multiple devices
    const subscription1 = {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/device1',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'Mario Rossi'
    };

    const subscription2 = {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/device2',
        keys: { p256dh: 'key3', auth: 'key4' }
      },
      playerId: 42, // Same player ID
      playerName: 'Mario Rossi'
    };

    const res1 = createMockResponse();
    const res2 = createMockResponse();

    await handler(createMockRequest('POST', subscription1), res1);
    await handler(createMockRequest('POST', subscription2), res2);

    expect(res1.status).toHaveBeenCalledWith(201);
    expect(res2.status).toHaveBeenCalledWith(201);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('should handle very long endpoints', async () => {
    const longEndpoint = 'https://fcm.googleapis.com/fcm/send/' + 'x'.repeat(500);

    const req = createMockRequest('POST', {
      subscription: {
        endpoint: longEndpoint,
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    // Verify the key generation handled the long endpoint
    const savedKey = (put as any).mock.calls[0][0];
    expect(savedKey).toMatch(/^biliardino-subs\//);
  });

  it('should handle special characters in playerName', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'O\'Connor-José Àlèx'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const savedData = JSON.parse((put as any).mock.calls[0][1]);
    expect(savedData.playerName).toBe('O\'Connor-José Àlèx');
  });

  it('should handle negative playerId', async () => {
    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: -1,
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    // Negative IDs are technically valid numbers
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: -1
      })
    );
  });

  it('should handle timeout scenarios during storage write', async () => {
    // Simulate a timeout by rejecting with a timeout error
    (put as any).mockRejectedValue(new Error('Request timeout'));

    const req = createMockRequest('POST', {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'key1', auth: 'key2' }
      },
      playerId: 42,
      playerName: 'Test Player'
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Write error'
    });
  });
});
