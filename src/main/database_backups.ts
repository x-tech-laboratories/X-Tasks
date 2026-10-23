import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DatabaseBackup } from '@shared/settings'
import { back_up_task_database, close_task_database, open_task_database, task_database_path } from './task_database'

// ============================================================================
// Backup files
// ============================================================================

// A backup is named after the UTC time it was taken, with dashes for the colons a file name cannot always hold.
const BACKUP_NAME_PATTERN = /^tasks-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/

export function backup_folder(): string {
  return join(dirname(task_database_path()), 'backups')
}

// Only names the app itself writes are accepted, so a name from the page can never reach outside the folder.
function backup_path(name: string): string {
  if (!BACKUP_NAME_PATTERN.test(name)) throw new Error(`not a backup name: ${name}`)
  return join(backup_folder(), name)
}

function backup_name(taken_at: Date): string {
  const timestamp = taken_at.toISOString().slice(0, 19).replaceAll(':', '-')
  return `tasks-${timestamp}Z.db`
}

function backup_taken_at(name: string): string {
  const [, date, hours, minutes, seconds] = BACKUP_NAME_PATTERN.exec(name)!
  return `${date}T${hours}:${minutes}:${seconds}Z`
}

// ============================================================================
// Backup actions
// ============================================================================

// Newest first.
export function list_backups(): DatabaseBackup[] {
  mkdirSync(backup_folder(), { recursive: true })

  return readdirSync(backup_folder())
    .filter((name) => BACKUP_NAME_PATTERN.test(name))
    .map((name) => ({ name, taken_at: backup_taken_at(name), size_bytes: statSync(backup_path(name)).size }))
    .sort((first, second) => second.taken_at.localeCompare(first.taken_at))
}

// A second backup within the same second keeps the first, since nothing much can have changed between them.
export function create_backup(): DatabaseBackup {
  mkdirSync(backup_folder(), { recursive: true })

  const name = backup_name(new Date())
  if (!existsSync(backup_path(name))) back_up_task_database(backup_path(name))
  return { name, taken_at: backup_taken_at(name), size_bytes: statSync(backup_path(name)).size }
}

export function remove_backup(name: string): void {
  rmSync(backup_path(name))
}

// The current data is backed up first, so a restore can itself be undone.
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
}
