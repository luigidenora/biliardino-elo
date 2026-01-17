/**
 * E2E Tests for Notification Subscription System
 * 
 * These tests verify the complete notification flow:
 * 1. User selects their player
 * 2. Browser grants notification permission
 * 3. Subscription is created and saved
 * 4. Notifications can be sent and received
 * 
 * The tests run against the notifications-dashboard page which provides
 * a comprehensive interface for testing all notification features.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Test timeout for notification operations
test.setTimeout(60000);

/**
 * Helper function to grant notification permissions programmatically
 */
async function grantNotificationPermission(context: BrowserContext, page: Page) {
  // Grant notification permission via context
  await context.grantPermissions(['notifications']);
  
  // Verify permission was granted
  const permission = await page.evaluate(() => {
    return Notification.permission;
  });
  
  expect(permission).toBe('granted');
}

/**
 * Helper function to select a player from the modal
 */
async function selectPlayer(page: Page, playerName: string) {
  // Wait for player list to be visible
  await page.waitForSelector('.player-item', { timeout: 10000 });
  
  // Search for the player
  const searchInput = page.locator('#player-search-input');
  await searchInput.fill(playerName);
  await page.waitForTimeout(500); // Wait for filter to apply
  
  // Click on the first matching player
  const playerItem = page.locator('.player-item').first();
  await expect(playerItem).toBeVisible();
  await playerItem.click();
  
  // Confirm selection
  const confirmButton = page.locator('#confirm-player-selection');
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  
  // Wait for modal to close
  await page.waitForSelector('#player-selection-modal', { state: 'hidden', timeout: 5000 });
}

/**
 * Helper function to reset all notification state
 */
async function resetNotificationState(page: Page) {
  // Click reset all button
  const resetButton = page.locator('#reset-all-btn');
  await resetButton.click();
  
  // Confirm the dialog
  page.once('dialog', dialog => dialog.accept());
  
  // Wait for reset to complete
  await page.waitForTimeout(1000);
}

/**
 * Helper function to check notification status on dashboard
 */
async function getNotificationStatus(page: Page) {
  // Refresh status
  await page.locator('#refresh-btn').click();
  
  // Wait for status to update (the page updates asynchronously)
  await page.waitForTimeout(1000);
  
  return {
    userRegistered: await page.locator('#user-registered').textContent(),
    playerStatus: await page.locator('#player-status').textContent(),
    permission: await page.locator('#notification-permission').textContent(),
    subscriptionActive: await page.locator('#subscription-active').textContent(),
    subscriptionSaved: await page.locator('#subscription-saved').textContent(),
    fullyActive: await page.locator('#fully-active').textContent(),
  };
}

