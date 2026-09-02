import { defineConfig } from 'vite';

const apiTarget = process.env.AKSHACONNECT_WEB_API_TARGET || 'http://127.0.0.1:4100';

export default defineConfig({
  server: {
    host: process.env.AKSHACONNECT_WEB_HOST || '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/ready': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/ws': {
        target: apiTarget,
        ws: true,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: process.env.AKSHACONNECT_WEB_HOST || '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
});
