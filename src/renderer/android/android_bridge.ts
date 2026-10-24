import { App } from '@capacitor/app'

import type { McpStatus, Settings, SettingsApi } from '@shared/settings'
import type { TasksApi } from '@shared/tasks'
import { connect_sync, disconnect_sync, get_sync_status, start_sync, sync_now, type SyncConfig, type SyncStorage } from '../../main/sync_client'
import {
  add_tag, add_tag_group, add_task, apply_priority_scale, attach_task_database, get_settings, list_completions, list_tag_groups, list_tags, list_tasks,
  move_tag, move_tag_group, move_task, remove_tag, remove_tag_group, remove_task, set_setting, set_task_done, set_task_my_day, set_task_notes,
  set_task_schedule, set_task_title, tag_task, untag_task, update_tag, update_tag_group
} from '../../main/task_database'
import { BEFORE_SYNC_FILE, open_wasm_database, write_file } from './wasm_database'

// ============================================================================
// Sync storage
// ============================================================================

// The server and token stay in the app's private storage; the copy taken before the server's tasks replace this device's goes beside the database.
const SYNC_CONFIG_KEY = 'x-tasks-sync'

function android_sync_storage(export_bytes: () => Uint8Array): SyncStorage {
  return {
    read_config: () => {
      const saved = localStorage.getItem(SYNC_CONFIG_KEY)
      return saved ? (JSON.parse(saved) as SyncConfig) : null
    },
    write_config: (config) => localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config)),
    remove_config: () => localStorage.removeItem(SYNC_CONFIG_KEY),
    back_up_before_download: () => write_file(BEFORE_SYNC_FILE, export_bytes())
  }
}

// ============================================================================
// Bridge
// ============================================================================

const MCP_OFF: McpStatus = { state: 'off', url: '', error: '' }

// Each call runs straight on the database in this page; answers are promises so the page treats them as it does the desktop's.
function answer<Args extends unknown[], Result>(call: (...args: Args) => Result): (...args: Args) => Promise<Result> {
  return (...args) => {
    try {
      return Promise.resolve(call(...args))
    } catch (error) {
      return Promise.reject(error)
    }
  }
}

// Gives the page window.x_tasks and window.x_settings backed by a database kept on the phone, synced with a server when one is set.
export async function install_android_bridge(): Promise<void> {
  const database = await open_wasm_database()
  attach_task_database(database.connection, 'On this device')
  await database.save_now()

  const change_listeners = new Set<() => void>()
  const tasks_api: TasksApi = {
    list_tasks: answer(list_tasks),
    add_task: answer(add_task),
    set_task_done: answer(set_task_done),
    set_task_title: answer(set_task_title),
    set_task_notes: answer(set_task_notes),
    set_task_schedule: answer(set_task_schedule),
    set_task_my_day: answer(set_task_my_day),
    remove_task: answer(remove_task),
    move_task: answer(move_task),
    tag_task: answer(tag_task),
    untag_task: answer(untag_task),
    list_completions: answer(list_completions),
    list_tag_groups: answer(list_tag_groups),
    add_tag_group: answer(add_tag_group),
    update_tag_group: answer(update_tag_group),
    remove_tag_group: answer(remove_tag_group),
    move_tag_group: answer(move_tag_group),
    list_tags: answer(list_tags),
    add_tag: answer(add_tag),
    update_tag: answer(update_tag),
    remove_tag: answer(remove_tag),
    move_tag: answer(move_tag),
    on_database_changed: (listener) => {
      change_listeners.add(listener)
      return () => change_listeners.delete(listener)
    }
  }

  // Phones keep no backups of their own yet and run no MCP endpoint; the theme follows the system, as in a browser.
  const settings_api: SettingsApi = {
    host: 'android',
    get_settings: answer(get_settings),
    set_setting: answer(<Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      set_setting(key, value)
      if (key === 'priority_scale') apply_priority_scale(value as Settings['priority_scale'])
    }),
    get_database_path: answer(() => 'On this device'),
    show_database_folder: () => Promise.resolve(),
    list_backups: () => Promise.resolve([]),
    create_backup: () => Promise.reject(new Error('backups are not kept on this device')),
    restore_backup: () => Promise.reject(new Error('backups are not kept on this device')),
    remove_backup: () => Promise.resolve(),
    show_backup_folder: () => Promise.resolve(),
    get_mcp_status: () => Promise.resolve(MCP_OFF),
    get_sync_status: answer(get_sync_status),
    connect_sync,
    disconnect_sync: answer(disconnect_sync),
    sync_now
  }

  window.x_tasks = tasks_api
  window.x_settings = settings_api

  start_sync(android_sync_storage(database.export_bytes), () => {
    for (const listener of change_listeners) listener()
  })

  // Android can stop a paused app at any time, so the database is saved as it goes to the background, and syncs as it comes back.
  void App.addListener('pause', () => void database.save_now())
  void App.addListener('resume', () => void sync_now())
}
