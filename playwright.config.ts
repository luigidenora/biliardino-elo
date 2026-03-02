import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });
/**
 * Playwright e2e configuration.
 *
 * La suite avvia il dev server con __DEV_MODE__=true così il repository
 * usa dati mock in memoria. Auth e admin funzionano normalmente.
 * Le chiamate API vengono intercettate dal test stesso via page.route().
 */
export default defineConfig({
  testDir: './e2e',

  /** Timeout per singolo test */
  timeout: 30_000,

  /** Timeout per singola asserzione expect() */
  expect: { timeout: 10_000 },

  /** I test della lobby girano in sequenza (un solo browser context alla volta) */
  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,

  /** Reporter compatto in console + HTML opzionale */
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  use: {
    /** URL base del dev server */
    baseURL: 'http://localhost:3000',

    /** Cattura trace solo al primo retry per debug */
    trace: 'on-first-retry',

    /** Headless di default; imposta PWDEBUG=1 per UI interattiva */
    headless: !process.env.PWDEBUG
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  /** Dev server — avviato con VITE_DEV_MODE=true (scritture Firebase no-op) */
  webServer: {
    command: 'npx -y vercel dev',
    url: 'http://localhost:3000',
    /**
     * In locale riutilizza il server già in esecuzione (es. `npm run dev` aperto
     * in un altro terminale). In CI avvia sempre un server fresco.
     */
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN
    }
  }
});
