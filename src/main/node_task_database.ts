import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { backup_path } from '@x-tech-laboratories/x-libs/server/backup_files'
import { task_backup_naming } from '@shared/settings'
import type { SqlDatabase } from './sql_database'
import { attach_task_database, task_database_path } from './task_database'

// ============================================================================
// Opening on Node
// ============================================================================

// Opens the database file with Node's SQLite, making its folder if needed; later calls without a path reopen the same file, as a restore does.
export function open_task_database(path = task_database_path()): void {
  mkdirSync(dirname(path), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL')
  attach_task_database(database, path, (database) => back_up_before_upgrade(database, path))
}

// A file saved by an older build is copied into the backups folder before its schema is upgraded, so the upgrade can be undone.
function back_up_before_upgrade(database: SqlDatabase, path: string): void {
  const folder = join(dirname(path), 'backups')
  const backup = backup_path(folder, task_backup_naming, task_backup_naming.name_for(new Date(), false))
  if (existsSync(backup)) return

  mkdirSync(folder, { recursive: true })
  database.prepare('VACUUM INTO ?').run(backup)
}
