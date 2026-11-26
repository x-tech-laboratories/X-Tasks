import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hash_password } from '@x-tech-laboratories/x-libs/server/passwords'
import type { FastifyInstance } from 'fastify'
import { open_task_database } from '../src/daemon/node_task_database'
import { close_task_database } from '../src/shared/task_database'
import { build_app } from '../src/server/app.ts'
import { CLIENT_ID_HEADER, HELLO_EVENT } from '../src/shared/web_api'

// ============================================================================
// Setup
// ============================================================================

const PASSWORD = 'a long enough password'
const SESSION_COOKIE = 'x_tasks_session'

let folder: string
let app: FastifyInstance
// The token a signed-in device sends.
let bearer: { authorization: string }

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-web-server-'))
  const web_folder = join(folder, 'web')
  mkdirSync(join(web_folder, 'assets'), { recursive: true })
  writeFileSync(join(web_folder, 'index.html'), '<!doctype html><title>X-Tasks</title>')
  writeFileSync(join(web_folder, 'assets', 'index-abc123.js'), 'console.log(1)')

  open_task_database(join(folder, 'tasks.db'))
  app = await build_app({ web_folder, declared: new Map([['admin', hash_password(PASSWORD)]]) })
  const { token } = (await sign_in({ name: 'admin', password: PASSWORD, device: 'tests' })).json()
  bearer = { authorization: `Bearer ${token}` }
})

afterAll(async () => {
  await app.close()
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

async function sign_in(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/login', payload: body })
}

// ============================================================================
// Sign-in
// ============================================================================

describe('signing in', () => {
  it('serves the page without a session, which signs in itself', async () => {
    const response = await app.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('X-Tasks')
  })

  it('refuses an API call without a session in plain words', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/list_tasks' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'Sign in first.' })
  })

  it('sets a session cookie that ends with the browser on the right password', async () => {
    const response = await sign_in({ name: 'admin', password: PASSWORD })
    expect(response.statusCode).toBe(204)
    const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Strict')
    expect(cookie?.maxAge).toBeUndefined()

    const me = await app.inject({ method: 'GET', url: '/api/me', cookies: { [SESSION_COOKIE]: cookie!.value } })
    expect(me.json()).toMatchObject({ name: 'admin', role: 'admin' })
  })

  it('refuses a wrong password', async () => {
    const response = await sign_in({ name: 'admin', password: 'wrong' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'Wrong name or password.' })
  })

  it('ends the session on signing out', async () => {
    const cookie = (await sign_in({ name: 'admin', password: PASSWORD })).cookies.find((candidate) => candidate.name === SESSION_COOKIE)!
    await app.inject({ method: 'POST', url: '/api/logout', cookies: { [SESSION_COOKIE]: cookie.value } })
    expect((await app.inject({ method: 'GET', url: '/api/me', cookies: { [SESSION_COOKIE]: cookie.value } })).statusCode).toBe(401)
  })
})

// ============================================================================
// Bridge calls
// ============================================================================

describe('bridge calls', () => {
  it('answers a call made with the bearer token', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/list_tasks', headers: { ...bearer, 'content-type': 'application/json' }, payload: '[]' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('takes an empty body as no arguments', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/list_tags', headers: { ...bearer, 'content-type': 'application/json' } })
    expect(response.statusCode).toBe(200)
    expect(Array.isArray(response.json())).toBe(true)
  })

  it('runs a call with arguments and answers with its result', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/add_task', headers: { ...bearer, 'content-type': 'application/json' }, payload: JSON.stringify(['Water the plants', null, [], null])
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ title: 'Water the plants' })
  })

  it('refuses a body that is neither a JSON list nor an object, and names it does not know', async () => {
    const text = await app.inject({ method: 'POST', url: '/api/list_tasks', headers: { ...bearer, 'content-type': 'application/json' }, payload: '"a"' })
    expect(text.statusCode).toBe(400)
    expect(text.body).toBe('send the arguments as a JSON list or object')
    const unknown = await app.inject({ method: 'POST', url: '/api/list_tasks', headers: { ...bearer, 'content-type': 'application/json' }, payload: '{"a":1}' })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.body).toBe('unknown argument a')
  })

  it('refuses a call that is not POST and a call that does not exist', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/list_tasks', headers: bearer })).statusCode).toBe(404)
    const missing = await app.inject({ method: 'POST', url: '/api/drop_everything', headers: bearer })
    expect(missing.statusCode).toBe(404)
    expect(missing.body).toBe('no call named drop_everything')
  })

  it('answers a preflight check from another origin without a token', async () => {
    const response = await app.inject({
      method: 'OPTIONS', url: '/api/list_tasks', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': CLIENT_ID_HEADER }
    })
    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('*')
    expect(response.headers['access-control-allow-headers']).toContain(CLIENT_ID_HEADER)
  })
})

// ============================================================================
// Item calls
// ============================================================================

