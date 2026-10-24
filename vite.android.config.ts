import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

// The Android app runs SQLite as WebAssembly and syncs with a server elsewhere, which the desktop page's policy forbids.
const ANDROID_CONTENT_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:"

function android_content_policy(): Plugin {
  return {
    name: 'x-tasks-android-content-policy',
    transformIndexHtml: (html) => html.replace(/(http-equiv="Content-Security-Policy" content=")[^"]*/, `$1${ANDROID_CONTENT_POLICY}`)
  }
}

// The page for the Capacitor app, built with mode "android" so it keeps its database on the phone.
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  mode: 'android',
  plugins: [preact(), android_content_policy()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer') } },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: { outDir: resolve('out/android'), emptyOutDir: true }
})
