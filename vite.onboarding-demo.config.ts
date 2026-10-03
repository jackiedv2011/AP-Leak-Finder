/// <reference types="vite/client" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Review build of onboarding (demo/onboarding.tsx): the real workspace as a guest,
// with no server. The 3D loops are not bundled; they sit next to the page in
// onboarding/ (public/onboarding in the app), and the workspace stills in media/.
export default defineConfig({
  root: path.resolve(__dirname, 'demo'),
  base: './',
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: path.resolve(__dirname, 'demo-onboarding-dist'),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'demo/onboarding.html') },
  },
})
