import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(config => ({
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        players: path.resolve(__dirname, 'players.html'),
        add: path.resolve(__dirname, 'add.html'),
        matchmaking: path.resolve(__dirname, 'matchmaking.html'),
        'notifications-dashboard': path.resolve(__dirname, 'notifications-dashboard.html'),
        'notifications-test': path.resolve(__dirname, 'notifications-test.html'),
        confirm: path.resolve(__dirname, 'confirm.html')
      },
      output: {
        // Keep Firebase in a single shared chunk so it is cached across pages.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore/lite']
        }
      }
    }
  }
}));
