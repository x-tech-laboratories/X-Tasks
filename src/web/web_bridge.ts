import { settings_bridge, tasks_bridge } from '@shared/bridges'
import type { SettingsApi } from '@shared/settings'
import type { TasksApi } from '@shared/tasks'
import { LoginNeeded } from '@x-tech-laboratories/x-libs/web/states'
import { API_PATH, CHANGED_EVENT, CLIENT_ID_HEADER, EVENTS_PATH, HELLO_EVENT } from '@shared/web_api'

// ============================================================================
// Server calls
// ============================================================================

// Given by the server when the page connects, so the page is not told about its own changes.
let client_id = ''

// Where the server answers its own sync calls.
const SYNC_DEVICE_PATH = 'api/sync_device/'

// A signed-out page shows the sign-in form rather than stale tasks.
async function call_server(method: string, args: unknown[]): Promise<unknown> {
  const response = await fetch(API_PATH + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CLIENT_ID_HEADER]: client_id },
    body: JSON.stringify(args)
  })
  if (response.status === 401) throw new LoginNeeded('Sign in first.')
  if (!response.ok) throw new Error(`${method} failed: ${await response.text()}`)

  const text = await response.text()
  return text === '' ? undefined : JSON.parse(text)
}

// ============================================================================
// Change events
// ============================================================================

const change_listeners = new Set<() => void>()
const RECONNECT_DELAY_MS = 5000

// Set once the page has had its first greeting, after which a new greeting means it reconnected.
let has_connected = false

// A reconnect may have missed changes, so every greeting after the first reloads the data too.
function listen_for_changes(): void {
  const events = new EventSource(EVENTS_PATH)

  events.addEventListener(HELLO_EVENT, (event) => {
    client_id = (event as MessageEvent<string>).data
    if (has_connected) for (const listener of change_listeners) listener()
    has_connected = true
  })
  events.addEventListener(CHANGED_EVENT, () => {
    for (const listener of change_listeners) listener()
  })
  // The browser retries a dropped stream by itself but gives up on a refused one, so the page checks its sign-in and tries again later.
  events.addEventListener('error', () => {
    if (events.readyState !== EventSource.CLOSED) return
    call_server('get_mcp_status', []).catch(() => undefined)
    setTimeout(listen_for_changes, RECONNECT_DELAY_MS)
  })
}

// ============================================================================
// Bridge
// ============================================================================

// Hands the text to the browser as a download, which saves it or asks where as the browser is set to.
function download_text(file_name: string, text: string): boolean {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file_name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// The server's own sync calls, which only an admin may make.
async function call_server_sync(method: string, args: unknown[]): Promise<never> {
  const response = await fetch(`${SYNC_DEVICE_PATH}${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  if (response.status === 401) throw new LoginNeeded('Sign in first.')
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as never
}

// Gives the page the same window.x_tasks and window.x_settings the desktop app's preload does, backed by the web server.
export function install_web_bridge(): void {
  const tasks_api: TasksApi = {
    ...tasks_bridge.web_rpc(call_server),
    on_database_changed: (listener) => {
      change_listeners.add(listener)
      return () => change_listeners.delete(listener)
    }
  }

  // The calls only the desktop app answers are replaced here, so they never reach the server.
  const settings_api: SettingsApi = {
    ...settings_bridge.web_rpc(call_server),
    host: 'web',
    show_database_folder: () => Promise.resolve(),
    show_backup_folder: () => Promise.resolve(),
    save_text_file: (file_name, text) => Promise.resolve(download_text(file_name, text)),
    get_idle_seconds: () => Promise.resolve(0),
    // A page served by the server works on the server's tasks, so its sync is the server's own, which an admin pairs devices with.
    get_sync_status: () => call_server_sync('get_sync_status', []),
    create_pairing_code: () => call_server_sync('create_pairing_code', []),
    pair_device: (code) => call_server_sync('pair_device', [code]),
    remove_device: (device) => call_server_sync('remove_device', [device]),
    sync_now: () => call_server_sync('sync_now', []),
    get_peer_listening: undefined,
    set_peer_listening: undefined
  }

  window.x_tasks = tasks_api
  window.x_settings = settings_api
  listen_for_changes()
}
