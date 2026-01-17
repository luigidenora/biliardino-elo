/**
 * Global test setup for Vitest
 * This file is loaded before all tests run
 */

import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock Notification API
Object.defineProperty(window, 'Notification', {
  writable: true,
  value: class Notification {
    static permission: NotificationPermission = 'default';
    static requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));

    constructor(public title: string, public options?: NotificationOptions) {}
  }
});

// Mock ServiceWorker
Object.defineProperty(navigator, 'serviceWorker', {
  writable: true,
  value: {
    register: vi.fn(() => Promise.resolve({
      scope: '/',
      active: {},
      installing: null,
      waiting: null
    })),
    ready: Promise.resolve({
      pushManager: {
        subscribe: vi.fn(() => Promise.resolve({
          endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint',
          keys: {
            p256dh: 'mock-p256dh-key',
            auth: 'mock-auth-key'
          },
          toJSON: () => ({
            endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint',
            keys: {
              p256dh: 'mock-p256dh-key',
              auth: 'mock-auth-key'
            }
          })
        })),
        getSubscription: vi.fn(() => Promise.resolve(null))
      }
    })
  }
});

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
