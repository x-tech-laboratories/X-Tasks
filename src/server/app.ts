import fastify, { type FastifyInstance } from 'fastify'

import { register_open_cors } from '@x-tech-laboratories/x-libs/server/cors'
import { EventStream } from '@x-tech-laboratories/x-libs/server/events'
import { BAD_JSON, register_error_replies, register_lenient_json_body, send_text } from '@x-tech-laboratories/x-libs/server/replies'
import { register_token_sign_in } from '@x-tech-laboratories/x-libs/server/sign_in'
import { register_web_folder } from '@x-tech-laboratories/x-libs/server/web_folder'

import { WEB_SETTINGS_METHODS, WEB_TASKS_METHODS, type WebMethod } from '@shared/web_api'
import { create_bridge_handlers, type BridgeContext } from './bridge_handlers.ts'
import { BadSyncRequest, exchange_changes, GenerationMismatch, read_snapshot, replace_data } from './sync_routes.ts'

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

function register_sync_calls(api: FastifyInstance): void {
  api.route<{ Params: { call: string } }>({ method: [...ANY_METHOD], url: '/sync/:call', bodyLimit: MAX_SYNC_BODY_BYTES, handler: async (request, reply) => {
    const { call } = request.params
    if (call === 'snapshot' && request.method === 'GET') return reply.send(read_snapshot())
    if (request.method !== 'POST') return send_text(reply, 405, 'use POST')

    const body: unknown = request.body
    if (body === BAD_JSON || body === undefined) return send_text(reply, 400, 'the body must be JSON')

    try {
      if (call === 'exchange') {
        const [answer, has_changed] = exchange_changes(body as Parameters<typeof exchange_changes>[0])
        if (has_changed) changes.announce_change(changes.client_id_of(request))
        return reply.send(answer)
      }
      if (call === 'replace') {
        const answer = replace_data(body as Parameters<typeof replace_data>[0])
        changes.announce_change(changes.client_id_of(request))
        return reply.send(answer)
      }
    } catch (error) {
      if (error instanceof GenerationMismatch) return send_text(reply, 409, error.message)
      if (error instanceof BadSyncRequest) return send_text(reply, 400, error.message)
      throw error
    }
    return send_text(reply, 404, `no sync call named ${call}`)
  } })
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
