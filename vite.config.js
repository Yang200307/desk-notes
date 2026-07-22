// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: 'src',
  build: {
    outDir: '../dist-renderer',
    emptyOutDir: true,
  },
});
