import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The web server as one Node module; its npm dependencies stay outside the bundle and load from node_modules.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  build: {
    ssr: resolve('src/server/index.ts'),
    outDir: resolve('out/server'),
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'index.js' } }
  }
})
