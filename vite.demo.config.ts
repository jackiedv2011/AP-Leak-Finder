/// <reference types="vite/client" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// A self-contained snapshot of the workspace for design review. Deliberately
// does NOT load landingSitePlugin: this builds the app only.
export default defineConfig({
  root: path.resolve(__dirname, 'demo'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: path.resolve(__dirname, 'demo-dist'), emptyOutDir: true },
})
