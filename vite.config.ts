import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is a fully client-side tool: GIFs never leave the browser.
// `host` + `allowedHosts` keep it usable behind sandboxed preview proxies.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
});
