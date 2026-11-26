import fastify, { type FastifyInstance } from 'fastify'

import { register_call_table } from '@x-tech-laboratories/x-libs/server/call_table'
import { register_open_cors } from '@x-tech-laboratories/x-libs/server/cors'
import { EventStream } from '@x-tech-laboratories/x-libs/server/events'
import { register_error_replies, register_lenient_json_body } from '@x-tech-laboratories/x-libs/server/replies'
import { calls_under, register_accounts } from '@x-tech-laboratories/x-libs/server/account_sign_in'
import { AccountStore } from '@x-tech-laboratories/x-libs/server/account_store'
import type { Accounts } from '@x-tech-laboratories/x-libs/server/passwords'
import type { SqlDatabase } from '@x-tech-laboratories/x-libs/sql'
import { register_sync_routes } from '@x-tech-laboratories/x-libs/server/sync_routes'
import { register_web_folder } from '@x-tech-laboratories/x-libs/server/web_folder'

import { create_bridge_handlers, type BridgeContext } from './bridge_handlers.ts'
import { create_backup } from '../daemon/database_backups'
import { open_database } from '@shared/task_database'
import { task_item_methods } from '@shared/task_items'
import { task_sync } from '@shared/task_sync'

// ============================================================================
// Options
// ============================================================================

export interface AppOptions {
  // The folder holding the built web page.
  web_folder: string
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts
}

// The accounts live in the task database, reached afresh each time since restoring a backup reopens it.
const current_database: SqlDatabase = {
  exec: (sql) => open_database().exec(sql),
  prepare: (sql) => open_database().prepare(sql),
  close: () => {}
}

const MAX_BODY_BYTES = 4 * 1024 * 1024
// A device sending its whole database to replace the server's needs more room.
const MAX_SYNC_BODY_BYTES = 256 * 1024 * 1024

// Every open page's event stream, told when the data changed.
export const changes = new EventStream()

// Calls that only read never change what other pages show, and a read-only token may make them.
export function is_read_only(method: string): boolean {
  return method.startsWith('list_') || method.startsWith('get_') || method.startsWith('search_')
}

// ============================================================================
// Bridge and sync routes
// ============================================================================

// Each handler answers a POST to its name, with its arguments as a JSON array; a call that changes anything tells every other open page or window.
// The desktop app's daemon answers its window the same way.
export function register_bridge_calls(api: FastifyInstance, handlers: object, stream: EventStream): void {
  register_call_table(api, '', handlers, { is_read_only, on_change: (client_id) => stream.announce_change(client_id) })
}

// Devices sync at api/sync/exchange, snapshot and replace; the server's data is backed up before a device replaces it.
function register_sync_calls(api: FastifyInstance): void {
  register_sync_routes(api, {
    engine: task_sync,
    database: open_database,
    back_up: () => void create_backup(),
    on_change: (request) => changes.announce_change(changes.client_id_of(request)),
    prefix: '/sync',
    body_limit: MAX_SYNC_BODY_BYTES
  })
}

// ============================================================================
// The app
// ============================================================================

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ bodyLimit: MAX_BODY_BYTES, forceCloseConnections: true })
  register_lenient_json_body(app)
  register_error_replies(app)
  const accounts = new AccountStore({ database: current_database, app_name: 'X-Tasks', declared: options.declared, token_prefix: 'xtk' })
  await register_accounts(app, { accounts, cookie_name: 'x_tasks_session', call_of: calls_under('/api'), is_read_only })

  const context: BridgeContext = { announce_change_to_all: () => changes.announce_change() }
  // The item calls are for other programs; the page has no use for them.
  const handlers = { ...create_bridge_handlers(context), ...task_item_methods }

  await app.register(
    async (api) => {
      // The Android app calls from a page of its own, so any origin may.
      await register_open_cors(api)
      api.addHook('onSend', async (_request, reply) => {
        void reply.header('cache-control', 'no-store')
      })
      changes.register(api, '/events')
      register_sync_calls(api)
      register_bridge_calls(api, handlers, changes)
    },
    { prefix: '/api' }
  )

  await register_web_folder(app, { folder: options.web_folder })
  return app
}
