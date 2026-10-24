import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { attach_task_database, task_database_path } from './task_database'

// ============================================================================
// Opening on Node
// ============================================================================

// Opens the database file with Node's SQLite, making its folder if needed; later calls without a path reopen the same file, as a restore does.
export function open_task_database(path = task_database_path()): void {
  mkdirSync(dirname(path), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL')
  attach_task_database(database, path)
}
