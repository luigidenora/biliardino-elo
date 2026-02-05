# Vitest Configuration Guide

## Setup Complete ✅

Vitest has been successfully installed and configured for the `biliardino-elo` project.

### Installed Packages
- **vitest** ^4.0.0 - Testing framework
- **@vitest/ui** - Visual test UI dashboard
- **happy-dom** - Lightweight DOM implementation for tests

### NPM Scripts Added
```json
"test": "vitest",        // Run tests in watch mode
"test:ui": "vitest --ui" // Run tests with visual UI
```

### Test Files Created

#### 1. **tests/api/send-broadcast.test.js**
Tests for the send-broadcast API endpoint:
- ✅ Validates API_TOKEN requirement
- ✅ Checks endpoint format
- ✅ Verifies POST request structure
- ✅ Tests Authorization header format
- ✅ Validates request rejection without token
- ✅ Tests matchTime formatting

#### 2. **tests/api/integration.test.js**
Integration tests for API behavior:
- ✅ Request structure validation
- ✅ HTTP status code parsing
- ✅ JSON response handling
- ✅ Error handling and retry logic
- 7 tests total

#### 3. **tests/services/utilities.test.js**
Service utility function tests:
- ✅ Header creation for API requests
- ✅ Timestamp formatting
- ✅ Response validation
- ✅ Request building
- 4 tests total

### Test Results
```
Test Files: 4 passed (4)
Tests:      30 passed (30)
```

### Running Tests

**Watch mode (auto-rerun on file changes):**
```bash
npm test
```

**With visual UI dashboard:**
```bash
npm test:ui
```

**Single run (for CI/CD):**
```bash
npm test -- --run
```

**Run specific test file:**
```bash
npm test tests/api/send-broadcast.test.js
```

**Run tests matching a pattern:**
```bash
npm test -- --grep "send-broadcast"
```

### Configuration

Vitest is configured in [vite.config.ts](vite.config.ts) with:
- Environment: `happy-dom` (lightweight DOM)
- Globals: enabled (no need for `import { describe, it, expect }`)

### Next Steps

To test actual API endpoints, you can:
1. Run the integration test script: `node test-broadcast.js`
2. Add `.env.local` with `API_TOKEN=your_token`
3. Add more tests for specific API endpoints as needed

### Example Test Structure

```javascript
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

All test utilities (describe, it, expect, etc.) are available globally due to Vitest's globals setting.
