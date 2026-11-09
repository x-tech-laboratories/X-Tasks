import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { open_task_database } from '../src/main/node_task_database'
import { add_task, close_task_database, list_tasks, set_task_notes, wrap_notes_in_code_blocks } from '../src/main/task_database'

// ============================================================================
// Setup
// ============================================================================

let folder: string
let path: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-notes-migration-'))
  path = join(folder, 'tasks.db')
})

afterEach(() => {
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

// Writes notes the way the build before Markdown notes kept them, then runs the upgrade that wraps them.
function upgrade_with_plain_notes(notes: string[]): string[] {
  open_task_database(path)
  const ids = notes.map((note, index) => {
    const task = add_task(`Task ${index}`, null, [], null)
    set_task_notes(task.id, note)
    return task.id
  })
  close_task_database()

  const raw = new DatabaseSync(path)
  wrap_notes_in_code_blocks(raw)
  raw.close()

  open_task_database(path)
  const by_id = new Map(list_tasks().map((task) => [task.id, task.notes]))
  return ids.map((id) => by_id.get(id)!)
}

// ============================================================================
// Wrapping plain notes
// ============================================================================

it('puts each plain note in a code block that keeps every character', () => {
  const notes = ['* not a list\n# not a heading\n  indented <b>tag</b>\n', 'has ``` inside']

  const upgraded = upgrade_with_plain_notes(notes)

  expect(upgraded).toEqual(['```\n* not a list\n# not a heading\n  indented <b>tag</b>\n\n```', '````\nhas ``` inside\n````'])
})

it('leaves empty notes empty', () => {
  expect(upgrade_with_plain_notes([''])).toEqual([''])
})
