import { DatabaseSync } from 'node:sqlite'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { create_mcp_server } from '../src/daemon/mcp_server'
import { EMPTY_RULE } from '../src/shared/tasks'
import { add_tag, add_tag_group, add_task, attach_task_database, close_task_database, list_tag_groups, list_tags, list_tasks, tag_task } from '../src/shared/task_database'

// ============================================================================
// Setup
// ============================================================================

let client: Client
let on_change: ReturnType<typeof vi.fn<() => void>>

beforeEach(async () => {
  attach_task_database(new DatabaseSync(':memory:'), ':memory:')
  on_change = vi.fn<() => void>()
  const [client_side, server_side] = InMemoryTransport.createLinkedPair()
  await create_mcp_server(on_change).connect(server_side)
  client = new Client({ name: 'test', version: '1' })
  await client.connect(client_side)
})

afterEach(async () => {
  await client.close()
  close_task_database()
})

async function call(name: string, args: Record<string, unknown>): Promise<{ is_error: boolean; text: string; value: any }> {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
  const text = result.content[0]!.text
  return { is_error: result.isError === true, text, value: result.isError ? null : JSON.parse(text) }
}

// ============================================================================
// Tag groups
// ============================================================================

describe('tag group tools', () => {
  it('adds a group, one tag per task when asked', async () => {
    const { value } = await call('add_tag_group', { name: 'Phase', is_single_choice: true })

    expect(value).toMatchObject({ name: 'Phase', is_single_choice: true, is_rule: false })
    expect(list_tag_groups().find((group) => group.id === value.id)?.is_single_choice).toBe(true)
    expect(on_change).toHaveBeenCalled()
  })

  it('adds a group that allows several tags by default', async () => {
    const { value } = await call('add_tag_group', { name: 'Context' })

    expect(value.is_single_choice).toBe(false)
  })

  it('renames a group and keeps what was left out', async () => {
    const group = add_tag_group('Phse', false)
    await call('update_tag_group', { group_id: group.id, is_single_choice: true })

    const { value } = await call('update_tag_group', { group_id: group.id, name: 'Phase' })

    expect(value).toMatchObject({ name: 'Phase', is_single_choice: true })
  })

  it('refuses to limit a rule group to one tag', async () => {
    const group = add_tag_group('Filters', true)

    const { is_error, text } = await call('update_tag_group', { group_id: group.id, is_single_choice: true })

    expect(is_error).toBe(true)
    expect(text).toContain('rule group')
  })

  it('removes a group with its tags, leaving the tasks', async () => {
    const group = add_tag_group('Phase', false)
    const tag = add_tag('Now', group.id, null, null, null, null, true)
    const task = add_task('Pay rent', null, [], null)
    tag_task(task.id, tag.id)

    const { value } = await call('remove_tag_group', { group_id: group.id })

    expect(value).toEqual({ removed: 'Phase' })
    expect(list_tags().some((each) => each.id === tag.id)).toBe(false)
    expect(list_tasks().find((each) => each.id === task.id)?.tag_ids).toEqual([])
  })

  it('reports an unknown group', async () => {
    const { is_error, text } = await call('remove_tag_group', { group_id: 'missing' })

    expect(is_error).toBe(true)
    expect(text).toContain('no tag group with id missing')
  })
})

// ============================================================================
// Tags
// ============================================================================

describe('tag tools', () => {
  it('adds a tag and a sub-tag with a colour', async () => {
    const group = add_tag_group('Phase', false)

    const parent = (await call('add_tag', { group_id: group.id, name: 'Long term', color: '#ff00ff' })).value
    const child = (await call('add_tag', { group_id: group.id, name: 'Retirement', parent_id: parent.id })).value

    expect(parent).toMatchObject({ name: 'Long term', group_id: group.id, parent_id: null, color: '#ff00ff', is_rule_tag: false })
    expect(child).toMatchObject({ name: 'Retirement', parent_id: parent.id, color: null })
  })

  it('refuses a tag in a rule group', async () => {
    const group = add_tag_group('Filters', true)

    const { is_error, text } = await call('add_tag', { group_id: group.id, name: 'Late' })

    expect(is_error).toBe(true)
    expect(text).toContain('rule group')
  })

  it('refuses a parent from another group', async () => {
    const phase = add_tag_group('Phase', false)
    const area = add_tag_group('Area', false)
    const home = add_tag('Home', area.id, null, null, null, null, true)

    const { is_error, text } = await call('add_tag', { group_id: phase.id, name: 'Now', parent_id: home.id })

    expect(is_error).toBe(true)
    expect(text).toContain('another group')
  })

  it('refuses a colour that is not #rrggbb', async () => {
    const group = add_tag_group('Phase', false)

    const { is_error } = await call('add_tag', { group_id: group.id, name: 'Now', color: 'red' })

    expect(is_error).toBe(true)
  })

  it('updates a tag, keeping fields left out and clearing ones set to null', async () => {
    const group = add_tag_group('Phase', false)
    const tag = add_tag('Nw', group.id, null, null, '#00ff00', 'clock', true)

    const { value } = await call('update_tag', { tag_id: tag.id, name: 'Now', icon: null })

    expect(value).toMatchObject({ name: 'Now', color: '#00ff00', icon: null })
  })

  it("keeps a rule tag's rule when renaming it", async () => {
    const group = add_tag_group('Filters', true)
    const tag = add_tag('Late', group.id, null, EMPTY_RULE, null, null, true)

    const { value } = await call('update_tag', { tag_id: tag.id, name: 'Overdue' })

    expect(value).toMatchObject({ name: 'Overdue', is_rule_tag: true })
    expect(list_tags().find((each) => each.id === tag.id)?.rule).toEqual(EMPTY_RULE)
  })

  it('removes a tag', async () => {
    const group = add_tag_group('Phase', false)
    const tag = add_tag('Now', group.id, null, null, null, null, true)

    const { value } = await call('remove_tag', { tag_id: tag.id })

    expect(value).toEqual({ removed: 'Now' })
    expect(list_tags().some((each) => each.id === tag.id)).toBe(false)
  })

  it('reports an unknown tag', async () => {
    const { is_error, text } = await call('update_tag', { tag_id: 'missing', name: 'x' })

    expect(is_error).toBe(true)
    expect(text).toContain('no tag with id missing')
  })
})
