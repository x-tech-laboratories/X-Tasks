import { DatabaseSync } from 'node:sqlite'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { item_link, item_text_max_bytes, type ItemChange } from '@x-tech-laboratories/x-libs/items'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { create_mcp_server } from '../src/daemon/mcp_server'
import {
  add_tag, add_tag_group, add_task, attach_task_database, close_task_database, remove_task, set_task_done, set_task_notes, set_task_schedule, set_task_title, tag_task
} from '../src/shared/task_database'
import { plain_notes, task_item_methods as items } from '../src/shared/task_items'
import { task_id_from_link, task_link } from '../src/shared/tasks'

// ============================================================================
// Setup
// ============================================================================

let now = Date.parse('2026-11-20T10:00:00.000Z')

// Each write lands a second after the one before, so the order of changes is known.
function tick(): void {
  now += 1000
  vi.setSystemTime(now)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  attach_task_database(new DatabaseSync(':memory:'), ':memory:')
})

afterEach(() => {
  close_task_database()
  vi.useRealTimers()
})

function add(title: string, notes = ''): string {
  tick()
  const task = add_task(title, null, [], null)
  if (notes) set_task_notes(task.id, notes)
  return task.id
}

// ============================================================================
// Kinds and getting
// ============================================================================

describe('list_item_kinds', () => {
  it('names tasks', async () => {
    expect(await items.list_item_kinds()).toEqual([{ kind: 'task', label: 'Task', has_text: true }])
  })
})

describe('get_items', () => {
  it('gives each task as an item with its link, snippet, status and facts, leaving out ids that are gone', async () => {
    const group = add_tag_group('Area', false)
    const tag = add_tag('Home', group.id, null, null, null, null, true)
    const parent_id = add('Garden')
    tick()
    const task = add_task('Water the plants', parent_id, [], null)
    set_task_notes(task.id, '## Before\n\n- [ ] use **rain** water, see [the guide](https://example.org)')
    set_task_schedule(task.id, { start_at: null, due_at: '2026-11-21', recurrence: 'FREQ=WEEKLY' })
    tag_task(task.id, tag.id)
    tick()
    set_task_done(task.id, true, new Date(now).toISOString(), { kind: 'add', occurrence_on: null })

    const [item, ...rest] = await items.get_items([task.id, 'gone'])

    expect(rest).toEqual([])
    expect(item).toEqual({
      id: task.id,
      kind: 'task',
      title: 'Water the plants',
      snippet: 'Before use rain water, see the guide',
      link: `x-tasks://task/${task.id}`,
      status: 'done',
      changed_at: new Date(now).toISOString(),
      detail: { due: '2026-11-21', repeats: 'FREQ=WEEKLY', done_at: new Date(now).toISOString(), parent: 'Garden', tags: 'Home' }
    })
  })

  it('gives an open task an empty status and no facts it lacks', async () => {
    const id = add('Call the bank')
    const [item] = await items.get_items([id])
    expect(item).toMatchObject({ status: '', snippet: '', detail: {} })
  })
})

describe('get_item_texts', () => {
  it("gives a task's whole notes as Markdown, leaving out tasks with no notes and ids that are gone", async () => {
    const notes = '# Plan\n\n- [ ] buy **milk**\n\n' + 'more '.repeat(100)
    const with_notes = add('Shop', notes)
    const without = add('Empty')
    const gone = add('Gone', 'soon gone')
    tick()
    remove_task(gone)

    const texts = await items.get_item_texts([with_notes, without, gone, 'unknown'])
    expect(texts).toEqual([{ id: with_notes, text: notes, format: 'markdown', changed_at: expect.any(String), is_truncated: false }])
    const [item] = await items.get_items([with_notes])
    expect(texts[0]!.changed_at).toBe(item!.changed_at)
  })

  it('cuts notes longer than the cap and marks them cut', async () => {
    const id = add('Long', 'ü'.repeat(item_text_max_bytes))
    const [text] = await items.get_item_texts([id])
    expect(text!.is_truncated).toBe(true)
    expect(new TextEncoder().encode(text!.text).length).toBe(item_text_max_bytes)
    await expect(items.get_item_texts(Array.from({ length: 101 }, (_, index) => `id${index}`))).rejects.toThrow('at most 100 ids')
  })
})

describe('plain_notes', () => {
  it('drops Markdown marks and code fences', () => {
    expect(plain_notes('```\nkeep this\n```\n> quoted *a* `b`\n1. one\n* two')).toBe('keep this quoted *a* b one two')
  })
})

// ============================================================================
// Searching
// ============================================================================

describe('search_items', () => {
  it('ranks the title above the notes, a title that starts with the text above one holding it, and finds done tasks', async () => {
    const in_notes = add('Groceries', 'remember the milk')
    const holding = add('Buy milk for the cat')
    const starting = add('Milk run')
    const done = add('Milk')
    set_task_done(done, true, new Date(now).toISOString(), { kind: 'add', occurrence_on: null })
    add('Unrelated')

    const found = await items.search_items('milk')

    expect(found.map((item) => item.id)).toEqual([done, starting, holding, in_notes])
    expect(found[0]!.status).toBe('done')
  })

  it('needs every word, in the title or the notes, and ignores case and accents', async () => {
    const both = add('Café visit', 'with Ana')
    add('Café alone')

    expect((await items.search_items('CAFE ana')).map((item) => item.id)).toEqual([both])
  })

  it('puts open tasks before done ones that match as well, and keeps to the limit', async () => {
    const done = add('Pay rent')
    set_task_done(done, true, new Date(now).toISOString(), { kind: 'add', occurrence_on: null })
    const open = add('Pay rent')
    add('Pay rent')

    const found = await items.search_items('pay rent', 2)

    expect(found).toHaveLength(2)
    expect(found.map((item) => item.id)).not.toContain(done)
    expect(found[1]!.id).toBe(open)
  })

  it('finds nothing for empty text', async () => {
    add('Anything')
    expect(await items.search_items('   ')).toEqual([])
  })
})

