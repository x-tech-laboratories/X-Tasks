import { hostname } from 'node:os'
import { dirname, join } from 'node:path'

import fastify, { type FastifyInstance } from 'fastify'

import { create_certificate_trust } from '@x-tech-laboratories/x-libs/certificates'
import { daemon_socket_path, DaemonRunningError, listen_on_socket } from '@x-tech-laboratories/x-libs/local_daemon'
import { EventStream } from '@x-tech-laboratories/x-libs/server/events'
import { register_error_replies, register_lenient_json_body } from '@x-tech-laboratories/x-libs/server/replies'
import { file_sync_storage } from '@x-tech-laboratories/x-libs/sync_file_storage'
import { sync_device_methods } from '@x-tech-laboratories/x-libs/sync_peer'
import { keep_listening_for_peers } from '@x-tech-laboratories/x-libs/sync_peer_listening'

import { close_task_database, get_settings, has_changed_elsewhere } from '@shared/task_database'
import { task_item_methods } from '@shared/task_items'
import { create_task_sync_peer } from '@shared/task_sync_peer'
import { CHANGED_EVENT, CLIENT_ID_HEADER, HELLO_EVENT } from '@shared/web_api'
import { create_bridge_handlers, restart_mcp_server } from '../server/bridge_handlers'
import { register_bridge_calls } from '../server/app'
import { create_backup, restore_backup, schedule_automatic_backups } from './database_backups'
import { stop_mcp_server } from './mcp_server'
import { open_task_database } from './node_task_database'
import { keep_giving_notices } from './notices'

// ============================================================================
// The daemon
// ============================================================================

// Everything X-Tasks does without a window: the database, sync, backups, history, the MCP endpoint, reminders and the Pomodoro.
// The window reaches it over a Unix socket with the same calls a browser makes to the web server, and closing the window leaves it running.

// The window starts it with these set; a run on a test database has a socket of its own.
const database_path = process.env.X_TASKS_DB
if (!database_path) {
  console.error('x-tasks daemon: X_TASKS_DB must name the task database')
  process.exit(2)
}
const socket_path = process.env.X_TASKS_SOCKET || daemon_socket_path({ app: 'x-tasks', data_file: database_path })
// The built daemon sits in out/main, and resources/ beside out/ both in the source tree and in the package.
const icon_path = process.env.X_TASKS_ICON || join(import.meta.dirname, '../../resources/icon.png')

// How long the daemon waits after its last window closed before it stops, when it is not to keep running in the background.
const UNUSED_EXIT_MS = 30_000
const UNUSED_CHECK_MS = 5000

// Every window's event stream, told when the data changed.
const changes = new EventStream({ hello_event: HELLO_EVENT, changed_event: CHANGED_EVENT, client_id_header: CLIENT_ID_HEADER })
const announce_change = (): void => changes.announce_change()

// Trusted certificates, the sync keys and paired devices, and letting other devices connect live beside the database, so a
// scratch database never syncs with the real devices. Node's own https honours the trusted certificates, so sync goes through Node's fetch.
const certificates = create_certificate_trust({ file: join(dirname(database_path), 'trusted-certificates.json'), use_in_node: true })
const listening = keep_listening_for_peers({ peer: () => sync, app: 'x-tasks', file: join(dirname(database_path), 'sync-listening.json'), default_port: 3928 })
const sync = create_task_sync_peer({
  storage: file_sync_storage({ file: join(dirname(database_path), 'sync-peers.json'), back_up_before_replace: () => create_backup().then(() => undefined) }),
  device_name: `X-Tasks on ${hostname()}`,
  on_remote_change: announce_change,
  addresses: () => listening.addresses()
})

// ============================================================================
// Calls
// ============================================================================

function create_handlers(shut_down: () => void) {
  const context = { announce_change_to_all: announce_change }
  return {
    ...create_bridge_handlers(context),
    // The restored data brings its own MCP settings, and then reaches every paired device.
    restore_backup: async (name: string) => {
      await restore_backup(name)
      void restart_mcp_server(context)
      void sync.sync_now()
      announce_change()
    },
    ...sync_device_methods(sync),
    ...listening.methods,
    ...task_item_methods,
    // Stops once the answer has gone back.
    stop_daemon: () => void setTimeout(shut_down, 0)
  }
}

async function build_daemon(shut_down: () => void): Promise<FastifyInstance> {
  const daemon = fastify({ bodyLimit: 4 * 1024 * 1024, forceCloseConnections: true })
  register_lenient_json_body(daemon)
  register_error_replies(daemon)
  await daemon.register(
    async (api) => {
      changes.register(api, '/events')
      await api.register(async (certificate_api) => register_bridge_calls(certificate_api, certificates.methods, changes), { prefix: '/certificates' })
      register_bridge_calls(api, create_handlers(shut_down), changes)
    },
    { prefix: '/api' }
  )
  return daemon
}

// ============================================================================
// Lifecycle
// ============================================================================

async function main(): Promise<void> {
  open_task_database(database_path)

  let is_stopping = false
  const timers: ReturnType<typeof setInterval>[] = []
  let stop_notices = (): void => {}
  const daemon = await build_daemon(() => shut_down())

  function shut_down(): void {
    if (is_stopping) return
    is_stopping = true
    for (const timer of timers) clearInterval(timer)
    stop_notices()
    sync.stop()
    void listening.stop()
    void daemon
      .close()
      .then(() => stop_mcp_server())
      .finally(() => {
        close_task_database()
        process.exit(0)
      })
  }

  try {
    await listen_on_socket(socket_path, (path) => daemon.listen({ path }))
  } catch (error) {
    // Another daemon on this database got there first, which is all that was asked for.
    if (error instanceof DaemonRunningError) process.exit(0)
    throw error
  }
  console.log(`x-tasks daemon on ${socket_path}, using ${database_path}`)

  void restart_mcp_server({ announce_change_to_all: announce_change })
  schedule_automatic_backups()
  await listening.start()
  sync.start()
  stop_notices = keep_giving_notices({ icon_path, announce_change, on_error: (message) => console.error(message) })

  // Another program, such as an older build of the app, may change the database file; every window hears of it.
  timers.push(setInterval(() => has_changed_elsewhere() && announce_change(), 1000))

  // Without "Keep running in the background", the daemon stops a while after its last window has gone.
  let unused_since = Date.now()
  timers.push(
    setInterval(() => {
      if (changes.client_count > 0 || get_settings().keep_running_in_background) unused_since = Date.now()
      else if (Date.now() - unused_since >= UNUSED_EXIT_MS) shut_down()
    }, UNUSED_CHECK_MS)
  )

  process.on('SIGINT', shut_down)
  process.on('SIGTERM', shut_down)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
