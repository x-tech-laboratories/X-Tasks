import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import fastify_cors from '@fastify/cors'
import fastify_static from '@fastify/static'
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

import { CLIENT_ID_HEADER, WEB_SETTINGS_METHODS, WEB_TASKS_METHODS, type WebMethod } from '@shared/web_api'
import { register_auth } from './auth.ts'
import { create_bridge_handlers, type BridgeContext } from './bridge_handlers.ts'
import { announce_change, register_events } from './events.ts'
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

// What the JSON parser hands a route when the body was not JSON, so the route can answer in its own words.
const BAD_JSON = Symbol('bad json')

const WEB_METHODS = new Set<string>([...WEB_TASKS_METHODS, ...WEB_SETTINGS_METHODS])

// Every method a route answers itself; OPTIONS is left to the CORS preflight.
const ANY_METHOD = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// ============================================================================
// Replies
// ============================================================================

function send_text(reply: FastifyReply, status: number, text: string): FastifyReply {
  return reply.code(status).type('text/plain; charset=utf-8').send(text)
}

function client_id_of(request: FastifyRequest): string {
  return String(request.headers[CLIENT_ID_HEADER] ?? '')
}

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
    if (!is_read_only(method as WebMethod)) announce_change(client_id_of(request))

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
        if (has_changed) announce_change(client_id_of(request))
        return reply.send(answer)
      }
      if (call === 'replace') {
        const answer = replace_data(body as Parameters<typeof replace_data>[0])
        announce_change(client_id_of(request))
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

  // Bodies the routes could not use are reported in plain words, as every other refusal is.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    if (body === '') return done(null, undefined)
    try {
      done(null, JSON.parse(body as string))
    } catch {
      done(null, BAD_JSON)
    }
  })

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500
    if (status >= 500) console.error(`${request.method} ${request.url} failed:`, error)
    return send_text(reply, status, error.message)
  })
  app.setNotFoundHandler(async (_request, reply) => send_text(reply, 404, 'not found'))

  await register_auth(app, options.access_token)

  const context: BridgeContext = { announce_change_to_all: () => announce_change() }
  const handlers = create_bridge_handlers(context)

  await app.register(
    async (api) => {
      // The Android app calls from a page of its own; any origin may, since browsers send no cookies with it and the token is still needed.
      await api.register(fastify_cors, {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['authorization', 'content-type', CLIENT_ID_HEADER],
        maxAge: 86400
      })
      api.addHook('onSend', async (_request, reply) => {
        void reply.header('cache-control', 'no-store')
      })
      register_events(api)
      register_sync_calls(api)
      register_bridge_calls(api, handlers)
    },
    { prefix: '/api' }
  )

  // Built assets carry a hash in their name, so they never go stale; the page itself is fetched whole each time.
  const web_folder = resolve(options.web_folder)
  if (existsSync(web_folder)) {
    await app.register(fastify_static, {
      root: web_folder,
      etag: false,
      lastModified: false,
      cacheControl: false,
      setHeaders: (reply, path) => {
        const immutable = path.includes('/assets/')
        void reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      }
    })
  } else {
    console.warn(`no web page found at ${web_folder}; only the API is served`)
  }

  return app
}
