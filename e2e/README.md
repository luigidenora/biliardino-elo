# E2E Testing Documentation

## Overview

This directory contains end-to-end (E2E) tests for the notification subscription system using **Playwright**. These tests verify the complete user flow from granting permissions to receiving notifications.

## Test Coverage

The E2E tests validate:

### Core Notification Flow
- ✅ **Permission Handling**: Browser notification permission requests
- ✅ **User Selection**: Player selection modal interaction
- ✅ **Subscription Creation**: Push subscription setup and storage
- ✅ **Notification Delivery**: Test notification sending
- ✅ **State Persistence**: localStorage and session management

### UI Components
- ✅ **Notification Dashboard**: All dashboard features and controls
- ✅ **Notification Banner**: Banner display logic and interactions
- ✅ **Player Selection Modal**: Search, filter, and selection
- ✅ **Status Display**: Real-time status updates

### User Scenarios
- ✅ **New User Flow**: Complete onboarding from scratch
- ✅ **Permission Denial**: Handling blocked notifications
- ✅ **State Reset**: Clearing and reconfiguring notifications
- ✅ **Page Reload**: State persistence across sessions
- ✅ **Filter Players**: Search functionality in modal

## Running E2E Tests

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers (if not already installed):
```bash
npx playwright install chromium
```

### Test Commands

**Run all E2E tests (headless)**
```bash
npm run test:e2e
```

**Run tests with UI mode (interactive)**
```bash
npm run test:e2e:ui
```

**Run tests in headed mode (see browser)**
```bash
npm run test:e2e:headed
```

**Debug tests step-by-step**
```bash
npm run test:e2e:debug
```

**Run specific test file**
```bash
npx playwright test e2e/notifications.spec.ts
```

**Run specific test by name**
```bash
npx playwright test -g "should complete full notification subscription flow"
```

## Test Structure

### Main Test File

**`e2e/notifications.spec.ts`** - Complete notification system tests

Test suites:
1. **Notification Subscription E2E Tests** - Core functionality
   - Dashboard display
   - Initial state verification
   - State reset functionality
   - Full subscription flow
   - Permission handling
   - Test notification sending
   - Player selection
   - State persistence

2. **Notification Banner Integration** - Banner behavior
   - Banner display on main pages
   - Banner hiding when configured

### Helper Functions

The test file includes several helper functions:

```typescript
// Grant notification permissions
await grantNotificationPermission(context, page);

// Select a player from the modal
await selectPlayer(page, 'playerName');

// Reset all notification state
await resetNotificationState(page);

// Get current notification status
const status = await getNotificationStatus(page);
```

## Configuration

### Playwright Config (`playwright.config.ts`)

Key settings:
- **Base URL**: `http://localhost:5173` (Vite dev server)
- **Test Timeout**: 60 seconds (for notification operations)
- **Workers**: 1 (sequential execution to avoid state conflicts)
- **Browser**: Chromium with notification permissions pre-granted
- **Retries**: 2 retries in CI, 0 locally
- **Web Server**: Auto-starts Vite dev server before tests

### Notification Permissions

Tests run with notification permissions pre-granted via Playwright context:

```typescript
use: {
  permissions: ['notifications'],
  contextOptions: {
    permissions: ['notifications'],
  },
}
```

This simulates a user accepting the browser's notification permission prompt.

## Test Scenarios

### Scenario 1: Complete Subscription Flow

```typescript
test('should complete full notification subscription flow', async ({ page, context }) => {
  // 1. Grant permission
  await grantNotificationPermission(context, page);
  
  // 2. Show banner
  await page.locator('#show-banner-btn').click();
  
  // 3. Activate notifications
  await page.locator('#notification-banner-button').click();
  
  // 4. Select player
  await selectPlayer(page, 'luigi');
  
  // 5. Verify status
  const status = await getNotificationStatus(page);
  expect(status.fullyActive).toContain('SI');
});
```

### Scenario 2: Test Notification Sending

```typescript
test('should allow sending test notification', async ({ page, context }) => {
  // Set up subscription
  await setupNotifications(page, context);
  
  // Fill notification form
  await page.locator('#test-title').fill('Test Title');
  await page.locator('#test-body').fill('Test Message');
  
  // Send notification
  await page.locator('#send-test-notification-btn').click();
  
  // Verify success/error message
});
```

### Scenario 3: State Persistence

```typescript
test('should persist state across page reloads', async ({ page, context }) => {
  // Set up state
  await setupNotifications(page, context);
  
  // Verify initial state
  let status = await getNotificationStatus(page);
  expect(status.userRegistered).toContain('Si');
  
  // Reload page
  await page.reload();
  
  // Verify state persisted
  status = await getNotificationStatus(page);
  expect(status.userRegistered).toContain('Si');
});
```

## Debugging

### View Test Traces

When a test fails, Playwright automatically captures:
- Screenshots
- Videos (on failure)
- Traces (on retry)

View test report:
```bash
npx playwright show-report
```

### Debug Mode

Run tests in debug mode to step through:
```bash
npm run test:e2e:debug
```

This opens Playwright Inspector where you can:
- Step through test code
- Inspect page elements
- View console logs
- Examine network requests

### Console Logs

View browser console logs in test output:
```typescript
page.on('console', msg => console.log('Browser:', msg.text()));
```

### Screenshots

Take manual screenshots during tests:
```typescript
await page.screenshot({ path: 'screenshot.png' });
```

## CI/CD Integration

The tests are configured to run in CI environments:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e
```

## Limitations and Known Issues

### Service Worker Testing

- Service workers may not be fully active in test environments
- Some tests mock subscription data directly via localStorage
- Real push notifications require valid VAPID keys and endpoints

### Permission Handling

- Tests pre-grant notification permissions
- Cannot test actual browser permission prompts
- Permission denial scenarios are simulated

### Network Requests

- API calls to `/api/test-notification` may fail without backend
- Tests focus on frontend behavior and state management

## Best Practices

1. **Clean State**: Each test starts with a clean state
2. **Isolated Tests**: Tests don't depend on each other
3. **Explicit Waits**: Use `waitForSelector` instead of arbitrary timeouts
4. **Descriptive Names**: Test names clearly describe what they verify
5. **Helper Functions**: Reuse common operations via helpers
6. **Error Handling**: Tests handle dialogs and alerts appropriately

## Troubleshooting

### Tests Timeout

If tests timeout:
1. Check dev server is running
2. Increase timeout in config
3. Check for slow network requests
4. Verify selectors are correct

### Permission Issues

If permission tests fail:
1. Verify Playwright context has `permissions: ['notifications']`
2. Check browser supports notification API
3. Ensure no browser policy blocks notifications

### Modal Not Appearing

If player selection modal doesn't show:
1. Check player data is loaded
2. Verify banner activation flow
3. Check for JavaScript errors in console

### State Not Persisting

If localStorage doesn't persist:
1. Verify same context/page instance
2. Check for page navigation
3. Ensure localStorage is supported

## Future Enhancements

Potential improvements:
- [ ] Test actual push notification delivery with mock server
- [ ] Test different browsers (Firefox, Safari)
- [ ] Test mobile viewport scenarios
- [ ] Add visual regression testing
- [ ] Test offline/online transitions
- [ ] Add performance metrics

## Related Documentation

- [Playwright Documentation](https://playwright.dev)
- [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- Main test suite: `src/__tests__/README.md`
- Project documentation: `NOTIFICATIONS.md`
