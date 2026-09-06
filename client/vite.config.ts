import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev-proxies /api to the server, so dev and production share one origin and
// CORS never appears in the codebase (Phase 1).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
