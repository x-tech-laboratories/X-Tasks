import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import preact from '@preact/preset-vite'

const shared_directory = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared_directory } },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared_directory } },
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [preact()],
    resolve: { alias: { '@shared': shared_directory, '@renderer': resolve('src/renderer') } },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
})
