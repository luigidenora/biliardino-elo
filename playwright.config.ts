import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * 
 * These tests verify the complete notification subscription flow including:
 * - Browser notification permission handling
 * - User player selection
 * - Subscription creation and storage
 * - Notification delivery
 */
export default defineConfig({
  testDir: './e2e',
  
  // Test execution settings
  fullyParallel: false, // Run tests sequentially to avoid state conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to ensure clean state between tests
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  // Global test settings
  use: {
    // Base URL for testing
    baseURL: 'http://localhost:5173',
    
    // Collect trace for debugging
    trace: 'on-first-retry',
    
    // Screenshot settings
    screenshot: 'only-on-failure',
    
    // Video settings
    video: 'retain-on-failure',
    
    // Longer timeout for notification tests
    actionTimeout: 10000,
  },

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  // Test projects for different scenarios
  projects: [
    {
      name: 'chromium-notifications',
      use: { 
        ...devices['Desktop Chrome'],
        // Grant notification permissions by default for testing
        permissions: ['notifications'],
        // Use context options to enable notifications
        contextOptions: {
          permissions: ['notifications'],
        },
      },
    },
  ],
});
