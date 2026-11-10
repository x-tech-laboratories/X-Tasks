import { dirname, join } from 'node:path'

import { keep_backing_up } from '@x-tech-laboratories/x-libs/backups'
import { sqlite_backups } from '@x-tech-laboratories/x-libs/server/sqlite_backups'
import { task_backup_naming, type DatabaseBackup } from '@shared/settings'
import { task_sync } from './task_sync'
import { open_task_database } from './node_task_database'
import { close_task_database, get_settings, open_database, task_database_path } from './task_database'

// ============================================================================
// Backup files
// ============================================================================

export function backup_folder(): string {
  return join(dirname(task_database_path()), 'backups')
}

// The restored data no longer matches what other devices have, so sync starts over after a restore.
const task_backups = sqlite_backups({
  folder: backup_folder,
  naming: task_backup_naming,
  database: open_database,
  database_path: task_database_path,
  close: close_task_database,
  open: () => open_task_database(),
  after_restore: (database) => task_sync.forget_history(database)
})

// ============================================================================
// Backup actions
// ============================================================================

// Newest first.
export function list_backups(): Promise<DatabaseBackup[]> {
  return task_backups.list()
}

// A second one within the same second keeps the first.
export function create_backup(): Promise<DatabaseBackup> {
  return task_backups.create()
}

export function remove_backup(name: string): Promise<void> {
  return task_backups.remove(name)
}

// The current data is backed up first, so a restore can itself be undone.
export function restore_backup(name: string): Promise<void> {
  return task_backups.restore(name)
}

// ============================================================================
// Automatic backups
// ============================================================================

let automatic_backups: ReturnType<typeof keep_backing_up> | undefined

// Takes a daily backup and keeps the number the settings ask for, now and every hour, since the app can stay open for days.
export function schedule_automatic_backups(): void {
  automatic_backups = keep_backing_up(task_backups, () => {
    const settings = get_settings()
    return { automatic: settings.auto_backup, to_keep: settings.auto_backups_to_keep }
  })
}

// Runs the check again at once, after the schedule's settings change.
export function keep_automatic_backups(): void {
  void automatic_backups?.check()
}
