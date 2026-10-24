import {
  SYNC_EXCHANGE_PATH, SYNC_REPLACE_PATH, SYNC_SNAPSHOT_PATH, type SyncDirection, type SyncExchangeRequest, type SyncExchangeResponse, type SyncReplaceResponse,
  type SyncSnapshot, type SyncStatus
} from '@shared/sync'
import { CHANGED_EVENT, CLIENT_ID_HEADER, EVENTS_PATH, HELLO_EVENT } from '@shared/web_api'
import {
  apply_changes, collect_snapshot, collect_unpushed_changes, has_unpushed_changes, read_sync_state, replace_with_snapshot, write_sync_state
} from './sync_engine'
import { open_database } from './task_database'

// ============================================================================
// Server settings
// ============================================================================

export interface SyncConfig {
  server_url: string
  token: string
}

// Where each platform keeps the server and its token, and how it saves a copy of the data before the server's replaces it.
export interface SyncStorage {
  read_config: () => SyncConfig | null
  write_config: (config: SyncConfig) => void
  remove_config: () => void
  back_up_before_download: () => void | Promise<void>
}

let storage: SyncStorage | null = null

function read_config(): SyncConfig | null {
  return storage?.read_config() ?? null
}

function sync_storage(): SyncStorage {
  if (!storage) throw new Error('sync has not been started')
  return storage
}

