import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two pages: the bank app itself, and the FamilyShield embed page it loads
// in an iframe to simulate a native WebView. The CSV files in data/ are
// bundled for browser mode (see src/seedCsv.ts).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // Server mode (npm run dev): /v1 goes to the backend server on :8787.
    proxy: { '/v1': 'http://localhost:8787' },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
});