// ============================================================================
// Changes
// ============================================================================

describe('list_item_changes', () => {
  it('lists changed tasks oldest first, each once as it is now, and a deleted one as gone', async () => {
    const first = add('First')
    const second = add('Second')
    tick()
    set_task_title(first, 'First, renamed')
    tick()
    remove_task(second)

    const changes = await items.list_item_changes(null)

    expect(changes.map((change) => [change.id, change.is_deleted])).toEqual([
      [first, false],
      [second, true]
    ])
    expect(changes[0]).toMatchObject({ title: 'First, renamed', link: task_link(first) })
    expect(changes[1]).toEqual({ id: second, kind: 'task', is_deleted: true, changed_at: new Date(now).toISOString() })
  })

  it('goes on from the last changed_at without missing or repeating a change', async () => {
    const ids = ['One', 'Two', 'Three', 'Four', 'Five'].map((title) => add(title))
    // Two tasks changed at the same moment, which a page boundary must not split.
    tick()
    set_task_title(ids[1]!, 'Two, again')
    set_task_title(ids[3]!, 'Four, again')
    tick()
    remove_task(ids[0]!)

    const seen: ItemChange[] = []
    let since: string | null = null
    for (let page = 0; page < 10; page++) {
      const changes = await items.list_item_changes(since, 1)
      if (changes.length === 0) break
      seen.push(...changes)
      since = changes.at(-1)!.changed_at
    }

    const order = seen.map((change) => change.id)
    expect(order.slice(0, 2)).toEqual([ids[2], ids[4]])
    expect(new Set(order.slice(2, 4))).toEqual(new Set([ids[1], ids[3]]))
    expect(order[4]).toBe(ids[0])
    expect(new Set(seen.map((change) => change.id)).size).toBe(seen.length)
    expect(seen.at(-1)).toMatchObject({ id: ids[0], is_deleted: true })

    tick()
    set_task_title(ids[2]!, 'Three, later')
    expect((await items.list_item_changes(since)).map((change) => change.id)).toEqual([ids[2]])
  })
})

// ============================================================================
// Links
// ============================================================================

describe('task links', () => {
  it('reads links that X-Libs builds, with the id percent-encoded', () => {
    expect(task_id_from_link(item_link('x-tasks', 'task', 'a/1 b'))).toBe('a/1 b')
    expect(task_id_from_link(task_link('5f0c-91'))).toBe('5f0c-91')
  })

  it('reads an older link with a slash after the id, and refuses other links', () => {
    expect(task_id_from_link('x-tasks://task/abc/')).toBe('abc')
    expect(task_id_from_link('X-TASKS://TASK/abc')).toBe('abc')
    expect(task_id_from_link('x-notes://task/abc')).toBeNull()
    expect(task_id_from_link('x-tasks://tag/abc')).toBeNull()
    expect(task_id_from_link('--daemon')).toBeNull()
  })
})

// ============================================================================
// Over MCP
// ============================================================================

describe('item tools over MCP', () => {
  let client: Client

  beforeEach(async () => {
    const [client_side, server_side] = InMemoryTransport.createLinkedPair()
    await create_mcp_server(() => {}).connect(server_side)
    client = new Client({ name: 'test', version: '1' })
    await client.connect(client_side)
  })

  afterEach(() => client.close())

  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
    if (result.isError) throw new Error(result.content[0]!.text)
    return JSON.parse(result.content[0]!.text)
  }

  it('offers the five calls as read-only tools beside the existing ones', async () => {
    const { tools } = await client.listTools()
    const by_name = new Map(tools.map((tool) => [tool.name, tool]))

    for (const name of ['list_item_kinds', 'search_items', 'get_items', 'list_item_changes', 'get_item_texts']) expect(by_name.get(name)?.annotations?.readOnlyHint).toBe(true)
    expect(by_name.has('list_tasks')).toBe(true)
  })

  it('answers each call as the shared methods do', async () => {
    const id = add('Fix the bike', 'new chain')

    expect(await call('list_item_kinds', {})).toEqual([{ kind: 'task', label: 'Task', has_text: true }])
    expect(await call('search_items', { query: 'chain' })).toMatchObject([{ id, snippet: 'new chain' }])
    expect(await call('get_items', { ids: [id] })).toMatchObject([{ id, title: 'Fix the bike' }])
    expect(await call('list_item_changes', { since: '2000-01-01T00:00:00Z', limit: 5 })).toMatchObject([{ id, is_deleted: false }])
    await expect(call('list_item_changes', { since: 'yesterday' })).rejects.toThrow()
    expect(await call('get_item_texts', { ids: [id] })).toMatchObject([{ id, text: 'new chain', format: 'markdown', is_truncated: false }])
  })
})
