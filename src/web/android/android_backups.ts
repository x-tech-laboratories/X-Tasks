import { keep_backing_up } from '@x-tech-laboratories/x-libs/backups'
import { backup_folder_plugin, phone_backups, to_base64 } from '@x-tech-laboratories/x-libs/phone_backups'
import type { WasmDatabase } from '@x-tech-laboratories/x-libs/web/sqlite_wasm'
import { task_backup_naming, type DatabaseBackup } from '@shared/settings'
import { task_sync } from '../../main/task_sync'
import { attach_task_database, get_settings, is_upgrade_pending, open_database } from '../../main/task_database'

// ============================================================================
// Before an upgrade
// ============================================================================

// Before an older database is upgraded, its bytes go to the backup folder if one is picked; a failure is logged so the app still opens.
export async function back_up_before_upgrade(database: WasmDatabase): Promise<void> {
  if (!is_upgrade_pending(database.connection)) return

  try {
    if (!(await backup_folder_plugin.get_folder()).name) return
    const name = task_backup_naming.name_for(new Date(), false)
    await backup_folder_plugin.write({ name, data: to_base64(database.export_bytes()) })
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

// Backups work as on the desktop, but in a folder the user picks, through X-Libs' phone backups; until one is picked there are none, and daily ones wait.
export function android_backups(database: WasmDatabase): AndroidBackups {
  // The restored data is brought up to date, and no longer matches what other devices have, so sync starts over.
  const task_backups = phone_backups({
    naming: task_backup_naming,
    database,
    after_restore: (connection) => {
      attach_task_database(connection, 'On this device')
      task_sync.forget_history(open_database())
    }
  })

  // keep_backing_up checks every hour as well as at the start, since the app can stay open for days.
  const automatic_backups = keep_backing_up(task_backups, () => {
    const settings = get_settings()
    return { automatic: settings.auto_backup, to_keep: settings.auto_backups_to_keep }
  })
  const keep_automatic_backups = (): Promise<void> => automatic_backups.check()

  return {
    get_folder: task_backups.folder_name,
    choose_folder: async () => {
      const name = await task_backups.choose_folder()
      await keep_automatic_backups()
      return name
    },
    list_backups: () => task_backups.list(),
    create_backup: () => task_backups.create(),
    restore_backup: task_backups.restore,
    remove_backup: task_backups.remove,
    keep_automatic_backups
  }
}
