import { registerPlugin } from '@capacitor/core'

import { AUTOMATIC_BACKUP_INTERVAL_MS, BACKUP_NAME_PATTERN, backup_name, describe_backup_name, type DatabaseBackup } from '@shared/settings'
import { forget_sync_history } from '../../main/sync_engine'
import { attach_task_database, get_settings, open_database } from '../../main/task_database'
import type { WasmTaskDatabase } from './wasm_database'

// ============================================================================
// Native folder
// ============================================================================

// The folder lives on the Android side, in BackupFolderPlugin.java; files cross the bridge as base64.
interface BackupFolderPlugin {
  get_folder: () => Promise<{ name: string }>
  choose_folder: () => Promise<{ name: string }>
  list: () => Promise<{ files: { name: string; size_bytes: number }[] }>
  write: (options: { name: string; data: string }) => Promise<void>
  read: (options: { name: string }) => Promise<{ data: string }>
  remove: (options: { name: string }) => Promise<void>
}

const backup_folder = registerPlugin<BackupFolderPlugin>('BackupFolder')

const BASE64_CHUNK_BYTES = 0x8000

function to_base64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES))
  }
  return btoa(binary)
}

function from_base64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
}

// ============================================================================
// Backup actions
// ============================================================================

const AUTOMATIC_BACKUP_CHECK_MS = 60 * 60 * 1000

export interface AndroidBackups {
  get_folder: () => Promise<string>
  choose_folder: () => Promise<string>
  list_backups: () => Promise<DatabaseBackup[]>
  create_backup: () => Promise<DatabaseBackup>
  restore_backup: (name: string) => Promise<void>
  remove_backup: (name: string) => Promise<void>
  keep_automatic_backups: () => Promise<void>
}

// Backups work as on the desktop, but in a folder the user picks; until one is picked there are none, and daily ones wait.
export function android_backups(database: WasmTaskDatabase): AndroidBackups {
  const get_folder = async (): Promise<string> => (await backup_folder.get_folder()).name

  // Newest first.
  const list_backups = async (): Promise<DatabaseBackup[]> => {
    if (!(await get_folder())) return []
    const { files } = await backup_folder.list()
    return files
      .filter((file) => BACKUP_NAME_PATTERN.test(file.name))
      .map((file) => describe_backup_name(file.name, file.size_bytes))
      .sort((first, second) => second.taken_at.localeCompare(first.taken_at))
  }

  const create_backup = async (is_automatic = false): Promise<DatabaseBackup> => {
    const name = backup_name(new Date(), is_automatic)
    const bytes = database.export_bytes()
    await backup_folder.write({ name, data: to_base64(bytes) })
    return describe_backup_name(name, bytes.byteLength)
  }

  // The current data is backed up first, so a restore can itself be undone; the restored data no longer matches what other devices have, so sync starts over.
  const restore_backup = async (name: string): Promise<void> => {
    const { data } = await backup_folder.read({ name })
    await create_backup()

    database.replace_with(from_base64(data))
    attach_task_database(database.connection, 'On this device')
    forget_sync_history(open_database())
    await database.save_now()
  }

  const remove_backup = (name: string): Promise<void> => backup_folder.remove({ name })

  // Takes a daily backup once a day has passed since the last one, and deletes the oldest beyond the number to keep; a failure is logged so it never stops the app.
  const keep_automatic_backups = async (): Promise<void> => {
    const settings = get_settings()
    if (!settings.auto_backup || !(await get_folder())) return

    try {
      const newest_automatic = (await list_backups()).find((backup) => backup.is_automatic)
      if (!newest_automatic || Date.now() - Date.parse(newest_automatic.taken_at) >= AUTOMATIC_BACKUP_INTERVAL_MS) {
        await create_backup(true)
      }

      const automatic_backups = (await list_backups()).filter((backup) => backup.is_automatic)
      for (const backup of automatic_backups.slice(settings.auto_backups_to_keep)) await remove_backup(backup.name)
    } catch (error) {
      console.error('automatic backup failed:', error)
    }
  }

  // The app can stay open for days, so it checks every hour as well as at the start.
  void keep_automatic_backups()
  setInterval(() => void keep_automatic_backups(), AUTOMATIC_BACKUP_CHECK_MS)

  return {
    get_folder,
    choose_folder: async () => {
      const { name } = await backup_folder.choose_folder()
      await keep_automatic_backups()
      return name
    },
    list_backups,
    create_backup: () => create_backup(),
    restore_backup,
    remove_backup,
    keep_automatic_backups
  }
}
