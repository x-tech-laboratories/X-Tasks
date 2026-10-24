import type { SettingsApi } from '@shared/settings'
import type { SyncStatus } from '@shared/sync'
import type { TasksApi } from '@shared/tasks'
import {
  API_PATH, CHANGED_EVENT, CLIENT_ID_HEADER, EVENTS_PATH, HELLO_EVENT, LOGIN_PATH, WEB_SETTINGS_METHODS, WEB_TASKS_METHODS, type WebMethod
} from '@shared/web_api'

// ============================================================================
// Server calls
// ============================================================================

// Given by the server when the page connects, so the page is not told about its own changes.
let client_id = ''

// A signed-out page is sent to the login page rather than left showing stale tasks.
async function call_server(method: WebMethod, args: unknown[]): Promise<unknown> {
  const response = await fetch(API_PATH + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CLIENT_ID_HEADER]: client_id },
    body: JSON.stringify(args)
  })
  if (response.status === 401) {
    location.assign(LOGIN_PATH)
    throw new Error('signed out')
  }
  if (!response.ok) throw new Error(`${method} failed: ${await response.text()}`)

  const text = await response.text()
  return text === '' ? undefined : JSON.parse(text)
}

function forward_methods(methods: readonly WebMethod[]): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(methods.map((method) => [method, (...args: unknown[]) => call_server(method, args)]))
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

const NO_SYNC: SyncStatus = { state: 'off', server_url: '', last_synced_at: '', error: '' }

// Gives the page the same window.x_tasks and window.x_settings the desktop app's preload does, backed by the web server.
export function install_web_bridge(): void {
  const tasks_api = {
    ...forward_methods(WEB_TASKS_METHODS),
    on_database_changed: (listener: () => void) => {
      change_listeners.add(listener)
      return () => change_listeners.delete(listener)
    }
  } as unknown as TasksApi

  const settings_api = {
    ...forward_methods(WEB_SETTINGS_METHODS),
    host: 'web',
    show_database_folder: () => Promise.resolve(),
    show_backup_folder: () => Promise.resolve(),
    // A page served by the server already works on the server's tasks, so it has nothing to sync.
    get_sync_status: () => Promise.resolve(NO_SYNC),
    connect_sync: () => Promise.reject(new Error('a browser page cannot sync')),
    disconnect_sync: () => Promise.resolve(NO_SYNC),
    sync_now: () => Promise.resolve(NO_SYNC)
  } as unknown as SettingsApi

  window.x_tasks = tasks_api
  window.x_settings = settings_api
  listen_for_changes()
}
