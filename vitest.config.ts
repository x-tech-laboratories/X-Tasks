import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests read local dates, so every run uses the same time zone.
process.env.TZ = 'UTC'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
})
