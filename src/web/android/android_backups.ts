import { registerPlugin } from '@capacitor/core'

import { backups, keep_backing_up } from '@x-tech-laboratories/x-libs/backups'
import type { WasmDatabase } from '@x-tech-laboratories/x-libs/web/sqlite_wasm'
import { task_backup_naming, type DatabaseBackup } from '@shared/settings'
import { task_sync } from '../../main/task_sync'
import { attach_task_database, get_settings, is_upgrade_pending, open_database } from '../../main/task_database'

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

// Before an older database is upgraded, its bytes go to the backup folder if one is picked; a failure is logged so the app still opens.
export async function back_up_before_upgrade(database: WasmDatabase): Promise<void> {
  if (!is_upgrade_pending(database.connection)) return

  try {
    if (!(await backup_folder.get_folder()).name) return
    const name = task_backup_naming.name_for(new Date(), false)
    await backup_folder.write({ name, data: to_base64(database.export_bytes()) })
  } catch (error) {
    console.error('backup before upgrade failed:', error)
  }
}

// ============================================================================
// Backup actions
// ============================================================================

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
export function android_backups(database: WasmDatabase): AndroidBackups {
  const get_folder = async (): Promise<string> => (await backup_folder.get_folder()).name

  // The phone keeps the files on its side; each crosses the bridge as base64.
  const task_backups = backups(task_backup_naming, {
    list: async () => ((await get_folder()) ? (await backup_folder.list()).files : []),
    take: async (name) => {
      const bytes = database.export_bytes()
      await backup_folder.write({ name, data: to_base64(bytes) })
      return bytes.byteLength
    },
    remove: (name) => backup_folder.remove({ name })
  })

  // Newest first.
  const list_backups = (): Promise<DatabaseBackup[]> => task_backups.list()
  const create_backup = (is_automatic = false): Promise<DatabaseBackup> => task_backups.create(is_automatic)

  // The current data is backed up first, so a restore can itself be undone; the restored data no longer matches what other devices have, so sync starts over.
  const restore_backup = async (name: string): Promise<void> => {
    const { data } = await backup_folder.read({ name })
    await create_backup()

    database.replace_with(from_base64(data))
    attach_task_database(database.connection, 'On this device')
    task_sync.forget_history(open_database())
    await database.save_now()
  }

  const remove_backup = (name: string): Promise<void> => task_backups.remove(name)

  // Daily backups wait until a folder is picked; keep_backing_up checks every hour as well as at the start, since the app can stay open for days.
  const automatic_backups = keep_backing_up(task_backups, async () => {
    const settings = get_settings()
    return { automatic: settings.auto_backup && (await get_folder()) !== '', to_keep: settings.auto_backups_to_keep }
  })
  const keep_automatic_backups = (): Promise<void> => automatic_backups.check()

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
