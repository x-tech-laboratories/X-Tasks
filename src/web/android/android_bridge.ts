import { App } from '@capacitor/app'

import { phone_certificates } from '@x-tech-laboratories/x-libs/phone_certificates'
import { local_sync_storage } from '@x-tech-laboratories/x-libs/web/sync_storage'
import { indexed_db_files, open_wasm_database } from '@x-tech-laboratories/x-libs/web/sqlite_wasm'
import type { McpStatus, Settings, SettingsApi } from '@shared/settings'
import type { TasksApi } from '@shared/tasks'
import {
  add_tag, add_tag_group, add_task, link_tasks, attach_task_database, get_settings, list_completions, list_tag_groups, list_tags, list_tasks,
  move_tag, move_tag_group, move_task, remove_tag, remove_tag_group, remove_task, unlink_tasks, set_setting, set_task_done, set_task_my_day, set_task_estimate, set_task_reminders, set_task_notes,
  set_task_schedule, set_task_title, tag_task, untag_task, update_tag, update_tag_group, list_task_versions, list_recent_versions, restore_task_version,
  list_time_entries, start_timer, stop_timer, remove_time_entry, get_pomodoro, start_pomodoro, next_pomodoro_round, skip_pomodoro_break, stop_pomodoro, tick_pomodoro
} from '@shared/task_database'
import { request_back } from '../back_navigation'
import { android_backups, back_up_before_upgrade } from './android_backups'
import { create_task_sync_peer } from '@shared/task_sync_peer'
import { keep_phone_notices } from './phone_notices'

// ============================================================================
// Saved copies
// ============================================================================

// The database lives in memory and is saved whole to the app's IndexedDB, which Android keeps until the app's data is cleared.
const files = indexed_db_files('x-tasks')
const DATABASE_FILE = 'tasks.db'
const BEFORE_SYNC_FILE = 'tasks-before-sync.db'

// ============================================================================
// Sync storage
// ============================================================================

// The phone's keys and paired devices stay in the app's private storage; the copy taken before another device's restore replaces this one's goes beside the database.
const SYNC_PEERS_KEY = 'x-tasks-sync-peers'


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
  const database = await open_wasm_database({ files, file_name: DATABASE_FILE })
  await back_up_before_upgrade(database)
  attach_task_database(database.connection, 'On this device')
  await database.save_now()

  // A tapped notice opens its task, held until the page listens when the tap is what started the app.
  const open_task_listeners = new Set<(task_id: string) => void>()
  let waiting_task_id: string | null = null
  const notices = keep_phone_notices({
    read: () => ({ tasks: list_tasks(), settings: get_settings(), pomodoro: get_pomodoro() }),
    open_task: (task_id) => {
      if (open_task_listeners.size === 0) waiting_task_id = task_id
      for (const listener of open_task_listeners) listener(task_id)
    }
  })

  const change_listeners = new Set<() => void>()
  const sync = create_task_sync_peer({
    storage: local_sync_storage({ key: SYNC_PEERS_KEY, back_up_before_replace: () => files.write(BEFORE_SYNC_FILE, database.export_bytes()) }),
    device_name: 'X-Tasks on Android',
    on_remote_change: () => {
      for (const listener of change_listeners) listener()
      notices.refresh()
    }
  })
  const tasks_api: TasksApi = {
    list_tasks: answer(list_tasks),
    add_task: answer(add_task),
    set_task_done: answer(set_task_done),
    set_task_title: answer(set_task_title),
    set_task_notes: answer(set_task_notes),
    set_task_schedule: answer(set_task_schedule),
    set_task_my_day: answer(set_task_my_day),
    set_task_estimate: answer(set_task_estimate),
    set_task_reminders: answer(set_task_reminders),
    remove_task: answer(remove_task),
    move_task: answer(move_task),
    tag_task: answer(tag_task),
    untag_task: answer(untag_task),
    link_tasks: answer(link_tasks),
    unlink_tasks: answer(unlink_tasks),
    list_completions: answer(list_completions),
    list_task_versions: answer(list_task_versions),
    list_recent_versions: answer(list_recent_versions),
    restore_task_version: answer(restore_task_version),
    list_time_entries: answer(list_time_entries),
    start_timer: answer(start_timer),
    stop_timer: answer(stop_timer),
    remove_time_entry: answer(remove_time_entry),
    get_pomodoro: answer(get_pomodoro),
    start_pomodoro: answer(start_pomodoro),
    next_pomodoro_round: answer(next_pomodoro_round),
    skip_pomodoro_break: answer(skip_pomodoro_break),
    stop_pomodoro: answer(stop_pomodoro),
    tick_pomodoro: answer(tick_pomodoro),
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
    },
    on_open_task: (listener) => {
      open_task_listeners.add(listener)
      if (waiting_task_id) listener(waiting_task_id)
      waiting_task_id = null
      return () => open_task_listeners.delete(listener)
    }
  }

  // Every call that changes anything may move a reminder, so the notices are set again after it.
  for (const name of Object.keys(tasks_api) as (keyof TasksApi)[]) {
    if (/^(list_|get_|on_)/.test(name)) continue
    const call = tasks_api[name] as (...args: unknown[]) => Promise<unknown>
    ;(tasks_api as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => call(...args).finally(notices.refresh)
  }

  const backups = android_backups(database)

  // Phones run no MCP endpoint; the theme follows the system, as in a browser.
  const settings_api: SettingsApi = {
    host: 'android',
    get_settings: answer(get_settings),
    // Turning daily backups on or keeping fewer takes or deletes them straight away, as on the desktop.
    set_setting: async <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      set_setting(key, value)
      if (key === 'auto_backup' || key === 'auto_backups_to_keep') await backups.keep_automatic_backups()
      if (key === 'remind_due_tasks' && value) await notices.ask_permission()
      notices.refresh()
    },
    get_database_path: answer(() => 'On this device'),
    show_database_folder: () => Promise.resolve(),
    list_backups: backups.list_backups,
    create_backup: backups.create_backup,
    restore_backup: (name) => backups.restore_backup(name).finally(notices.refresh),
    remove_backup: backups.remove_backup,
    show_backup_folder: () => Promise.resolve(),
    save_text_file: () => Promise.resolve(false),
    get_idle_seconds: () => Promise.resolve(0),
    get_backup_folder: backups.get_folder,
    choose_backup_folder: backups.choose_folder,
    get_mcp_status: () => Promise.resolve(MCP_OFF),
    get_sync_status: answer(sync.get_status),
    create_pairing_code: answer(sync.create_pairing_code),
    pair_device: sync.pair_device,
    remove_device: answer(sync.remove_device),
    sync_now: sync.sync_now,
    certificates: phone_certificates()
  }

  window.x_tasks = tasks_api
  window.x_settings = settings_api

  sync.start()
  void (get_settings().remind_due_tasks ? notices.ask_permission() : Promise.resolve()).finally(notices.refresh)

  // Android can stop a paused app at any time, so the database is saved as it goes to the background, and syncs as it comes back.
  void App.addListener('pause', () => void database.save_now())
  void App.addListener('resume', () => {
    notices.refresh()
    void sync.sync_now()
    void backups.keep_automatic_backups()
  })

  // With nothing left to close, Back sends the app to the background rather than closing it.
  void App.addListener('backButton', () => {
    if (!request_back()) void App.minimizeApp()
  })
}
