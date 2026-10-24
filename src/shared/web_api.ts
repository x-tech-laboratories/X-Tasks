import type { SettingsApi } from './settings'
import type { TasksApi } from './tasks'

// ============================================================================
// Web bridge contract
// ============================================================================

// The bridge calls the web server answers, each posted to API_PATH and its name with the arguments as a JSON array.
export const WEB_TASKS_METHODS = [
  'list_tasks', 'add_task', 'set_task_done', 'set_task_title', 'set_task_notes', 'set_task_schedule', 'set_task_my_day', 'remove_task', 'move_task',
  'tag_task', 'untag_task', 'list_completions', 'list_tag_groups', 'add_tag_group', 'update_tag_group', 'remove_tag_group', 'move_tag_group',
  'list_tags', 'add_tag', 'update_tag', 'remove_tag', 'move_tag'
] as const satisfies readonly Exclude<keyof TasksApi, 'on_database_changed'>[]

export const WEB_SETTINGS_METHODS = [
  'get_settings', 'set_setting', 'get_database_path', 'list_backups', 'create_backup', 'restore_backup', 'remove_backup', 'get_mcp_status'
] as const satisfies readonly Exclude<keyof SettingsApi, 'host' | 'show_database_folder' | 'show_backup_folder'>[]

export type WebMethod = (typeof WEB_TASKS_METHODS)[number] | (typeof WEB_SETTINGS_METHODS)[number]

// Paths relative to the page, so the app also works when a proxy serves it under a folder.
export const API_PATH = 'api/'
export const EVENTS_PATH = 'api/events'
export const LOGIN_PATH = 'login'

// The header naming which open page made a call, so the server tells every other page about the change but not that one.
export const CLIENT_ID_HEADER = 'x-client-id'

// The first event names the page's client id, and each later one says the data changed.
export const HELLO_EVENT = 'hello'
export const CHANGED_EVENT = 'changed'
