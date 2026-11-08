import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Tests read local dates, so every run uses the same time zone.
process.env.TZ = 'UTC'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@web': fileURLToPath(new URL('./src/web', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  }
})
