import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hash_password } from '@x-tech-laboratories/x-libs/server/passwords'
import { file_sync_storage } from '@x-tech-laboratories/x-libs/sync_file_storage'
import { peer_device_header, peer_key_header } from '@x-tech-laboratories/x-libs/sync_protocol'
import { create_identity, decode_pairing_offer, open_sealed, seal } from '@x-tech-laboratories/x-libs/sync_seal'
import type { FastifyInstance } from 'fastify'
import { open_task_database } from '../src/daemon/node_task_database'
import { add_task, close_task_database, list_tasks, open_database } from '../src/shared/task_database'
import { task_sync } from '../src/shared/task_sync'
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
  app = await build_app({ web_folder, declared: new Map([['admin', hash_password(PASSWORD)]]), sync: { storage: file_sync_storage({ file: join(folder, 'sync-peers.json'), back_up_before_replace: () => {} }), address: 'https://tasks.example.org/api/' } })
  await app.ready()
  const { token } = (await app.inject({ method: 'POST', url: '/api/login', payload: { name: 'admin', password: PASSWORD, device: 'tests' } })).json()
  json_headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
})

afterAll(async () => {
  await app.close()
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

// A phone paired with the server, sealing its calls by hand as its sync peer would.
const phone = create_identity()
let server_key = ''
let server_device = ''

async function phone_call(call: string, args: unknown, pairing = false): Promise<{ status: number; answer: { result?: Record<string, unknown>; error?: string } | null }> {
  const sealed = seal({ to: server_device, at: Date.now(), call, args }, undefined, server_key, phone.secret_key)
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream', [peer_device_header]: phone.device }
  if (pairing) headers[peer_key_header] = phone.public_key
  const response = await app.inject({ method: 'POST', url: '/api/sync/peer', headers, payload: Buffer.from(sealed.body) })
  const opened = response.statusCode === 200 ? open_sealed(new Uint8Array(response.rawPayload), server_key, phone.secret_key) : null
  return { status: response.statusCode, answer: (opened?.json as { result?: Record<string, unknown>; error?: string }) ?? null }
}

// A task as a device sends it: one change per cell, the row's presence named _exists.
function task_changes(task_id: string, site: string): unknown[] {
  const cell = (column: string, value: unknown) => ({ table: 'tasks', key: task_id, column, value, ts: 1_700_000_000_000, site })
  return [
    cell('_exists', 1), cell('id', task_id), cell('title', 'Sent by the phone'), cell('is_done', 0), cell('created_at', '2024-01-01T00:00:00.000Z'),
    cell('parent_id', null), cell('position', 1), cell('notes', ''), cell('recurrence', '')
  ]
}

// ============================================================================
// Sync between paired devices
// ============================================================================

describe('sync with the server as a paired device', () => {
  it('refuses a device it does not know, and gives only an admin a pairing code', async () => {
    const stranger = await app.inject({ method: 'POST', url: '/api/sync/peer', headers: { 'content-type': 'application/octet-stream', [peer_device_header]: 'NOBODY' }, payload: Buffer.alloc(64) })
    expect(stranger.statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/sync/create_pairing_code', payload: [] })).statusCode).toBe(401)
  })

  it('pairs a phone through the code, takes its tasks, and runs the task history hook on them', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/sync/create_pairing_code', headers: json_headers, payload: '[]' })
    const offer = decode_pairing_offer((made.json() as { code: string }).code)
    server_key = offer.public_key
    server_device = offer.device
    expect(offer.addresses).toEqual(['https://tasks.example.org/api/'])

    const me = { device: phone.device, public_key: phone.public_key, name: 'Phone', addresses: [], updated_at: 1, removed: false }
    const paired = await phone_call('pair', { secret: offer.secret, me }, true)
    expect(paired.answer?.result?.me).toMatchObject({ device: server_device, name: 'X-Tasks server' })

    const state = task_sync.read_state(open_database())
    const exchange = { site: 'phone-site', generation: 'phone-generation', cursor: { generation: '', seq: 0 }, changes: task_changes('task-from-phone', 'phone-site'), up_to_seq: 1, replaces: false, peers: [] }
    const exchanged = await phone_call('exchange', exchange)
    expect(exchanged.answer?.result).toMatchObject({ generation: state.generation })
    expect(list_tasks().find((task) => task.id === 'task-from-phone')?.title).toBe('Sent by the phone')
    expect(open_database().prepare('SELECT count(*) AS count FROM task_versions_pending').get()).toEqual({ count: 0 })

    const status = (await app.inject({ method: 'POST', url: '/api/sync/get_sync_status', headers: json_headers, payload: '[]' })).json() as { peers: { name: string }[] }
    expect(status.peers.map((peer) => peer.name)).toEqual(['Phone'])
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
      'id', 'site', 'generation', 'server_generation', 'last_seq', 'pushed_seq', 'pulled_seq', 'is_applying', 'device', 'claim_generation'
    ])
    close_task_database()
    open_task_database(join(folder, 'tasks.db'))
  })
})