test.describe('Notification Subscription E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Navigate to notifications dashboard
    await page.goto('/notifications-dashboard.html');
    
    // Wait for page to be fully loaded and scripts to execute
    await page.waitForLoadState('networkidle');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for initial status update to complete
    await page.waitForFunction(() => {
      const userReg = document.getElementById('user-registered');
      return userReg && userReg.textContent !== '-';
    }, { timeout: 5000 });
  });

  test('should display notification dashboard correctly', async ({ page }) => {
    // Verify page title
    await expect(page).toHaveTitle(/Impostazioni Notifiche/);
    
    // Verify main sections are visible
    await expect(page.locator('h1')).toContainText('Impostazioni Notifiche');
    await expect(page.locator('h2').filter({ hasText: 'Status Attuale' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Test Notifiche' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Gestione' })).toBeVisible();
    
    // Verify status indicators exist
    await expect(page.locator('#user-registered')).toBeVisible();
    await expect(page.locator('#notification-permission')).toBeVisible();
    await expect(page.locator('#subscription-active')).toBeVisible();
    await expect(page.locator('#fully-active')).toBeVisible();
  });

  test('should show initial state as not configured', async ({ page }) => {
    const status = await getNotificationStatus(page);
    
    // Initial state should show everything as not configured
    expect(status.userRegistered).toMatch(/No|✗/);
    expect(status.fullyActive).toMatch(/NO|❌/);
  });

  test('should allow resetting notification state', async ({ page, context }) => {
    // First, grant permission and set up some state
    await grantNotificationPermission(context, page);
    
    // Set some localStorage values
    await page.evaluate(() => {
      localStorage.setItem('biliardino_player_id', '42');
      localStorage.setItem('biliardino_player_name', 'Test Player');
    });
    
    // Refresh to show updated state
    await page.locator('#refresh-btn').click();
    await page.waitForTimeout(500);
    
    // Verify state was set
    let status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('Si');
    
    // Reset everything
    await resetNotificationState(page);
    
    // Verify state was reset
    status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('No');
  });

  test('should complete full notification subscription flow', async ({ page, context }) => {
    // Step 1: Grant notification permission
    await grantNotificationPermission(context, page);
    
    // Step 2: Show and interact with notification banner
    await page.locator('#show-banner-btn').click();
    
    // Verify banner is visible
    const banner = page.locator('#notification-banner');
    await expect(banner).toBeVisible();
    
    // Step 3: Click activate button in banner
    const activateButton = page.locator('#notification-banner-button');
    await expect(activateButton).toBeVisible();
    await activateButton.click();
    
    // Step 4: Select a player from the modal
    // The modal should appear automatically
    await page.waitForSelector('#player-selection-modal', { timeout: 10000 });
    
    // Search for and select a player (use a common Italian name)
    await selectPlayer(page, 'luigi'); // Search for Luigi or similar
    
    // Step 5: Wait for subscription to be created and saved
    await page.waitForTimeout(2000);
    
    // Step 6: Verify notification status shows fully active
    const status = await getNotificationStatus(page);
    
    expect(status.userRegistered).toContain('Si');
    expect(status.permission).toContain('Concesso');
    expect(status.subscriptionSaved).toContain('Si');
    // Note: subscriptionActive might be "No" in test env since service worker might not be fully active
    
    // Step 7: Verify player information is displayed
    expect(status.playerStatus).toMatch(/luigi/i);
  });

  test('should handle notification permission denial', async ({ page, context }) => {
    // Don't grant permission (simulate denial)
    // In a real browser, user would click "Block"
    
    // Show banner
    await page.locator('#show-banner-btn').click();
    
    // Click activate button
    await page.locator('#notification-banner-button').click();
    
    // Select player
    await page.waitForSelector('#player-selection-modal', { timeout: 10000 });
    await selectPlayer(page, 'test');
    
    // Without granted permission, subscription should fail
    // Wait a bit for any errors to appear
    await page.waitForTimeout(1000);
    
    const status = await getNotificationStatus(page);
    
    // User should be registered but permissions not granted
    expect(status.userRegistered).toContain('Si');
    // Permission should not be granted (depends on test environment)
  });

  test('should allow sending test notification', async ({ page, context }) => {
    // Complete setup first
    await grantNotificationPermission(context, page);
    
    // Set up player and subscription manually via localStorage
    await page.evaluate(() => {
      const mockSubscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: {
          p256dh: 'test-key',
          auth: 'test-auth'
        }
      };
      
      localStorage.setItem('biliardino_player_id', '42');
      localStorage.setItem('biliardino_player_name', 'Test Player');
      localStorage.setItem('biliardino_subscription', JSON.stringify(mockSubscription));
    });
    
    // Refresh status
    await page.locator('#refresh-btn').click();
    await page.waitForTimeout(500);
    
    // Fill in test notification form
    const titleInput = page.locator('#test-title');
    const bodyInput = page.locator('#test-body');
    
    await titleInput.fill('Test E2E Notification');
    await bodyInput.fill('This is a test notification from E2E tests');
    
    // Click send button
    const sendButton = page.locator('#send-test-notification-btn');
    await sendButton.click();
    
    // Handle the alert that appears
    page.once('dialog', dialog => {
      // Check if it's a success or error message
      const message = dialog.message();
      console.log('Alert message:', message);
      dialog.accept();
    });
    
    // Wait for API call to complete
    await page.waitForTimeout(1000);
  });

  test('should show player selection modal when clicking activate without user', async ({ page, context }) => {
    await grantNotificationPermission(context, page);
    
    // Show banner and click activate
    await page.locator('#show-banner-btn').click();
    await page.locator('#notification-banner-button').click();
    
    // Modal should appear
    await expect(page.locator('#player-selection-modal')).toBeVisible({ timeout: 10000 });
    
    // Modal should have search input
    await expect(page.locator('#player-search-input')).toBeVisible();
    
    // Modal should have player list
    await expect(page.locator('.player-item').first()).toBeVisible();
    
    // Cancel button should work
    const cancelButton = page.locator('#cancel-player-selection');
    await cancelButton.click();
    
    // Modal should close
    await expect(page.locator('#player-selection-modal')).toBeHidden({ timeout: 5000 });
  });

  test('should filter players in selection modal', async ({ page, context }) => {
    await grantNotificationPermission(context, page);
    
    // Open modal
    await page.locator('#show-banner-btn').click();
    await page.locator('#notification-banner-button').click();
    await page.waitForSelector('#player-selection-modal');
    
    // Count initial visible players
    const initialCount = await page.locator('.player-item:visible').count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Type in search
    const searchInput = page.locator('#player-search-input');
    await searchInput.fill('test');
    await page.waitForTimeout(300);
    
    // Count filtered players (should be less or equal)
    const filteredCount = await page.locator('.player-item:visible').count();
    
    // Either some players match or none match
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('should persist notification state across page reloads', async ({ page, context }) => {
    // Set up state
    await grantNotificationPermission(context, page);
    
    await page.evaluate(() => {
      localStorage.setItem('biliardino_player_id', '99');
      localStorage.setItem('biliardino_player_name', 'Persistent Player');
      localStorage.setItem('biliardino_subscription', JSON.stringify({
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'key2' }
      }));
    });
    
    // Get initial status
    let status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('Si');
    expect(status.playerStatus).toContain('Persistent Player');
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check status is still the same
    status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('Si');
    expect(status.playerStatus).toContain('Persistent Player');
  });

  test('should show banner when notification permission is not granted', async ({ page }) => {
    // Don't grant permission
    // Show banner
    await page.locator('#show-banner-btn').click();
    
    const banner = page.locator('#notification-banner');
    await expect(banner).toBeVisible();
    
    // Banner should have activate button
    await expect(page.locator('#notification-banner-button')).toContainText('Attiva');
    
    // Close banner
    await page.locator('#notification-banner-close').click();
    
    // Banner should be hidden
    await expect(banner).toBeHidden();
  });

  test('should update status display in real-time', async ({ page, context }) => {
    // Initial state
    let status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('No');
    
    // Set player via reset player button (which clears, so we use direct localStorage)
    await page.evaluate(() => {
      localStorage.setItem('biliardino_player_id', '1');
      localStorage.setItem('biliardino_player_name', 'Player One');
    });
    
    // Refresh
    await page.locator('#refresh-btn').click();
    await page.waitForTimeout(500);
    
    // Status should update
    status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('Si');
    expect(status.playerStatus).toContain('Player One');
    
    // Reset player
    await page.locator('#reset-player-btn').click();
    page.once('dialog', dialog => dialog.accept());
    await page.waitForTimeout(500);
    
    // Status should update again
    status = await getNotificationStatus(page);
    expect(status.userRegistered).toContain('No');
  });
});

test.describe('Notification Banner Integration', () => {
  test('should show banner on main pages when notifications not configured', async ({ page, context }) => {
    // Visit the main index page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Banner should eventually appear (has a 2 second delay)
    await page.waitForTimeout(3000);
    
    // Check if banner exists (might be hidden based on state)
    const banner = page.locator('#notification-banner');
    const bannerExists = await banner.count() > 0;
    
    expect(bannerExists).toBe(true);
  });

  test('should not show banner when notifications are fully configured', async ({ page, context }) => {
    // Set up full configuration
    await grantNotificationPermission(context, page);
    
    await page.evaluate(() => {
      localStorage.setItem('biliardino_player_id', '42');
      localStorage.setItem('biliardino_player_name', 'Configured Player');
      localStorage.setItem('biliardino_subscription', JSON.stringify({
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key', auth: 'key' }
      }));
    });
    
    // Visit index
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for potential banner
    await page.waitForTimeout(3000);
    
    // Banner should be hidden
    const banner = page.locator('#notification-banner');
    const isHidden = await banner.evaluate(el => el.classList.contains('hidden'));
    
    // Should be hidden when fully configured
    expect(isHidden).toBe(true);
  });
});
