/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { landingSitePlugin } from './scripts/landingSitePlugin.js'

/** Minimal KEY=value parser for the server's .env (comments and quotes stripped). */
function readDotEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^"(.*)"$/, '$1')
  }
  return out
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `.env` is the server's file; Vite only needs the API port out of it so the proxy points at the right process.
  // The API port comes from the .env *file* only — launchers set process.env.PORT for Vite itself,
  // and Vite's loadEnv folds process.env in, so the file is parsed directly here.
  const fileEnv = readDotEnv(path.resolve(process.cwd(), '.env'))
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  // 127.0.0.1 rather than localhost: dual-stack "happy eyeballs" connects can fail with EAGAIN inside sandboxed launchers.
  const apiOrigin = process.env.RECLAIM_API_ORIGIN ?? fileEnv.RECLAIM_API_ORIGIN ?? `http://127.0.0.1:${fileEnv.PORT ?? 8787}`
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
