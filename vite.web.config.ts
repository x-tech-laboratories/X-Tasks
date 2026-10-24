import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// The same page the desktop app shows, built for a browser with relative paths so a proxy can serve it under a folder.
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  plugins: [preact()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer') } },
  build: { outDir: resolve('out/web'), emptyOutDir: true }
})
