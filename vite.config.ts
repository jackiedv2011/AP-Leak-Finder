/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { landingSitePlugin } from './scripts/landingSitePlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `.env` is the server's file; Vite only needs the API port out of it so the proxy points at the right process.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const apiOrigin = env.RECLAIM_API_ORIGIN ?? `http://localhost:${env.PORT ?? 8787}`
  return {
  plugins: [landingSitePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // The API lives in a separate Node process (see `npm run dev:server`).
    port: Number(env.VITE_PORT ?? 5174),
    strictPort: true,
    proxy: { '/api': { target: apiOrigin, changeOrigin: false } },
  },
  preview: {
    proxy: { '/api': { target: apiOrigin, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/restore-backup-*/**'],
  },
  }
})