// A trailing slash keeps the server's own folder when paths are resolved against it.
function normalise_url(server_url: string): string {
  const url = new URL(server_url.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('the server address must start with http:// or https://')
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

// ============================================================================
// Requests
// ============================================================================

class SyncHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

// The client id from the server's event stream, so the server does not tell this device about its own changes.
let event_client_id = ''

async function request_server<Result>(config: SyncConfig, path: string, body?: unknown): Promise<Result> {
  const response = await fetch(new URL(path, config.server_url), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', [CLIENT_ID_HEADER]: event_client_id },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (response.status === 401) throw new SyncHttpError(401, 'the server refused the access token')
  if (!response.ok) throw new SyncHttpError(response.status, `the server answered ${response.status}: ${await response.text()}`)
  return (await response.json()) as Result
}

// ============================================================================
// Status
// ============================================================================

let status: SyncStatus = { state: 'off', server_url: '', last_synced_at: '', error: '' }
let announce_remote_change: () => void = () => undefined

export function get_sync_status(): SyncStatus {
  return status
}

function set_status(changes: Partial<SyncStatus>): void {
  status = { ...status, ...changes }
}

// A refused token or a replaced server needs the user; anything else is the network, which is tried again later.
function record_failure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof SyncHttpError && error.status === 409) {
    write_sync_state(open_database(), { server_generation: '' })
    ask_which_copy_to_keep("the server's tasks were replaced")
  } else if (error instanceof SyncHttpError) set_status({ state: 'failed', error: message })
  else set_status({ state: 'offline', error: message })
}

// ============================================================================
// Exchanging changes
// ============================================================================

let exchanging: Promise<void> | null = null

// Syncing waits until the user chooses again whether the server's tasks or this device's win.
function ask_which_copy_to_keep(reason: string): void {
  stop_background_sync()
  set_status({ state: 'needs_setup', error: `${reason}; choose which copy of the tasks to keep` })
}

// Sends this device's new changes and takes everyone else's in one round trip; calls made while one runs wait for it.
async function exchange(): Promise<void> {
  const config = read_config()
  const database = open_database()
  const state = read_sync_state(database)
  if (!config) return
  if (state.server_generation === '') return ask_which_copy_to_keep('this device restored a backup')

  set_status({ state: 'syncing' })
  const outgoing = collect_unpushed_changes(database)
  const request: SyncExchangeRequest = { site: state.site, generation: state.server_generation, cursor: state.pulled_seq, changes: outgoing.changes }
  const response = await request_server<SyncExchangeResponse>(config, SYNC_EXCHANGE_PATH, request)

  const applied = apply_changes(database, response.changes)
  write_sync_state(database, { pushed_seq: outgoing.up_to_seq, pulled_seq: response.cursor })
  set_status({ state: 'idle', last_synced_at: new Date().toISOString(), error: '' })
  if (applied > 0) announce_remote_change()
}

export function sync_now(): Promise<SyncStatus> {
  exchanging ??= exchange()
    .catch(record_failure)
    .finally(() => {
      exchanging = null
    })
  return exchanging.then(() => status)
}

// ============================================================================
// Connecting
// ============================================================================

// Download takes the server's tasks in place of this device's, after backing them up; upload makes this device's the server's.
// Either way the device takes a fresh id, so a database copied from another device never passes for it.
export async function connect_sync(server_url: string, token: string, direction: SyncDirection): Promise<SyncStatus> {
  const saved = read_config()
  const config: SyncConfig = { server_url: normalise_url(server_url), token: token || (saved?.token ?? '') }
  if (config.token === '') throw new Error('enter the access token')

  stop_background_sync()
  const database = open_database()
  set_status({ state: 'syncing', server_url: config.server_url, error: '' })

  try {
    if (direction === 'download') {
      const snapshot = await request_server<SyncSnapshot>(config, SYNC_SNAPSHOT_PATH)
      await sync_storage().back_up_before_download()
      write_sync_state(database, { site: crypto.randomUUID() })
      replace_with_snapshot(database, snapshot.changes)
      write_sync_state(database, { server_generation: snapshot.generation, pulled_seq: snapshot.cursor, pushed_seq: read_sync_state(database).last_seq })
    } else {
      write_sync_state(database, { site: crypto.randomUUID() })
      const snapshot = collect_snapshot(database)
      const response = await request_server<SyncReplaceResponse>(config, SYNC_REPLACE_PATH, { changes: snapshot.changes })
      write_sync_state(database, { server_generation: response.generation, pulled_seq: response.cursor, pushed_seq: snapshot.up_to_seq })
    }
  } catch (error) {
    record_failure(error)
    throw error
  }

  sync_storage().write_config(config)
  set_status({ state: 'idle', last_synced_at: new Date().toISOString(), error: '' })
  if (direction === 'download') announce_remote_change()
  start_background_sync()
  return status
}

// Stops syncing and forgets the server; the tasks on this device stay as they are.
export function disconnect_sync(): SyncStatus {
  stop_background_sync()
  sync_storage().remove_config()
  write_sync_state(open_database(), { server_generation: '' })
  status = { state: 'off', server_url: '', last_synced_at: '', error: '' }
  return status
}

// ============================================================================
// Background sync
// ============================================================================

const LOCAL_CHECK_MS = 2 * 1000
const FULL_SYNC_MS = 60 * 1000
const RETRY_AFTER_FAILURE_MS = 30 * 1000
const EVENT_STREAM_RETRY_MS = 15 * 1000

let timers: ReturnType<typeof setTimeout>[] = []
let event_stream: AbortController | null = null
let last_failure_at = 0

// Local changes go out within seconds, but a device that cannot reach the server waits a while before trying again.
function sync_soon(): void {
  if (Date.now() - last_failure_at < RETRY_AFTER_FAILURE_MS) return
  void sync_now().then(() => {
    if (status.state === 'offline' || status.state === 'failed') last_failure_at = Date.now()
  })
}

function check_local_changes(): void {
  if (has_unpushed_changes(open_database())) sync_soon()
}

// Follows the server's event stream and syncs whenever another device or page changes something.
async function follow_server_events(config: SyncConfig, stream: AbortController): Promise<void> {
  const response = await fetch(new URL(EVENTS_PATH, config.server_url), { headers: { authorization: `Bearer ${config.token}` }, signal: stream.signal })
  if (!response.ok || !response.body) throw new Error(`event stream answered ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? ''
      if (event === HELLO_EVENT) {
        event_client_id = data
        last_failure_at = 0
        sync_soon()
      }
      if (event === CHANGED_EVENT) sync_soon()
    }
  }
}

function keep_following_server_events(config: SyncConfig): void {
  const stream = new AbortController()
  event_stream = stream
  void follow_server_events(config, stream)
    .catch(() => undefined)
    .finally(() => {
      event_client_id = ''
      if (event_stream === stream) timers.push(setTimeout(() => keep_following_server_events(config), EVENT_STREAM_RETRY_MS))
    })
}

function start_background_sync(): void {
  const config = read_config()
  if (!config) return
  timers.push(setInterval(check_local_changes, LOCAL_CHECK_MS), setInterval(() => void sync_now(), FULL_SYNC_MS))
  keep_following_server_events(config)
}

function stop_background_sync(): void {
  for (const timer of timers) clearTimeout(timer)
  timers = []
  event_stream?.abort()
  event_stream = null
}

// Starts syncing with the saved server, if there is one; the callback runs whenever changes from elsewhere land in the database.
export function start_sync(platform_storage: SyncStorage, on_remote_change: () => void): void {
  storage = platform_storage
  announce_remote_change = on_remote_change
  const config = read_config()
  if (!config) return

  set_status({ server_url: config.server_url })
  if (read_sync_state(open_database()).server_generation === '') return ask_which_copy_to_keep('this device has not synced since a restore')
  set_status({ state: 'idle' })
  start_background_sync()
}

export function stop_sync(): void {
  stop_background_sync()
}
