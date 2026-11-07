import { define_bridge } from '@x-tech-laboratories/x-libs/electron/bridge'
import { define_events } from '@x-tech-laboratories/x-libs/electron/events'

import type { SettingsApi } from './settings'
import type { TasksApi } from './tasks'

// ============================================================================
// Answers
// ============================================================================

// The methods with their answers unwrapped, so the main process may answer at once or later.
type Answered<Api> = {
  [Name in keyof Api]: Api[Name] extends (...args: infer Args) => Promise<infer Result> ? (...args: Args) => Result : never
}

// ============================================================================
// Tasks
// ============================================================================

// The task calls the page makes and the main process or web server answers.
export type TasksMethods = Answered<Omit<TasksApi, 'on_database_changed' | 'on_open_task'>>

export const TASKS_METHODS = [
  'list_tasks', 'add_task', 'set_task_done', 'set_task_title', 'set_task_notes', 'set_task_schedule', 'set_task_my_day', 'remove_task', 'move_task',
  'tag_task', 'untag_task', 'link_tasks', 'unlink_tasks', 'list_completions', 'list_tag_groups', 'add_tag_group', 'update_tag_group', 'remove_tag_group', 'move_tag_group',
  'list_tags', 'add_tag', 'update_tag', 'remove_tag', 'move_tag'
] as const satisfies readonly (keyof TasksMethods)[]

export const tasks_bridge = define_bridge<TasksMethods>('x_tasks', TASKS_METHODS)

// What the main process tells the page on its own: the database changed elsewhere, or a task link asks to open a task.
export type TasksEvents = { database_changed: null; open_task: string }

export const tasks_events = define_events<TasksEvents>('x_tasks')

// ============================================================================
// Settings
// ============================================================================

// The settings calls the page makes and the main process answers; Android's backup folder calls never leave the phone.
export type SettingsMethods = Answered<Omit<SettingsApi, 'host' | 'get_backup_folder' | 'choose_backup_folder'>>

// The settings calls the web server answers too.
export const SERVED_SETTINGS_METHODS = [
  'get_settings', 'set_setting', 'get_database_path', 'list_backups', 'create_backup', 'restore_backup', 'remove_backup', 'get_mcp_status'
] as const satisfies readonly (keyof SettingsMethods)[]

// The settings calls only the desktop app answers, since they open folders or sync this device.
export const DESKTOP_SETTINGS_METHODS = [
  'show_database_folder', 'show_backup_folder', 'get_sync_status', 'connect_sync', 'disconnect_sync', 'sync_now',
  'get_trusted_certificate', 'set_trusted_certificate', 'inspect_server_certificate'
] as const satisfies readonly (keyof SettingsMethods)[]

export const settings_bridge = define_bridge<SettingsMethods>('x_settings', [...SERVED_SETTINGS_METHODS, ...DESKTOP_SETTINGS_METHODS])

// ============================================================================
// Completeness checks
// ============================================================================

// Fails to compile when a method in an API is missing from its table.
type ListsEvery<Methods, Names extends readonly unknown[]> = [Exclude<keyof Methods, Names[number]>] extends [never] ? true : false
type MustBe<Check extends true> = Check
export type TasksTableIsComplete = MustBe<ListsEvery<TasksMethods, typeof TASKS_METHODS>>
export type SettingsTableIsComplete = MustBe<ListsEvery<SettingsMethods, [...typeof SERVED_SETTINGS_METHODS, ...typeof DESKTOP_SETTINGS_METHODS]>>
