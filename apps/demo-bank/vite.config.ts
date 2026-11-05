import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two pages: the bank app itself, and the FamilyShield embed page it loads
// in an iframe to simulate a native WebView.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
});
