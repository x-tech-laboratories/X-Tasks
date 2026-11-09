import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { open_task_database } from '../src/main/node_task_database'
import { close_task_database } from '../src/main/task_database'

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

// Writes a file the way the first build kept its tasks, so opening it runs every upgrade.
function write_first_build_file(title: string): void {
  const raw = new DatabaseSync(path)
  raw.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, is_done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); PRAGMA user_version = 1')
  raw.prepare("INSERT INTO tasks (id, title, created_at) VALUES ('old', ?, '2026-01-01T00:00:00.000Z')").run(title)
  raw.close()
}

// ============================================================================
// Backing up before an upgrade
// ============================================================================

it('backs up a file from an older build before upgrading it', () => {
  write_first_build_file('Keep me')

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
