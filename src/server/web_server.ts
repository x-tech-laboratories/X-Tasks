import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

import { CHANGED_EVENT, CLIENT_ID_HEADER, HELLO_EVENT, WEB_SETTINGS_METHODS, WEB_TASKS_METHODS, type WebMethod } from '@shared/web_api'
import { create_bridge_handlers, type BridgeContext } from './bridge_handlers'
import { render_login_page } from './login_page'
import { BadSyncRequest, exchange_changes, GenerationMismatch, read_snapshot, replace_data } from './sync_routes'

// ============================================================================
// Options
// ============================================================================

export interface WebServerOptions {
  // The folder holding the built web page.
  web_folder: string
  // The secret a browser signs in with; empty leaves the server open, which is only allowed on this machine.
  access_token: string
}

const SESSION_COOKIE = 'x_tasks_session'
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60
const FAILED_LOGIN_DELAY_MS = 1000
const MAX_BODY_BYTES = 4 * 1024 * 1024
// A device sending its whole database to replace the server's needs more room.
const MAX_SYNC_BODY_BYTES = 256 * 1024 * 1024
const HEARTBEAT_MS = 25 * 1000

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

// ============================================================================
// Sign-in
// ============================================================================

// The cookie holds a value derived from the token, so changing the token signs every browser out.
function session_value(access_token: string): string {
  return createHmac('sha256', access_token).update('x-tasks-session').digest('hex')
}

function same_text(first: string, second: string): boolean {
  const first_bytes = Buffer.from(first)
  const second_bytes = Buffer.from(second)
  return first_bytes.length === second_bytes.length && timingSafeEqual(first_bytes, second_bytes)
}

function read_cookie(request: IncomingMessage, name: string): string {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return ''
}

// A browser signs in with its cookie; other programs can send the token as a bearer header instead.
function is_signed_in(request: IncomingMessage, access_token: string): boolean {
  if (access_token === '') return true
  const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
  if (bearer !== undefined) return same_text(bearer, access_token)
  return same_text(read_cookie(request, SESSION_COOKIE), session_value(access_token))
}

// A proxy that ends TLS says so in a header, and the cookie is then kept to secure connections.
function is_secure(request: IncomingMessage): boolean {
  return request.headers['x-forwarded-proto'] === 'https' || 'encrypted' in request.socket
}

