import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { FastifyInstance } from 'fastify'
import { open_task_database } from '../src/main/node_task_database'
import { close_task_database } from '../src/main/task_database'
import { build_app } from '../src/server/app.ts'
import { CLIENT_ID_HEADER, HELLO_EVENT } from '../src/shared/web_api'

// ============================================================================
// Setup
// ============================================================================

const ACCESS_TOKEN = 'open-sesame'
const SESSION_COOKIE = 'x_tasks_session'

let folder: string
let app: FastifyInstance

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-web-server-'))
  const web_folder = join(folder, 'web')
  mkdirSync(join(web_folder, 'assets'), { recursive: true })
  writeFileSync(join(web_folder, 'index.html'), '<!doctype html><title>X-Tasks</title>')
  writeFileSync(join(web_folder, 'assets', 'index-abc123.js'), 'console.log(1)')

  open_task_database(join(folder, 'tasks.db'))
  app = await build_app({ web_folder, access_token: ACCESS_TOKEN })
})

afterAll(async () => {
  await app.close()
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

const bearer = { authorization: `Bearer ${ACCESS_TOKEN}` }

async function sign_in(token: string) {
  return app.inject({ method: 'POST', url: '/login', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `token=${token}` })
}

// ============================================================================
// Sign-in
// ============================================================================

describe('signing in', () => {
  it('sends a browser without a session to the login page', async () => {
    const response = await app.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('login')
  })

  it('refuses an API call without a session in plain words', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/list_tasks' })
    expect(response.statusCode).toBe(401)
    expect(response.body).toBe('sign in first')
  })

  it('shows the login page without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/login' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('Access token')
  })

  it('sets the session cookie on the right token and sends the browser to the page', async () => {
    const response = await sign_in(ACCESS_TOKEN)
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('./')
    const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Strict')

    const page = await app.inject({ method: 'GET', url: '/', cookies: { [SESSION_COOKIE]: cookie!.value } })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('X-Tasks')
  })

  it('shows the login page again with an error on a wrong token', async () => {
    const response = await sign_in('wrong')
    expect(response.statusCode).toBe(401)
    expect(response.body).toContain('not right')
  }, 5000)

  it('clears the session on logout', async () => {
    const response = await app.inject({ method: 'GET', url: '/logout' })
    expect(response.statusCode).toBe(303)
    expect(response.cookies.find((candidate) => candidate.name === SESSION_COOKIE)?.maxAge).toBe(0)
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

  it('refuses a body that is not a JSON array', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/list_tasks', headers: { ...bearer, 'content-type': 'application/json' }, payload: '{"a":1}' })
    expect(response.statusCode).toBe(400)
    expect(response.body).toBe('the body must be a JSON array of arguments')
  })

  it('refuses a call that is not POST and a call that does not exist', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/list_tasks', headers: bearer })).statusCode).toBe(405)
    const missing = await app.inject({ method: 'POST', url: '/api/drop_everything', headers: bearer })
    expect(missing.statusCode).toBe(404)
    expect(missing.body).toBe('no bridge call named drop_everything')
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
    expect(response.body).toBe('changes must be a list of changes')
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
