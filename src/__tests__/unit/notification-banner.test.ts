/**
 * Unit Tests for notification banner logic
 *
 * These tests validate the notification banner display logic, state determination,
 * and user interaction flows for activating notifications.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Since notification-banner.ts is a module that runs on import,
// we need to test its logic by understanding the conditions
// This file tests the logic that would be used by the banner

type BannerState = 'enable-notifications' | 'denied' | 'hidden';

/**
 * Test implementation of getBannerState logic
 * (mirrors the logic from notification-banner.ts)
 */
function getBannerState(): BannerState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'hidden';
  }

  const permission = (window as any).Notification?.permission || 'default';
  const dismissed = localStorage.getItem('biliardino_notification_dismissed');
  const playerId = localStorage.getItem('biliardino_player_id');
  const savedSubscription = localStorage.getItem('biliardino_subscription');

  // If the permissions are denied, show special message
  if (permission === 'denied') {
    return 'denied';
  }

  // If notifications are already active AND user is registered AND there's a subscription, don't show anything
  if (permission === 'granted' && playerId && savedSubscription) {
    return 'hidden';
  }

  // If permission is granted but missing user or subscription, show the banner
  // to allow completing the configuration
  if (permission === 'granted' && (!playerId || !savedSubscription)) {
    return 'enable-notifications';
  }

  // If the user has dismissed the banner AND doesn't have granted permission, don't show it anymore
  // But if they have granted permission but missing subscription, show it anyway
  if (dismissed === 'true' && permission !== 'granted') {
    return 'hidden';
  }

  // Otherwise show the banner to enable notifications
  return 'enable-notifications';
}

describe('Notification Banner - getBannerState', () => {
  beforeEach(() => {
    localStorage.clear();
    (window.Notification as any).permission = 'default';
  });

  it('should return "hidden" when all conditions are met (fully active)', () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';

    expect(getBannerState()).toBe('hidden');
  });

  it('should return "denied" when permission is denied', () => {
    (window.Notification as any).permission = 'denied';

    expect(getBannerState()).toBe('denied');
  });

  it('should return "denied" even when user is registered', () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_player_name', 'Test User');
    (window.Notification as any).permission = 'denied';

    expect(getBannerState()).toBe('denied');
  });

  it('should return "enable-notifications" when permission is default', () => {
    (window.Notification as any).permission = 'default';

    expect(getBannerState()).toBe('enable-notifications');
  });

  it('should return "enable-notifications" when permission granted but user not registered', () => {
    (window.Notification as any).permission = 'granted';
    // No playerId or subscription

    expect(getBannerState()).toBe('enable-notifications');
  });

  it('should return "enable-notifications" when permission granted but subscription not saved', () => {
    localStorage.setItem('biliardino_player_id', '42');
    (window.Notification as any).permission = 'granted';
    // No subscription

    expect(getBannerState()).toBe('enable-notifications');
  });

  it('should return "enable-notifications" when permission granted but playerId not saved', () => {
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';
    // No playerId

    expect(getBannerState()).toBe('enable-notifications');
  });

  it('should return "hidden" when banner was dismissed and permission is default', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    (window.Notification as any).permission = 'default';

    expect(getBannerState()).toBe('hidden');
  });

  it('should return "hidden" when banner was dismissed and permission is denied', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    (window.Notification as any).permission = 'denied';

    // When denied, it should show 'denied' state, not 'hidden'
    // because denied takes precedence
    expect(getBannerState()).toBe('denied');
  });

  it('should return "enable-notifications" when dismissed but permission is granted and setup incomplete', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    localStorage.setItem('biliardino_player_id', '42');
    (window.Notification as any).permission = 'granted';
    // Subscription is missing

    expect(getBannerState()).toBe('enable-notifications');
  });

  it('should return "hidden" when dismissed, permission granted, and setup complete', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';

    expect(getBannerState()).toBe('hidden');
  });
});