function session_cookie(request: IncomingMessage, value: string, max_age_seconds: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${max_age_seconds}${is_secure(request) ? '; Secure' : ''}`
}

// ============================================================================
// Request helpers
// ============================================================================

function read_body(request: IncomingMessage, max_bytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve_body, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max_bytes) {
        reject(new Error('request body too large'))
        request.destroy()
      } else chunks.push(chunk)
    })
    request.on('end', () => resolve_body(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function send(response: ServerResponse, status: number, body: string, content_type = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, { 'Content-Type': content_type, 'Cache-Control': 'no-store' }).end(body)
}

// ============================================================================
// Change events
// ============================================================================

// Every open page's event stream, by the client id it was given.
const event_streams = new Map<string, ServerResponse>()

function send_event(stream: ServerResponse, event: string, data: string): void {
  stream.write(`event: ${event}\ndata: ${data}\n\n`)
}

// The page that made a change already shows it, so only the others are told.
export function announce_change(except_client_id = ''): void {
  for (const [client_id, stream] of event_streams) if (client_id !== except_client_id) send_event(stream, CHANGED_EVENT, '')
}

function open_event_stream(request: IncomingMessage, response: ServerResponse): void {
  const client_id = randomUUID()
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
  response.write('retry: 3000\n\n')
  send_event(response, HELLO_EVENT, client_id)
  event_streams.set(client_id, response)

  // A comment now and then keeps proxies from closing a quiet stream.
  const heartbeat = setInterval(() => response.write(': still here\n\n'), HEARTBEAT_MS)
  request.on('close', () => {
    clearInterval(heartbeat)
    event_streams.delete(client_id)
  })
}

// ============================================================================
// Bridge calls
// ============================================================================

const WEB_METHODS = new Set<string>([...WEB_TASKS_METHODS, ...WEB_SETTINGS_METHODS])

// Calls that only read never change what other pages show.
function is_read_only(method: WebMethod): boolean {
  return method.startsWith('list_') || method.startsWith('get_')
}

// An empty body means no arguments; anything other than a JSON array gives null.
function parse_arguments(body: string): unknown[] | null {
  try {
    const args: unknown = JSON.parse(body || '[]')
    return Array.isArray(args) ? args : null
  } catch {
    return null
  }
}

async function answer_bridge_call(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  handlers: ReturnType<typeof create_bridge_handlers>
): Promise<void> {
  if (request.method !== 'POST') return send(response, 405, 'use POST')
  if (!WEB_METHODS.has(method)) return send(response, 404, `no bridge call named ${method}`)

  const args = parse_arguments(await read_body(request))
  if (!args) return send(response, 400, 'the body must be a JSON array of arguments')

  const handler = handlers[method as WebMethod] as (...args: unknown[]) => unknown
  const result = await handler(...args)
  if (!is_read_only(method as WebMethod)) announce_change(String(request.headers[CLIENT_ID_HEADER] ?? ''))

  if (result === undefined) response.writeHead(204, { 'Cache-Control': 'no-store' }).end()
  else send(response, 200, JSON.stringify(result), 'application/json')
}

// ============================================================================
// Sync calls
// ============================================================================

async function answer_sync_call(request: IncomingMessage, response: ServerResponse, call: string): Promise<void> {
  const client_id = String(request.headers[CLIENT_ID_HEADER] ?? '')
  const json = (value: unknown): void => send(response, 200, JSON.stringify(value), 'application/json')

  if (call === 'snapshot' && request.method === 'GET') return json(read_snapshot())
  if (request.method !== 'POST') return send(response, 405, 'use POST')

  let body: unknown
  try {
    body = JSON.parse(await read_body(request, MAX_SYNC_BODY_BYTES))
  } catch {
    return send(response, 400, 'the body must be JSON')
  }

  try {
    if (call === 'exchange') {
      const [answer, has_changed] = exchange_changes(body as Parameters<typeof exchange_changes>[0])
      if (has_changed) announce_change(client_id)
      return json(answer)
    }
    if (call === 'replace') {
      const answer = replace_data(body as Parameters<typeof replace_data>[0])
      announce_change(client_id)
      return json(answer)
    }
  } catch (error) {
    if (error instanceof GenerationMismatch) return send(response, 409, error.message)
    if (error instanceof BadSyncRequest) return send(response, 400, error.message)
    throw error
  }
  send(response, 404, `no sync call named ${call}`)
}

// ============================================================================
// Static files
// ============================================================================

// Only files inside the web folder are served, whatever the path asks for; built assets carry a hash in their name, so they never go stale.
function serve_static(response: ServerResponse, web_folder: string, pathname: string): void {
  const root = resolve(web_folder)
  const relative_path = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
  const file_path = resolve(join(root, relative_path))

  if (!file_path.startsWith(root + sep) || !existsSync(file_path) || !statSync(file_path).isFile()) return send(response, 404, 'not found')

  const is_hashed_asset = relative_path.startsWith('assets/')
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file_path)] ?? 'application/octet-stream',
    'Cache-Control': is_hashed_asset ? 'public, max-age=31536000, immutable' : 'no-cache'
  })
  response.end(readFileSync(file_path))
}

// ============================================================================
// Routing
// ============================================================================

async function handle_login(request: IncomingMessage, response: ServerResponse, access_token: string): Promise<void> {
  if (request.method !== 'POST') return send(response, 200, render_login_page(false), 'text/html; charset=utf-8')

  const token = new URLSearchParams(await read_body(request)).get('token') ?? ''
  if (access_token === '' || same_text(token, access_token)) {
    response.writeHead(303, { Location: './', 'Set-Cookie': session_cookie(request, session_value(access_token), SESSION_MAX_AGE_SECONDS) }).end()
    return
  }

  await new Promise((wait) => setTimeout(wait, FAILED_LOGIN_DELAY_MS))
  send(response, 401, render_login_page(true), 'text/html; charset=utf-8')
}

async function handle_request(request: IncomingMessage, response: ServerResponse, options: WebServerOptions, handlers: ReturnType<typeof create_bridge_handlers>): Promise<void> {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')

  if (pathname === '/login') return handle_login(request, response, options.access_token)
  if (pathname === '/logout') {
    response.writeHead(303, { Location: 'login', 'Set-Cookie': session_cookie(request, '', 0) }).end()
    return
  }

  if (!is_signed_in(request, options.access_token)) {
    // A page load goes to the login page, while a call from a page already open gets a plain refusal it can act on.
    if (pathname.startsWith('/api/')) return send(response, 401, 'sign in first')
    response.writeHead(303, { Location: 'login' }).end()
    return
  }

  if (pathname === '/api/events') return open_event_stream(request, response)
  if (pathname.startsWith('/api/sync/')) return answer_sync_call(request, response, pathname.slice('/api/sync/'.length))
  if (pathname.startsWith('/api/')) return answer_bridge_call(request, response, pathname.slice('/api/'.length), handlers)
  serve_static(response, options.web_folder, pathname)
}

export function create_web_server(options: WebServerOptions): Server {
  const context: BridgeContext = { announce_change_to_all: () => announce_change() }
  const handlers = create_bridge_handlers(context)

  return createServer((request, response) => {
    handle_request(request, response, options, handlers).catch((error: unknown) => {
      console.error(`${request.method} ${request.url} failed:`, error)
      if (!response.headersSent) send(response, 500, error instanceof Error ? error.message : String(error))
      else response.end()
    })
  })
}
