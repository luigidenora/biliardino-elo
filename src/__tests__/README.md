# Testing Documentation

This directory contains comprehensive tests for the subscription notification system.

## Test Structure

```
src/__tests__/
├── setup.ts                      # Global test setup and mocks
├── api/
│   └── save-subscription.test.ts # API endpoint tests
├── integration/
│   └── pwa-subscription.test.ts  # Integration tests for PWA flow
└── unit/
    ├── notification-banner.test.ts      # Banner logic tests
    └── notification-status.util.test.ts # Utility function tests
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (for development)
```bash
npm test
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage report
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- src/__tests__/api/save-subscription.test.ts
```

### Run specific test by name
```bash
npm test -- -t "should successfully save a valid subscription"
```

## Test Coverage

### API Tests (`api/save-subscription.test.ts`)

Tests for the `/api/save-subscription` endpoint covering:

**POST Requests:**
- ✅ Successfully saving valid subscriptions
- ✅ Converting string playerIds to numbers
- ✅ Rejecting missing required fields (subscription, playerId, playerName)
- ✅ Validating playerId is a valid number
- ✅ Handling storage write errors gracefully
- ✅ Generating unique IDs for each subscription
- ✅ Including createdAt timestamps
- ✅ Handling empty or null request bodies
- ✅ Edge cases (playerId of 0, negative IDs, special characters)

**GET Requests:**
- ✅ Returning all subscriptions
- ✅ Returning empty array when no subscriptions exist
- ✅ Handling storage read errors
- ✅ Handling fetch errors when retrieving blob content

**Other HTTP Methods:**
- ✅ Returning 405 for PUT, DELETE, PATCH requests

**Idempotency & Edge Cases:**
- ✅ Allowing multiple subscriptions for the same player (multi-device support)
- ✅ Handling very long endpoints
- ✅ Handling special characters in player names
- ✅ Handling timeout scenarios

### Unit Tests (`unit/notification-status.util.test.ts`)

Tests for notification status utility functions:

**areNotificationsActive():**
- ✅ Returns true when all conditions are met
- ✅ Returns false when any condition is missing
- ✅ Validates permission, playerId, and subscription checks

**getRegisteredPlayerId() / getRegisteredPlayerName():**
- ✅ Returns stored values correctly
- ✅ Returns null when values are not stored
- ✅ Handles edge cases (zero, negative IDs, special characters)

**getSavedSubscription():**
- ✅ Returns parsed subscription object
- ✅ Returns null for invalid JSON
- ✅ Handles complex subscription objects

**isUserRegistered():**
- ✅ Checks both playerId and playerName are present
- ✅ Returns false if either is missing

**hasActiveSubscription():**
- ✅ Checks for active subscription in browser
- ✅ Handles missing serviceWorker support
- ✅ Handles errors gracefully

**getNotificationStatus():**
- ✅ Returns complete status object with all information
- ✅ Handles all combinations of configured/unconfigured states

### Unit Tests (`unit/notification-banner.test.ts`)

Tests for notification banner display logic:

**getBannerState():**
- ✅ Returns "hidden" when fully configured
- ✅ Returns "denied" when permission is denied
- ✅ Returns "enable-notifications" for various incomplete states
- ✅ Respects user dismissal preferences

**User Flow Scenarios:**
- ✅ New user visits site
- ✅ User dismisses banner
- ✅ User grants permission but doesn't complete setup
- ✅ User completes full flow successfully
- ✅ User denies permission
- ✅ User clears localStorage
- ✅ 10+ different real-world scenarios

### Integration Tests (`integration/pwa-subscription.test.ts`)

Tests for the complete PWA subscription flow:

**ensurePlayerSelected():**
- ✅ Returns true when player already selected
- ✅ Shows modal and stores selection
- ✅ Handles missing playerId or playerName

**subscribeToPushNotifications():**
- ✅ Successfully subscribes with valid player info
- ✅ Throws errors when playerId or playerName missing
- ✅ Handles notification permission denial
- ✅ Creates new subscription when none exists
- ✅ Reuses existing subscription
- ✅ Handles subscription creation errors
- ✅ Handles API save errors
- ✅ Handles network errors and timeouts
- ✅ Saves to localStorage only after successful API call
- ✅ Sends correct data to API

**Edge Cases:**
- ✅ Very long player names
- ✅ Special characters in player names
- ✅ Zero as valid playerId
- ✅ Concurrent subscription attempts

## Test Environment

- **Test Runner:** Vitest
- **DOM Environment:** happy-dom
- **Mocking:** Built-in Vitest mocking (`vi`)
- **Coverage:** V8 provider

## Mocked APIs

The test setup (`setup.ts`) provides mocks for:

1. **localStorage** - In-memory storage with standard API
2. **Notification API** - Mock permission states and constructor
3. **ServiceWorker API** - Mock registration and push manager
4. **Vercel Blob** - Mocked in API tests (`@vercel/blob`)
5. **fetch API** - Mocked in integration tests

## Writing New Tests

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Feature name', () => {
  beforeEach(() => {
    // Reset state before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = functionToTest(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Best Practices

1. **Isolation:** Each test should be independent and not rely on other tests
2. **Clear Names:** Test names should describe what they test and expected behavior
3. **AAA Pattern:** Arrange, Act, Assert - structure tests clearly
4. **Reset State:** Always clear localStorage and mocks in `beforeEach`
5. **Edge Cases:** Test boundary conditions, null values, empty strings, etc.
6. **Error Cases:** Test both success and failure paths
7. **Real Scenarios:** Include tests that reflect actual user workflows

## Continuous Integration

These tests are designed to run in CI environments. They:

- Run in headless mode
- Don't require browser automation
- Complete quickly (< 2 seconds total)
- Provide clear error messages
- Generate coverage reports

## Debugging Tests

### Run tests in watch mode with verbose output
```bash
npm test -- --watch --reporter=verbose
```

### Debug a specific test
```bash
npm test -- -t "test name" --reporter=verbose
```

### Check coverage for specific file
```bash
npm run test:coverage -- src/utils/notification-status.util.ts
```

## Maintenance

- **When adding new features:** Add corresponding tests
- **When fixing bugs:** Add a test that would have caught the bug
- **When refactoring:** Ensure all tests still pass
- **Keep tests updated:** Update tests when behavior changes

## Test Statistics

- **Total Tests:** 119
- **Test Files:** 4
- **Coverage:** API endpoints, utilities, and integration flows
- **Execution Time:** ~1.3 seconds

## Future Improvements

Potential areas for test expansion:

- [ ] E2E tests with Playwright for browser-specific behavior
- [ ] Performance tests for large subscription lists
- [ ] Accessibility tests for notification banner
- [ ] Visual regression tests for UI components
- [ ] Load tests for API endpoints
