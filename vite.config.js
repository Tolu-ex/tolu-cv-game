import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2019',
    sourcemap: false,
    // The bundle is almost entirely Three.js, which is needed for the very
    // first frame — code-splitting it would only add a round trip.
    chunkSizeWarningLimit: 900,
  },
});
