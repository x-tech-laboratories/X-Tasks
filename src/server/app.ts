import fastify, { type FastifyInstance } from 'fastify'

import { register_open_cors } from '@x-tech-laboratories/x-libs/server/cors'
import { EventStream } from '@x-tech-laboratories/x-libs/server/events'
import { register_error_replies, register_lenient_json_body, send_text } from '@x-tech-laboratories/x-libs/server/replies'
import { register_token_sign_in } from '@x-tech-laboratories/x-libs/server/sign_in'
import { register_sync_routes } from '@x-tech-laboratories/x-libs/server/sync_routes'
import { register_web_folder } from '@x-tech-laboratories/x-libs/server/web_folder'

import { WEB_SETTINGS_METHODS, WEB_TASKS_METHODS, type WebMethod } from '@shared/web_api'
import { create_bridge_handlers, type BridgeContext } from './bridge_handlers.ts'
import { create_backup } from '../main/database_backups'
import { open_database } from '../main/task_database'
import { task_sync } from '../main/task_sync'

// ============================================================================
// Options
// ============================================================================

export interface AppOptions {
  // The folder holding the built web page.
  web_folder: string
  // The secret a browser signs in with; empty leaves the server open, which is only allowed on this machine.
  access_token: string
}

const MAX_BODY_BYTES = 4 * 1024 * 1024
// A device sending its whole database to replace the server's needs more room.
const MAX_SYNC_BODY_BYTES = 256 * 1024 * 1024

const WEB_METHODS = new Set<string>([...WEB_TASKS_METHODS, ...WEB_SETTINGS_METHODS])

// Every method a route answers itself; OPTIONS is left to the CORS preflight.
const ANY_METHOD = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// Every open page's event stream, told when the data changed.
export const changes = new EventStream()

// Calls that only read never change what other pages show.
function is_read_only(method: WebMethod): boolean {
  return method.startsWith('list_') || method.startsWith('get_')
}

// ============================================================================
// Bridge and sync routes
// ============================================================================

function register_bridge_calls(api: FastifyInstance, handlers: ReturnType<typeof create_bridge_handlers>): void {
  api.route<{ Params: { method: string } }>({ method: [...ANY_METHOD], url: '/:method', handler: async (request, reply) => {
    const { method } = request.params
    if (request.method !== 'POST') return send_text(reply, 405, 'use POST')
    if (!WEB_METHODS.has(method)) return send_text(reply, 404, `no bridge call named ${method}`)

    // An empty body means no arguments; anything other than a JSON array is refused.
    const args: unknown = request.body ?? []
    if (!Array.isArray(args)) return send_text(reply, 400, 'the body must be a JSON array of arguments')

    const handler = handlers[method as WebMethod] as (...args: unknown[]) => unknown
    const result = await handler(...args)
    if (!is_read_only(method as WebMethod)) changes.announce_change(changes.client_id_of(request))

    if (result === undefined) return reply.code(204).send()
    return reply.send(result)
  } })
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
  await register_token_sign_in(app, { secret: options.access_token, title: 'X-Tasks' })

  const context: BridgeContext = { announce_change_to_all: () => changes.announce_change() }
  const handlers = create_bridge_handlers(context)

  await app.register(
    async (api) => {
      // The Android app calls from a page of its own, so any origin may.
      await register_open_cors(api)
      api.addHook('onSend', async (_request, reply) => {
        void reply.header('cache-control', 'no-store')
      })
      changes.register(api, '/events')
      register_sync_calls(api)
      register_bridge_calls(api, handlers)
    },
    { prefix: '/api' }
  )

  await register_web_folder(app, { folder: options.web_folder })
  return app
}
