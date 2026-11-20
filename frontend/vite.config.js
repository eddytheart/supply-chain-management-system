import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to this app, and /api calls are forwarded to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    testTimeout: 60000,
    env: { VITE_API_URL: 'http://localhost:5055/api' }, // tests talk to a test backend
  },
});
