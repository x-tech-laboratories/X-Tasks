import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hash_password } from '@x-tech-laboratories/x-libs/server/passwords'
import type { FastifyInstance } from 'fastify'
import { open_task_database } from '../src/main/node_task_database'
import { add_task, close_task_database, list_tasks, open_database } from '../src/main/task_database'
import { task_sync } from '../src/main/task_sync'
import { build_app } from '../src/server/app.ts'

// ============================================================================
// Setup
// ============================================================================

// Every test runs on a database in a fresh temporary folder, never the user's own.
const PASSWORD = 'a long enough password'
// A signed-in device's token, with the body's type.
let json_headers: Record<string, string>

let folder: string
let app: FastifyInstance

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-sync-wire-'))
  const web_folder = join(folder, 'web')
  mkdirSync(web_folder, { recursive: true })
  writeFileSync(join(web_folder, 'index.html'), '<!doctype html><title>X-Tasks</title>')

  open_task_database(join(folder, 'tasks.db'))
  app = await build_app({ web_folder, declared: new Map([['admin', hash_password(PASSWORD)]]) })
  const { token } = (await app.inject({ method: 'POST', url: '/api/login', payload: { name: 'admin', password: PASSWORD, device: 'tests' } })).json()
  json_headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
})

afterAll(async () => {
  await app.close()
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

function server_generation(): string {
  return task_sync.read_state(open_database()).generation
}

// A task as a device built before the move to X-Libs sent it: one change per cell, the row's presence named _exists.
function old_client_task_changes(task_id: string, site: string): unknown[] {
  const cell = (column: string, value: unknown) => ({ table: 'tasks', key: task_id, column, value, ts: 1_700_000_000_000, site })
  return [
    cell('_exists', 1), cell('id', task_id), cell('title', 'Sent by an older build'), cell('is_done', 0), cell('created_at', '2024-01-01T00:00:00.000Z'),
    cell('parent_id', null), cell('position', 1), cell('notes', ''), cell('recurrence', '')
  ]
}

// ============================================================================
// Wire format
// ============================================================================

describe('the sync wire format', () => {
  it('answers an exchange from an older build with the same fields, and applies its changes', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: json_headers,
      payload: JSON.stringify({ site: 'old-laptop', generation: server_generation(), cursor: 0, changes: old_client_task_changes('task-from-old', 'old-laptop') })
    })

    expect(response.statusCode).toBe(200)
    const answer = response.json() as { generation: string; cursor: number; changes: Record<string, unknown>[] }
    expect(Object.keys(answer).sort()).toEqual(['changes', 'cursor', 'generation'])
    expect(answer.generation).toBe(server_generation())
    expect(answer.cursor).toBe(task_sync.read_state(open_database()).last_seq)
    // The sender hears nothing of its own changes back.
    expect(answer.changes.filter((change) => change.site === 'old-laptop')).toEqual([])
    for (const change of answer.changes) expect(Object.keys(change).sort()).toEqual(['column', 'key', 'site', 'table', 'ts', 'value'])
    expect(list_tasks().find((task) => task.id === 'task-from-old')?.title).toBe('Sent by an older build')
  })

  it('passes those changes on to another device in the same shape', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: json_headers,
      payload: JSON.stringify({ site: 'phone', generation: server_generation(), cursor: 0, changes: [] })
    })

    expect(response.statusCode).toBe(200)
    const changes = (response.json() as { changes: { table: string; key: string; column: string; value: unknown; site: string }[] }).changes
    expect(changes).toContainEqual(expect.objectContaining({ table: 'tasks', key: 'task-from-old', column: '_exists', value: 1, site: 'old-laptop', ts: 1_700_000_000_000 }))
    expect(changes).toContainEqual(expect.objectContaining({ table: 'tasks', key: 'task-from-old', column: 'title', value: 'Sent by an older build' }))
  })

  it('answers 409 with the server generation when the device follows replaced data', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: json_headers,
      payload: JSON.stringify({ site: 'phone', generation: 'replaced-long-ago', cursor: 0, changes: [] })
    })

    expect(response.statusCode).toBe(409)
    expect(response.body).toBe(`the server's data is now generation ${server_generation()}`)
  })

  it('runs the task history hook when the server applies changes from a device', async () => {
    await app.inject({
      method: 'POST', url: '/api/sync/exchange', headers: json_headers,
      payload: JSON.stringify({ site: 'tablet', generation: server_generation(), cursor: 0, changes: old_client_task_changes('task-from-tablet', 'tablet') })
    })

    expect(open_database().prepare('SELECT count(*) AS count FROM task_versions_pending').get()).toEqual({ count: 0 })
  })

  it('serves the snapshot and takes a replace at the same paths, starting a new generation', async () => {
    const snapshot = await app.inject({ method: 'GET', url: '/api/sync/snapshot', headers: json_headers })
    expect(snapshot.statusCode).toBe(200)
    expect(Object.keys(snapshot.json()).sort()).toEqual(['changes', 'cursor', 'generation'])

    const before = server_generation()
    const replace = await app.inject({
      method: 'POST', url: '/api/sync/replace', headers: json_headers, payload: JSON.stringify({ changes: snapshot.json().changes })
    })
    expect(replace.statusCode).toBe(200)
    expect(Object.keys(replace.json()).sort()).toEqual(['cursor', 'generation'])
    expect(replace.json().generation).not.toBe(before)
    expect(replace.json().generation).toBe(server_generation())
  })
})

// ============================================================================
// Stored format
// ============================================================================

describe('the stored sync state', () => {
  it('keeps the device id, generation and cell versions of an existing database when it is opened again', () => {
    const path = join(folder, 'reopened.db')
    close_task_database()
    open_task_database(path)
    add_task('Kept', null, [], null)
    const state = task_sync.read_state(open_database())
    const cells = open_database().prepare('SELECT * FROM sync_cells ORDER BY table_name, row_key, column_name').all()
    close_task_database()

    open_task_database(path)
    expect(task_sync.read_state(open_database())).toEqual(state)
    expect(open_database().prepare('SELECT * FROM sync_cells ORDER BY table_name, row_key, column_name').all()).toEqual(cells)
    expect(open_database().prepare('PRAGMA table_info(sync_state)').all().map((column) => (column as { name: string }).name)).toEqual([
      'id', 'site', 'generation', 'server_generation', 'last_seq', 'pushed_seq', 'pulled_seq', 'is_applying'
    ])
    close_task_database()
    open_task_database(join(folder, 'tasks.db'))
  })
})
