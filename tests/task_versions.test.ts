import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  add_tag, add_tag_group, add_task, attach_task_database, close_task_database, link_tasks, list_recent_versions, list_task_versions, list_tasks, move_task, open_database,
  remove_task, restore_task_version, set_task_notes, set_task_title, tag_task
} from '../src/main/task_database'
import { apply_changes } from '../src/main/sync_engine'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => attach_task_database(new DatabaseSync(':memory:'), ':memory:'))
afterEach(() => close_task_database())

function kinds_of(task_id: string): string[] {
  return list_task_versions(task_id).map((version) => version.kind)
}

// ============================================================================
// Recording
// ============================================================================

describe('recording versions', () => {
  it('keeps one version for each change, newest first, with the one before it', () => {
    const task = add_task('Buy milk', null, [], null)
    set_task_title(task.id, 'Buy oat milk')
    set_task_notes(task.id, 'From the corner shop')

    const versions = list_task_versions(task.id)

    expect(versions.map((version) => version.kind)).toEqual(['edited', 'edited', 'created'])
    expect(versions[0]!.snapshot.notes).toBe('From the corner shop')
    expect(versions[0]!.previous?.notes).toBe('')
    expect(versions[1]!.snapshot.title).toBe('Buy oat milk')
    expect(versions[2]!.previous).toBeNull()
  })

  it('leaves out writes that change nothing it keeps, such as reordering', () => {
    const task = add_task('Buy milk', null, [], null)
    set_task_title(task.id, 'Buy milk')
    move_task(task.id, null, 42)

    expect(kinds_of(task.id)).toEqual(['created'])
  })

  it('records tags and links on both tasks of a link', () => {
    const group = add_tag_group('Area', false)
    const tag = add_tag('Home', group.id, null, null, null, null, true)
    const first = add_task('Paint', null, [], null)
    const second = add_task('Buy paint', null, [], null)
    tag_task(first.id, tag.id)
    link_tasks(first.id, second.id, 'waits_on')

    const [latest_first] = list_task_versions(first.id)
    const [latest_second] = list_task_versions(second.id)

    expect(latest_first!.snapshot.tag_ids).toEqual([tag.id])
    expect(latest_first!.snapshot.links).toEqual([{ other_id: second.id, relationship_id: 'waits_on', is_inverse: false }])
    expect(latest_second!.snapshot.links).toEqual([{ other_id: first.id, relationship_id: 'waits_on', is_inverse: true }])
  })

  it('keeps the history of a deleted task and its subtasks', () => {
    const parent = add_task('Move house', null, [], null)
    const child = add_task('Pack books', parent.id, [], null)
    remove_task(parent.id)

    expect(kinds_of(parent.id)).toEqual(['deleted', 'created'])
    expect(kinds_of(child.id)).toEqual(['deleted', 'created'])
    expect(list_task_versions(child.id)[0]!.snapshot.title).toBe('Pack books')
  })

  it('marks changes that arrive by sync as made elsewhere', () => {
    const task = add_task('Buy milk', null, [], null)
    apply_changes(open_database(), [{ table: 'tasks', key: task.id, column: 'title', value: 'Buy bread', ts: Date.now() + 1000, site: 'other' }])

    const [latest] = list_task_versions(task.id)

    expect(latest!.origin).toBe('elsewhere')
    expect(latest!.snapshot.title).toBe('Buy bread')
  })

  it('lists recent versions across every task', () => {
    const first = add_task('First', null, [], null)
    const second = add_task('Second', null, [], null)
    set_task_title(first.id, 'First, renamed')

    expect(list_recent_versions(10).map((version) => [version.task_id, version.kind])).toEqual([
      [first.id, 'edited'],
      [second.id, 'created'],
      [first.id, 'created']
    ])
  })
})

// ============================================================================
// Restoring
// ============================================================================

describe('restoring a version', () => {
  it('adds the restore as a new version and keeps every later one', () => {
    const task = add_task('Buy milk', null, [], null)
    set_task_title(task.id, 'Buy bread')
    set_task_title(task.id, 'Buy eggs')
    const created = list_task_versions(task.id).at(-1)!

    restore_task_version(created.id)
    const versions = list_task_versions(task.id)

    expect(list_tasks()[0]!.title).toBe('Buy milk')
    expect(versions.map((version) => version.kind)).toEqual(['restored', 'edited', 'edited', 'created'])
    expect(versions[0]!.restored_from).toBe(created.id)
  })

  it('brings a deleted task back with its tags, links and the subtasks deleted with it', () => {
    const group = add_tag_group('Area', false)
    const tag = add_tag('Home', group.id, null, null, null, null, true)
    const parent = add_task('Move house', null, [tag.id], null)
    const child = add_task('Pack books', parent.id, [], null)
    const other = add_task('Hire a van', null, [], null)
    link_tasks(parent.id, other.id, 'waits_on')
    remove_task(parent.id)

    restore_task_version(list_task_versions(parent.id)[0]!.id)
    const restored = new Map(list_tasks().map((task) => [task.id, task]))

    expect(restored.get(parent.id)?.tag_ids).toEqual([tag.id])
    expect(restored.get(parent.id)?.links).toEqual([{ other_id: other.id, relationship_id: 'waits_on' }])
    expect(restored.get(child.id)?.parent_id).toBe(parent.id)
    expect(kinds_of(parent.id)[0]).toBe('restored')
    expect(kinds_of(child.id)[0]).toBe('restored')
  })

  it('keeps the current parent when the old one now sits below the task', () => {
    const first = add_task('First', null, [], null)
    const second = add_task('Second', first.id, [], null)
    move_task(second.id, null, 5)
    move_task(first.id, second.id, 6)
    const second_under_first = list_task_versions(second.id).at(-1)!

    restore_task_version(second_under_first.id)

    expect(list_tasks().find((task) => task.id === second.id)?.parent_id).toBeNull()
  })
})
