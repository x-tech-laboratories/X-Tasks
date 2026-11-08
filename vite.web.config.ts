import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The same page the desktop app shows, built for a browser with relative paths so a proxy can serve it under a folder.
export default defineConfig({
  root: resolve('src/web'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@web': resolve('src/web') } },
  build: { outDir: resolve('out/web'), emptyOutDir: true }
})
