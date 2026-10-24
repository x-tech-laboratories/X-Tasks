import { render } from 'preact'

import { App } from './App'
import { install_web_bridge } from './web_bridge'
import './app.css'

// The desktop app's preload has already set up the bridge; in a browser the page sets up its own.
if (!('x_tasks' in window)) install_web_bridge()

render(<App />, document.getElementById('app')!)
