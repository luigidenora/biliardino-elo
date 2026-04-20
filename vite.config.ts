import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(config => ({
  base: '/',
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore/lite'],
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
