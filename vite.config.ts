import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(config => ({
  base: '/biliardino-elo/',
  publicDir: false,
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
        addMatch: path.resolve(__dirname, 'add-match.html')
      }
    }
  }
}));
