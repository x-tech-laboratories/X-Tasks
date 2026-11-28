import fastify, { type FastifyInstance } from 'fastify'

import { register_call_table } from '@x-tech-laboratories/x-libs/server/call_table'
import { register_open_cors } from '@x-tech-laboratories/x-libs/server/cors'
import { EventStream } from '@x-tech-laboratories/x-libs/server/events'
import { register_error_replies, register_lenient_json_body } from '@x-tech-laboratories/x-libs/server/replies'
import { calls_under, register_accounts } from '@x-tech-laboratories/x-libs/server/account_sign_in'
import { AccountStore } from '@x-tech-laboratories/x-libs/server/account_store'
import type { Accounts } from '@x-tech-laboratories/x-libs/server/passwords'
import type { SqlDatabase } from '@x-tech-laboratories/x-libs/sql'
import { register_sync_peer_routes, sync_peer_headers } from '@x-tech-laboratories/x-libs/server/sync_peer_routes'
import { sync_device_methods } from '@x-tech-laboratories/x-libs/sync_peer'
import type { PeerStorage } from '@x-tech-laboratories/x-libs/sync_protocol'
import { register_web_folder } from '@x-tech-laboratories/x-libs/server/web_folder'

import { create_bridge_handlers, type BridgeContext } from './bridge_handlers.ts'
import { call_params } from './call_params.ts'
import { open_database } from '@shared/task_database'
import { task_item_methods } from '@shared/task_items'
import { create_task_sync_peer } from '@shared/task_sync_peer'

// ============================================================================
// Options
// ============================================================================

export interface AppOptions {
  // The folder holding the built web page.
  web_folder: string
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts
  // The server's sync keys and paired devices, and the address devices reach it at, such as "https://tasks.example.org/api/";
  // without them it syncs with no device.
  sync?: { storage: PeerStorage; address: string | null }
}

// The accounts live in the task database, reached afresh each time since restoring a backup reopens it.
const current_database: SqlDatabase = {
  exec: (sql) => open_database().exec(sql),
  prepare: (sql) => open_database().prepare(sql),
  close: () => {}
}

const MAX_BODY_BYTES = 4 * 1024 * 1024

// Every open page's event stream, told when the data changed.
export const changes = new EventStream()

// Calls that only read never change what other pages show, and a read-only token may make them.
export function is_read_only(method: string): boolean {
  return method.startsWith('list_') || method.startsWith('get_') || method.startsWith('search_')
}

// ============================================================================
// Bridge and sync routes
// ============================================================================

// Each handler answers POST /api/call/<name>, the Application Standard's path, with its arguments as a JSON list in order
// or by name as a JSON object; a call that changes anything tells every other open page or window.
// The desktop app's daemon answers its window the same way.
export function register_bridge_calls(api: FastifyInstance, handlers: object, stream: EventStream): void {
  const options = { is_read_only, on_change: (client_id: string) => stream.announce_change(client_id), params: call_params }
  register_call_table(api, '/call', handlers, options)
  // Kept for older clients: X-Tasks answered at /api/<name> before the standard named one path, and installed pages,
  // phones, other programs and an older build's daemon may still call there.
  register_call_table(api, '', handlers, options)
}

// ============================================================================
// The app
// ============================================================================

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ bodyLimit: MAX_BODY_BYTES, forceCloseConnections: true })
  register_lenient_json_body(app)
  register_error_replies(app)
  const accounts = new AccountStore({ database: current_database, app_name: 'X-Tasks', declared: options.declared, token_prefix: 'xtk' })
  // Devices sync without signing in, since each of their calls is sealed; only an admin pairs the server with a device.
  await register_accounts(app, {
    accounts,
    cookie_name: 'x_tasks_session',
    call_of: calls_under('/api/call', '/api'),
    is_read_only,
    open_paths: ['/api/sync/peer'],
    needed: (_method, path) => (path.startsWith('/api/sync/') ? { role: accounts.top_role } : 'any')
  })
  const sync_options = options.sync
  const sync = sync_options
    ? create_task_sync_peer({
        storage: sync_options.storage,
        device_name: 'X-Tasks server',
        on_remote_change: () => changes.announce_change(),
        addresses: () => (sync_options.address ? [sync_options.address] : [])
      })
    : null
  if (sync) {
    app.addHook('onReady', async () => sync.start())
    app.addHook('onClose', async () => sync.stop())
  }

  const context: BridgeContext = { announce_change_to_all: () => changes.announce_change() }
  // The item calls are for other programs; the page has no use for them.
  const handlers = { ...create_bridge_handlers(context), ...task_item_methods }

  await app.register(
    async (api) => {
      // The Android app calls from a page of its own, so any origin may.
      await register_open_cors(api, { allowed_headers: sync_peer_headers })
      api.addHook('onSend', async (_request, reply) => {
        void reply.header('cache-control', 'no-store')
      })
      changes.register(api, '/events')
      if (sync) {
        register_sync_peer_routes(api, sync)
        register_call_table(api, '/sync', sync_device_methods(sync), { is_read_only })
      }
      register_bridge_calls(api, handlers, changes)
    },
    { prefix: '/api' }
  )

  await register_web_folder(app, { folder: options.web_folder })
  return app
}
