import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { create_backup, list_backups, restore_backup } from '../src/main/database_backups'
import { open_task_database } from '../src/main/node_task_database'
import { add_task, close_task_database, list_tasks, open_database } from '../src/main/task_database'
import { task_sync } from '../src/main/task_sync'

// ============================================================================
// Setup
// ============================================================================

let folder: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-backups-'))
  open_task_database(join(folder, 'tasks.db'))
})

afterEach(() => {
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

// ============================================================================
// Backups
// ============================================================================

it('restores a backup in place of the current tasks, after backing those up, and starts sync over', async () => {
  add_task('Before', null, [], null)
  const before = await create_backup()
  add_task('After', null, [], null)
  task_sync.write_state(open_database(), { server_generation: 'from-the-server' })

  // A backup taken in the same second as the first keeps it, so the restore's own backup waits for the next.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await restore_backup(before.name)

  expect(list_tasks().map((task) => task.title)).toEqual(['Before'])
  expect(await list_backups()).toHaveLength(2)
  expect(task_sync.read_state(open_database()).server_generation).toBe('')
})