describe('item calls', () => {
  // A throwaway token made on the account page for a program, read-only.
  async function read_only_token(): Promise<{ authorization: string }> {
    const cookie = (await sign_in({ name: 'admin', password: PASSWORD })).cookies.find((candidate) => candidate.name === SESSION_COOKIE)!
    const response = await app.inject({ method: 'POST', url: '/api/account/tokens', cookies: { [SESSION_COOKIE]: cookie.value }, payload: { name: 'reader', read_only: true } })
    expect(response.statusCode).toBe(201)
    return { authorization: `Bearer ${response.json().token}` }
  }

  async function post(headers: Record<string, string>, method: string, args: unknown[]) {
    return app.inject({ method: 'POST', url: `/api/${method}`, headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(args) })
  }

  it('answers the four calls to a read-only token and refuses it a change', async () => {
    await post(bearer, 'add_task', ['Read the item calls', null, [], null])
    const reader = await read_only_token()

    expect((await post(reader, 'list_item_kinds', [])).json()).toEqual([{ kind: 'task', label: 'Task' }])
    const [found] = (await post(reader, 'search_items', ['item calls'])).json()
    expect(found).toMatchObject({ kind: 'task', title: 'Read the item calls', link: `x-tasks://task/${found.id}` })
    expect((await post(reader, 'get_items', [[found.id]])).json()).toEqual([found])
    expect((await post(reader, 'list_item_changes', [null, 100])).json().map((change: { id: string }) => change.id)).toContain(found.id)
    expect((await post(reader, 'list_tasks', [])).statusCode).toBe(200)

    const refused = await post(reader, 'add_task', ['Not allowed', null, [], null])
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ error: 'This token can only read.' })
  })
})

// ============================================================================
// The standard path and the older one
// ============================================================================

describe('call paths', () => {
  async function post(path: string, headers: Record<string, string>, body: unknown) {
    return app.inject({ method: 'POST', url: path, headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(body) })
  }

  async function reader_token(): Promise<{ authorization: string }> {
    const cookie = (await sign_in({ name: 'admin', password: PASSWORD })).cookies.find((candidate) => candidate.name === SESSION_COOKIE)!
    const response = await app.inject({ method: 'POST', url: '/api/account/tokens', cookies: { [SESSION_COOKIE]: cookie.value }, payload: { name: 'path reader', read_only: true } })
    return { authorization: `Bearer ${response.json().token}` }
  }

  it.each(['/api/call/', '/api/'])('answers at %s with the arguments as a list or by name', async (prefix) => {
    const listed = await post(`${prefix}add_task`, bearer, [`Listed at ${prefix}`, null, [], null])
    expect(listed.statusCode).toBe(200)
    const named = await post(`${prefix}add_task`, bearer, { title: `Named at ${prefix}`, parent_id: null, tag_ids: [], my_day_on: null })
    expect(named.statusCode).toBe(200)
    const task_id = named.json().id as string

    expect((await post(`${prefix}set_task_title`, bearer, { task_id, title: `Renamed at ${prefix}` })).statusCode).toBe(204)
    const titles = (await post(`${prefix}list_tasks`, bearer, {})).json().map((task: { title: string }) => task.title)
    expect(titles).toEqual(expect.arrayContaining([`Listed at ${prefix}`, `Renamed at ${prefix}`]))

    const missing = await post(`${prefix}set_task_title`, bearer, { task_id })
    expect(missing.statusCode).toBe(400)
    expect(missing.body).toBe('missing argument title')
  })

  it('takes the item calls by name too', async () => {
    const response = await post('/api/call/search_items', bearer, { query: 'Renamed at' })
    expect(response.statusCode).toBe(200)
    expect(response.json().length).toBeGreaterThan(0)
  })

  it.each(['/api/call/', '/api/'])('lets a read-only token read at %s in both forms and refuses it a change', async (prefix) => {
    const reader = await reader_token()
    expect((await post(`${prefix}list_tasks`, reader, [])).statusCode).toBe(200)
    expect((await post(`${prefix}list_tags`, reader, {})).statusCode).toBe(200)
    expect((await post(`${prefix}get_items`, reader, { ids: [] })).statusCode).toBe(200)

    expect((await post(`${prefix}add_task`, reader, ['Not allowed', null, [], null])).statusCode).toBe(403)
    const named = await post(`${prefix}add_task`, reader, { title: 'Not allowed', parent_id: null, tag_ids: [], my_day_on: null })
    expect(named.statusCode).toBe(403)
    expect(named.json()).toEqual({ error: 'This token can only read.' })
  })
})

// ============================================================================
// Sync calls
// ============================================================================

describe('sync calls', () => {
  it('gives the snapshot on GET', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sync/snapshot', headers: bearer })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ generation: expect.any(String), changes: expect.any(Array) })
  })

  it('refuses an exchange whose changes are not a list', async () => {
    const snapshot = await app.inject({ method: 'GET', url: '/api/sync/snapshot', headers: bearer })
    const response = await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: { ...bearer, 'content-type': 'application/json' },
      payload: JSON.stringify({ generation: snapshot.json().generation, cursor: 0, site: 'phone', changes: 'nope' })
    })
    expect(response.statusCode).toBe(400)
    expect(response.body).toBe('send site, generation, cursor and a list of changes')
  })

  it('answers 409 when the device follows another generation', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: { ...bearer, 'content-type': 'application/json' },
      payload: JSON.stringify({ generation: 'stale', cursor: 0, site: 'phone', changes: [] })
    })
    expect(response.statusCode).toBe(409)
  })
})

// ============================================================================
// Static files and events
// ============================================================================

describe('the page and its events', () => {
  it('serves hashed assets as immutable and the page as never cached', async () => {
    const asset = await app.inject({ method: 'GET', url: '/assets/index-abc123.js', headers: bearer })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const page = await app.inject({ method: 'GET', url: '/index.html', headers: bearer })
    expect(page.headers['cache-control']).toBe('no-cache')
    expect((await app.inject({ method: 'GET', url: '/missing.txt', headers: bearer })).statusCode).toBe(404)
  })

  it('greets a new event stream with its client id', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const controller = new AbortController()
    const response = await fetch(`${address}/api/events`, { headers: bearer, signal: controller.signal })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    const first_chunk = new TextDecoder().decode((await reader.read()).value)
    expect(first_chunk).toContain(`event: ${HELLO_EVENT}`)
    controller.abort()
  })
})
