import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DatabaseBackup } from '@shared/settings'
import { forget_sync_history } from './sync_engine'
import { back_up_task_database, close_task_database, get_settings, open_database, open_task_database, task_database_path } from './task_database'

// ============================================================================
// Backup files
// ============================================================================

// A backup is named after the UTC time it was taken, with dashes for the colons a file name cannot always hold.
const BACKUP_NAME_PATTERN = /^tasks-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z(-auto)?\.db$/

const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const AUTOMATIC_BACKUP_CHECK_MS = 60 * 60 * 1000

export function backup_folder(): string {
  return join(dirname(task_database_path()), 'backups')
}

// Only names the app itself writes are accepted, so a name from the page can never reach outside the folder.
function backup_path(name: string): string {
  if (!BACKUP_NAME_PATTERN.test(name)) throw new Error(`not a backup name: ${name}`)
  return join(backup_folder(), name)
}

function backup_name(taken_at: Date, is_automatic: boolean): string {
  const timestamp = taken_at.toISOString().slice(0, 19).replaceAll(':', '-')
  return `tasks-${timestamp}Z${is_automatic ? '-auto' : ''}.db`
}

function describe_backup(name: string): DatabaseBackup {
  const [, date, hours, minutes, seconds, automatic_suffix] = BACKUP_NAME_PATTERN.exec(name)!
  return {
    name,
    taken_at: `${date}T${hours}:${minutes}:${seconds}Z`,
    size_bytes: statSync(backup_path(name)).size,
    is_automatic: automatic_suffix !== undefined
  }
}

// ============================================================================
// Backup actions
// ============================================================================

// Newest first.
export function list_backups(): DatabaseBackup[] {
  mkdirSync(backup_folder(), { recursive: true })

  return readdirSync(backup_folder())
    .filter((name) => BACKUP_NAME_PATTERN.test(name))
    .map(describe_backup)
    .sort((first, second) => second.taken_at.localeCompare(first.taken_at))
}

// A second backup within the same second keeps the first, since nothing much can have changed between them.
export function create_backup(is_automatic = false): DatabaseBackup {
  mkdirSync(backup_folder(), { recursive: true })

  const name = backup_name(new Date(), is_automatic)
  if (!existsSync(backup_path(name))) back_up_task_database(backup_path(name))
  return describe_backup(name)
}

// Takes an automatic backup once a day has passed since the last one, and deletes the oldest beyond the number to keep; backups made by hand are never deleted.
export function run_automatic_backup(backups_to_keep: number): void {
  const newest_automatic = list_backups().find((backup) => backup.is_automatic)
  if (!newest_automatic || Date.now() - Date.parse(newest_automatic.taken_at) >= AUTOMATIC_BACKUP_INTERVAL_MS) {
    create_backup(true)
  }

  const automatic_backups = list_backups().filter((backup) => backup.is_automatic)
  for (const backup of automatic_backups.slice(backups_to_keep)) remove_backup(backup.name)
}

export function remove_backup(name: string): void {
  rmSync(backup_path(name))
}

// The current data is backed up first, so a restore can itself be undone; the restored data no longer matches what other devices have, so sync starts over.
export function restore_backup(name: string): void {
  const source_path = backup_path(name)
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
  forget_sync_history(open_database())
}

// ============================================================================
// Automatic backups
// ============================================================================

// A failed backup is logged rather than thrown, so it never stops the app.
export function keep_automatic_backups(): void {
  const settings = get_settings()
  if (!settings.auto_backup) return

  try {
    run_automatic_backup(settings.auto_backups_to_keep)
  } catch (error) {
    console.error('automatic backup failed:', error)
  }
}

// The app can stay open for days, so it checks every hour whether a day has passed since the last backup.
export function schedule_automatic_backups(): void {
  keep_automatic_backups()
  setInterval(keep_automatic_backups, AUTOMATIC_BACKUP_CHECK_MS)
}
