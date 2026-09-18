/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { landingSitePlugin } from './scripts/landingSitePlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [landingSitePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/restore-backup-*/**'],
  },
})
