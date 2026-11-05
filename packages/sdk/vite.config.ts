import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Two builds:
 *  - `vite build`             → dist/embed/: the standalone page banks load in a WebView/iframe
 *  - `vite build --mode lib`  → dist/lib/:   ES modules for banks that mount inline (React bundled in)
 */
export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [react()],
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: 'dist/lib',
        emptyOutDir: true,
        sourcemap: true,
        lib: {
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            mock: resolve(__dirname, 'src/api/mock/index.ts'),
            embed: resolve(__dirname, 'src/embed.tsx'),
          },
          formats: ['es'],
        },
      },
    };
  }
  return {
    plugins: [react()],
    base: './',
    build: { outDir: 'dist/embed', emptyOutDir: true, sourcemap: true },
  };
});