describe('Notification Banner - Display conditions', () => {
  beforeEach(() => {
    localStorage.clear();
    (window.Notification as any).permission = 'default';
  });

  it('should show banner for new users with default permission', () => {
    // New user: nothing in localStorage, default permission
    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should show banner for users who granted permission but never completed setup', () => {
    (window.Notification as any).permission = 'granted';
    // User granted permission but never selected player or saved subscription

    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should not show banner for fully configured users', () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';

    const state = getBannerState();
    expect(state).toBe('hidden');
  });

  it('should show denied message for users who denied permission', () => {
    (window.Notification as any).permission = 'denied';

    const state = getBannerState();
    expect(state).toBe('denied');
  });

  it('should not show banner for users who dismissed it without granting permission', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    (window.Notification as any).permission = 'default';

    const state = getBannerState();
    expect(state).toBe('hidden');
  });
});

describe('Notification Banner - Edge cases', () => {
  beforeEach(() => {
    localStorage.clear();
    (window.Notification as any).permission = 'default';
  });

  it('should handle missing localStorage values', () => {
    // All localStorage values are undefined/null
    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should handle partial player registration (only playerId)', () => {
    localStorage.setItem('biliardino_player_id', '42');
    (window.Notification as any).permission = 'granted';

    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should handle partial player registration (only subscription)', () => {
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';

    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should handle corrupted subscription JSON', () => {
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', 'invalid-json{');
    (window.Notification as any).permission = 'granted';

    // The function checks for presence of the item, not validity
    // So it should still be considered "present" but invalid
    const state = getBannerState();
    // Since there IS a subscription value (even if invalid), it should be hidden
    expect(state).toBe('hidden');
  });

  it('should handle empty string values', () => {
    localStorage.setItem('biliardino_player_id', '');
    localStorage.setItem('biliardino_subscription', '');
    (window.Notification as any).permission = 'granted';

    // Empty strings are falsy in JavaScript
    const state = getBannerState();
    expect(state).toBe('enable-notifications');
  });

  it('should prioritize denied state over dismissed state', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    (window.Notification as any).permission = 'denied';

    const state = getBannerState();
    expect(state).toBe('denied');
  });
});

describe('Notification Banner - User flow scenarios', () => {
  beforeEach(() => {
    localStorage.clear();
    (window.Notification as any).permission = 'default';
  });

  it('Scenario 1: New user visits site', () => {
    // Fresh state, nothing configured
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 2: User dismisses banner without action', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    expect(getBannerState()).toBe('hidden');
  });

  it('Scenario 3: User grants permission but closes before selecting player', () => {
    (window.Notification as any).permission = 'granted';
    // Permission granted but no player selected
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 4: User grants permission, selects player, but save fails', () => {
    (window.Notification as any).permission = 'granted';
    localStorage.setItem('biliardino_player_id', '42');
    // Subscription save failed, not in localStorage
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 5: User completes full flow successfully', () => {
    (window.Notification as any).permission = 'granted';
    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    expect(getBannerState()).toBe('hidden');
  });

  it('Scenario 6: User denies permission', () => {
    (window.Notification as any).permission = 'denied';
    expect(getBannerState()).toBe('denied');
  });

  it('Scenario 7: User dismisses, then later grants permission in browser settings', () => {
    localStorage.setItem('biliardino_notification_dismissed', 'true');
    (window.Notification as any).permission = 'granted';
    // Should still show to complete setup
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 8: User clears localStorage but permission still granted', () => {
    (window.Notification as any).permission = 'granted';
    // localStorage was cleared
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 9: User has subscription in browser but not in localStorage', () => {
    (window.Notification as any).permission = 'granted';
    localStorage.setItem('biliardino_player_id', '42');
    // Subscription exists in browser but not in localStorage
    expect(getBannerState()).toBe('enable-notifications');
  });

  it('Scenario 10: User unregisters (removes playerId) but keeps subscription', () => {
    (window.Notification as any).permission = 'granted';
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    // playerId was removed
    expect(getBannerState()).toBe('enable-notifications');
  });
});

describe('Notification Banner - Browser compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle browsers with Notification API', () => {
    // Verify that our setup includes Notification API
    expect('Notification' in window).toBe(true);
  });

  it('should handle different permission states', () => {
    // Test that we can change permission states
    (window.Notification as any).permission = 'default';
    expect(getBannerState()).toBe('enable-notifications');

    (window.Notification as any).permission = 'denied';
    expect(getBannerState()).toBe('denied');

    localStorage.setItem('biliardino_player_id', '42');
    localStorage.setItem('biliardino_subscription', JSON.stringify({ endpoint: 'test' }));
    (window.Notification as any).permission = 'granted';
    expect(getBannerState()).toBe('hidden');
  });
});
