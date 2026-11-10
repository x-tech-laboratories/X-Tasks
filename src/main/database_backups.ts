import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { backups } from '@x-tech-laboratories/x-libs/backups'
import { backup_path, file_backup_store } from '@x-tech-laboratories/x-libs/server/backup_files'
import { task_backup_naming, type DatabaseBackup } from '@shared/settings'
import { task_sync } from './task_sync'
import { open_task_database } from './node_task_database'
import { back_up_task_database, close_task_database, get_settings, open_database, task_database_path } from './task_database'

// ============================================================================
// Backup files
// ============================================================================

const AUTOMATIC_BACKUP_CHECK_MS = 60 * 60 * 1000

export function backup_folder(): string {
  return join(dirname(task_database_path()), 'backups')
}

const store = file_backup_store(backup_folder, task_backup_naming, back_up_task_database)
const task_backups = backups(task_backup_naming, store)

// ============================================================================
// Backup actions
// ============================================================================

// Newest first.
export function list_backups(): Promise<DatabaseBackup[]> {
  return task_backups.list()
}

// Writes at once, so a backup taken before a sync replaces the data is on disk first; a second one within the same second keeps the first.
export function create_backup(is_automatic = false): DatabaseBackup {
  const name = task_backup_naming.name_for(new Date(), is_automatic)
  const path = backup_path(backup_folder(), task_backup_naming, name)
  const size_bytes = existsSync(path) ? statSync(path).size : (store.take(name) as number)
  return task_backup_naming.describe(name, size_bytes)
}

export function remove_backup(name: string): Promise<void> {
  return task_backups.remove(name)
}

// The current data is backed up first, so a restore can itself be undone; the restored data no longer matches what other devices have, so sync starts over.
export function restore_backup(name: string): void {
  const source_path = backup_path(backup_folder(), task_backup_naming, name)
  statSync(source_path)
  create_backup()

  const database_path = task_database_path()
  close_task_database()
  try {
    rmSync(`${database_path}-wal`, { force: true })
    rmSync(`${database_path}-shm`, { force: true })
    copyFileSync(source_path, database_path)
  } finally {
    open_task_database()
  }
  task_sync.forget_history(open_database())
}

// ============================================================================
// Automatic backups
// ============================================================================

// Takes a daily backup and keeps the number the settings ask for; a failed backup is logged rather than thrown, so it never stops the app.
export function keep_automatic_backups(): void {
  const settings = get_settings()
  if (!settings.auto_backup) return
  task_backups.keep_automatic(settings.auto_backups_to_keep).catch((error: unknown) => console.error('automatic backup failed:', error))
}

// The app can stay open for days, so it checks every hour whether a day has passed since the last backup.
export function schedule_automatic_backups(): void {
  keep_automatic_backups()
  setInterval(keep_automatic_backups, AUTOMATIC_BACKUP_CHECK_MS)
}
