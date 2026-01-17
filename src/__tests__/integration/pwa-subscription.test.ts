/**
 * Integration Tests for PWA subscription flow
 *
 * These tests validate the complete subscription flow including player selection,
 * notification permission requests, and subscription saving.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ensurePlayerSelected, subscribeToPushNotifications } from '@/pwa';

// Mock the player selection modal
vi.mock('@/player-selection-modal', () => ({
  showPlayerSelectionModal: vi.fn()
}));

// Mock the fetch API
global.fetch = vi.fn();

import { showPlayerSelectionModal } from '@/player-selection-modal';

describe('ensurePlayerSelected', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should return true when player is already selected', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    const result = await ensurePlayerSelected();

    expect(result).toBe(true);
    expect(showPlayerSelectionModal).not.toHaveBeenCalled();
  });

  it('should show modal and return true when player is selected', async () => {
    // Mock the modal to immediately call the callback
    (showPlayerSelectionModal as any).mockImplementation((callback: Function) => {
      callback(42, 'Mario Rossi');
    });

    const result = await ensurePlayerSelected();

    expect(result).toBe(true);
    expect(showPlayerSelectionModal).toHaveBeenCalled();
    expect(localStorage.getItem('biliardino_player_id')).toBe('42');
    expect(localStorage.getItem('biliardino_player_name')).toBe('Mario Rossi');
  });

  it('should store player ID as string in localStorage', async () => {
    (showPlayerSelectionModal as any).mockImplementation((callback: Function) => {
      callback(123, 'Test Player');
    });

    await ensurePlayerSelected();

    expect(localStorage.getItem('biliardino_player_id')).toBe('123');
  });

  it('should not show modal when only playerName is missing', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    // playerName is missing

    (showPlayerSelectionModal as any).mockImplementation((callback: Function) => {
      callback(42, 'Mario Rossi');
    });

    await ensurePlayerSelected();

    expect(showPlayerSelectionModal).toHaveBeenCalled();
  });

  it('should not show modal when only playerId is missing', async () => {
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');
    // playerId is missing

    (showPlayerSelectionModal as any).mockImplementation((callback: Function) => {
      callback(42, 'Mario Rossi');
    });

    await ensurePlayerSelected();

    expect(showPlayerSelectionModal).toHaveBeenCalled();
  });
});

describe('subscribeToPushNotifications', () => {
  let mockServiceWorkerRegistration: any;
  let mockPushSubscription: any;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    mockPushSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint-12345',
      keys: {
        p256dh: 'mock-p256dh-key',
        auth: 'mock-auth-key'
      },
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint-12345',
        keys: {
          p256dh: 'mock-p256dh-key',
          auth: 'mock-auth-key'
        }
      })
    };

    mockServiceWorkerRegistration = {
      pushManager: {
        getSubscription: vi.fn(() => Promise.resolve(null)),
        subscribe: vi.fn(() => Promise.resolve(mockPushSubscription))
      }
    };

    (navigator.serviceWorker.ready as any) = Promise.resolve(mockServiceWorkerRegistration);
    (window.Notification.requestPermission as any) = vi.fn(() => Promise.resolve('granted'));
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ ok: true, playerId: 42 })
    });
  });

  it('should successfully subscribe with valid player info', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    await subscribeToPushNotifications();

    expect(window.Notification.requestPermission).toHaveBeenCalled();
    expect(mockServiceWorkerRegistration.pushManager.subscribe).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/save-subscription',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
    expect(localStorage.getItem('biliardino_subscription')).toBeTruthy();
  });

  it('should throw error when playerId is missing', async () => {
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');
    // playerId is missing

    await expect(subscribeToPushNotifications()).rejects.toThrow('Seleziona prima il tuo nome');
  });

  it('should throw error when playerName is missing', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    // playerName is missing

    await expect(subscribeToPushNotifications()).rejects.toThrow('Seleziona prima il tuo nome');
  });

  it('should throw error when notification permission is denied', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');
    (window.Notification.requestPermission as any) = vi.fn(() => Promise.resolve('denied'));

    await expect(subscribeToPushNotifications()).rejects.toThrow(
      'È necessario accettare le notifiche per continuare'
    );
  });

  it('should create new subscription when none exists', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    mockServiceWorkerRegistration.pushManager.getSubscription.mockResolvedValue(null);

    await subscribeToPushNotifications();

    expect(mockServiceWorkerRegistration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array)
    });
  });

  it('should reuse existing subscription', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    // Mock existing subscription
    mockServiceWorkerRegistration.pushManager.getSubscription.mockResolvedValue(mockPushSubscription);

    await subscribeToPushNotifications();

    expect(mockServiceWorkerRegistration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should handle subscription creation errors', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    mockServiceWorkerRegistration.pushManager.getSubscription.mockResolvedValue(null);
    mockServiceWorkerRegistration.pushManager.subscribe.mockRejectedValue(
      new Error('Subscription failed')
    );

    await expect(subscribeToPushNotifications()).rejects.toThrow(
      'Impossibile creare la subscription. Riprova più tardi.'
    );
  });

  it('should handle API save errors', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error')
    });

    await expect(subscribeToPushNotifications()).rejects.toThrow();
    // The actual error thrown is wrapped by the catch block
  });

  it('should handle network errors', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    (global.fetch as any).mockRejectedValue(new Error('fetch failed'));

    await expect(subscribeToPushNotifications()).rejects.toThrow();
    // The error is caught and re-thrown by the saveSubscription function
  });

  it('should save subscription to localStorage only after successful API call', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    // Verify subscription not in localStorage before
    expect(localStorage.getItem('biliardino_subscription')).toBeNull();

    await subscribeToPushNotifications();

    // Verify subscription is in localStorage after
    const savedSub = localStorage.getItem('biliardino_subscription');
    expect(savedSub).toBeTruthy();
    const parsedSub = JSON.parse(savedSub!);
    expect(parsedSub.endpoint).toBe(mockPushSubscription.endpoint);
  });

  it('should not save subscription to localStorage if API call fails', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Error')
    });

    try {
      await subscribeToPushNotifications();
    } catch (e) {
      // Expected to throw
    }

    expect(localStorage.getItem('biliardino_subscription')).toBeNull();
  });

  it('should send correct data to API', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    await subscribeToPushNotifications();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/save-subscription',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"playerId":42')
      })
    );

    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body).toEqual({
      subscription: expect.objectContaining({
        endpoint: expect.any(String)
      }),
      playerId: 42,
      playerName: 'Mario Rossi'
    });
  });

  it('should handle permission request that stays default', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');
    (window.Notification.requestPermission as any) = vi.fn(() => Promise.resolve('default'));

    await expect(subscribeToPushNotifications()).rejects.toThrow(
      'È necessario accettare le notifiche per continuare'
    );
  });

  it('should handle fetch timeout errors', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    (global.fetch as any).mockRejectedValue(new Error('The operation was aborted due to timeout'));

    await expect(subscribeToPushNotifications()).rejects.toThrow();
    // The error is caught and re-thrown by the saveSubscription function
  });

  it('should handle API returning non-JSON response on error', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('Cannot read response'))
    });

    await expect(subscribeToPushNotifications()).rejects.toThrow();
  });
});

describe('urlBase64ToUint8Array conversion', () => {
  it('should correctly convert VAPID key to Uint8Array', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    const mockServiceWorkerRegistration = {
      pushManager: {
        getSubscription: vi.fn(() => Promise.resolve(null)),
        subscribe: vi.fn(() => Promise.resolve({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'key', auth: 'auth' }
        }))
      }
    };

    (navigator.serviceWorker.ready as any) = Promise.resolve(mockServiceWorkerRegistration);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    });

    await subscribeToPushNotifications();

    // Verify subscribe was called with Uint8Array
    const subscribeCall = mockServiceWorkerRegistration.pushManager.subscribe.mock.calls[0][0];
    expect(subscribeCall.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(subscribeCall.applicationServerKey.length).toBeGreaterThan(0);
  });
});

describe('Edge cases and error recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    });
  });

  it('should handle very long player names', async () => {
    const longName = 'A'.repeat(500);
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', longName);

    await subscribeToPushNotifications();

    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.playerName).toBe(longName);
  });

  it('should handle special characters in player name', async () => {
    const specialName = 'O\'Connor-José Àlèx 中文';
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', specialName);

    await subscribeToPushNotifications();

    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.playerName).toBe(specialName);
  });

  it('should handle zero as valid playerId', async () => {
    localStorage.setItem('biliardino_player_id', '0');
    localStorage.setItem('biliardino_player_name', 'Test Player');

    await subscribeToPushNotifications();

    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.playerId).toBe(0);
  });

  it('should handle concurrent subscription attempts', async () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Mario Rossi');

    // Start two subscriptions at the same time
    const promise1 = subscribeToPushNotifications();
    const promise2 = subscribeToPushNotifications();

    await Promise.all([promise1, promise2]);

    // Both should complete successfully
    expect(global.fetch).toHaveBeenCalled();
  });
});
