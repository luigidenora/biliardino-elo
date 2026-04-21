import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function readSwVersion(): string {
  try {
    const src = fs.readFileSync(path.resolve(__dirname, 'public/sw.js'), 'utf-8');
    const m = src.match(/^const VERSION = '([^']+)';/m);
    return m?.[1] ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export default defineConfig(config => ({
  base: '/',
  define: {
    __SW_VERSION__: JSON.stringify(readSwVersion())
  },
  plugins: [
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,webp}'],
        globIgnores: ['**/apple-splash-*.jpg'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('web-haptics')) return;
        warn(warning);
      },
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          gsap: ['gsap'],
          chartjs: ['chart.js'],
          lucide: ['lucide']
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
