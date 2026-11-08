import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { open_task_database } from '../src/main/node_task_database'
import { add_task, close_task_database } from '../src/main/task_database'

// ============================================================================
// Setup
// ============================================================================

let folder: string
let path: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'x-tasks-migration-backup-'))
  path = join(folder, 'tasks.db')
})

afterEach(() => {
  close_task_database()
  rmSync(folder, { recursive: true, force: true })
})

function backups(): string[] {
  try {
    return readdirSync(join(folder, 'backups'))
  } catch {
    return []
  }
}

// Marks the file as saved by the build before the last upgrade.
function step_back_one_version(): void {
  const raw = new DatabaseSync(path)
  const { user_version } = raw.prepare('PRAGMA user_version').get() as { user_version: number }
  raw.exec(`PRAGMA user_version = ${user_version - 1}`)
  raw.close()
}

// ============================================================================
// Backing up before an upgrade
// ============================================================================

it('backs up a file from an older build before upgrading it', () => {
  open_task_database(path)
  add_task('Keep me', null, [], null)
  close_task_database()
  step_back_one_version()

  open_task_database(path)

  const [backup] = backups()
  expect(backups()).toHaveLength(1)
  const copy = new DatabaseSync(join(folder, 'backups', backup!))
  expect(copy.prepare('SELECT title FROM tasks').all()).toEqual([{ title: 'Keep me' }])
  copy.close()
})

it('takes no backup of a new file or one already up to date', () => {
  open_task_database(path)
  close_task_database()

  open_task_database(path)

  expect(backups()).toEqual([])
})
