import { render } from 'preact'

import { App } from './App'
import { install_web_bridge } from './web_bridge'
import './app.css'

// The desktop app's preload has already set up the bridge; the Android build keeps its own database, and a browser talks to the web server.
async function install_bridge(): Promise<void> {
  if ('x_tasks' in window) return
  if (import.meta.env.MODE === 'android') return (await import('./android/android_bridge')).install_android_bridge()
  install_web_bridge()
}

void install_bridge().then(() => render(<App />, document.getElementById('app')!))
