import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Plugin Vite per la modalità sviluppo.
 *
 * Quando VITE_DEV_MODE=true, il repository usa dati mock in memoria
 * invece di Firebase. Auth e controlli admin funzionano normalmente.
 *
 * In produzione __DEV_MODE__ viene sostituito con `false` a compile-time
 * e Rollup elimina il codice mock dal bundle (dead-code elimination).
 */
function devModePlugin(): Plugin {
  let isDevMode = false;

  return {
    name: 'dev-mode',
    enforce: 'pre',

    config(_, { mode }) {
      // Carica solo le variabili d'ambiente che iniziano con "VITE_" dal file .env.[mode]
      const env = loadEnv(mode, process.cwd(), 'VITE_');

      // Attiva dev mode se impostato nel file .env oppure come variabile shell (utile per e2e/CI)
      isDevMode = env.VITE_DEV_MODE === 'true' || process.env.VITE_DEV_MODE === 'true';

      if (mode !== 'production') {
        console.log(`[dev-mode] mode=${mode}, VITE_DEV_MODE=${isDevMode ? 'true' : 'false'}`);
      }

      return {
        define: {
          __DEV_MODE__: isDevMode
        }
      };
    }
  };
}

export default defineConfig(config => ({
  base: '/',
  plugins: [devModePlugin(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore/lite'],
          gsap: ['gsap'],
          chartjs: ['chart.js']
        }
      }
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: {
      API_TOKEN: process.env.API_TOKEN || 'test-token',
      VERCEL_URL: process.env.VERCEL_URL || '',
      ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN || 'admin-test-token'
    }
  }
}));
