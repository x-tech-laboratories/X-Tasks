import { createRoot } from 'react-dom/client'

import { follow_host_theme } from '@x-tech-laboratories/x-libs/web/theme'

import { App } from './App'
import { SignedIn } from './SignedIn'
import { install_web_bridge } from './web_bridge'
import '@x-tech-laboratories/halon/halon-tokens.css'
import '@x-tech-laboratories/halon/halon.css'
import './app.css'

// The desktop app's preload has already set up the bridge; the Android build keeps its own database, and a browser talks to the web server.
async function install_bridge(): Promise<void> {
  if ('x_tasks' in window) return
  if (import.meta.env.MODE === 'android') return (await import('./android/android_bridge')).install_android_bridge()
  install_web_bridge()
}

// The Linux sidebar's web plugin hands the page its colours as --sidebar-* variables, and the page follows them when they are there.
follow_host_theme()

// A browser signs in to the server first; the desktop and phone apps open on their own tasks.
void install_bridge().then(() => {
  const page = window.x_settings.host === 'web' ? <SignedIn>{(account) => <App account={account} />}</SignedIn> : <App />
  createRoot(document.getElementById('app')!).render(page)
})
