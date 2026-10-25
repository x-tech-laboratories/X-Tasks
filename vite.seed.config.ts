import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The development database seeder as one Node module, built the same way as the web server.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  build: {
    ssr: resolve('src/dev/seed_database.ts'),
    outDir: resolve('out/seed'),
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'index.js' } }
  }
})
