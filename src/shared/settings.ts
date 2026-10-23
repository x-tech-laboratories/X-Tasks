import type { View } from './tasks'

// ============================================================================
// Settings
// ============================================================================

export type ThemeChoice = 'system' | 'light' | 'dark'

// The view the app opens on, where 'last' means the one shown when it was closed.
export type LaunchView = 'last' | 'my_day' | 'all' | 'active' | 'completed'

// How the center pane shows tasks: a plain list, or a table with aligned columns.
export type TaskLayout = 'list' | 'table'

// One column the task table is sorted by: "title", "date", or "group:" and a filter group's id.
export interface TableSortKey {
  column: string
  is_descending: boolean
}

// The narrowest and widest each side panel can be dragged to.
export const SIDEBAR_WIDTH_RANGE = { min: 180, max: 480 }
export const DETAIL_WIDTH_RANGE = { min: 260, max: 720 }

// The names given to the tags of the preset Priority group, from highest to lowest.
export type PriorityScale = 'high_medium_low' | 'moscow'

export const PRIORITY_SCALE_NAMES: Record<PriorityScale, string[]> = {
  high_medium_low: ['High', 'Medium', 'Low'],
  moscow: ['Must have', 'Should have', 'Could have', "Won't have"]
}

// A quick date offered by the Reschedule popup: a number of days from today, or the next date of a repeat rule counted from now.
export interface RescheduleOption {
  id: string
  name: string
  mode: 'days' | 'rule'
  days: number
  rule: string
}

export interface Settings {
  theme: ThemeChoice
  launch_view: LaunchView
  confirm_tag_removal: boolean
  // When set, My Day starts empty each day; otherwise tasks stay in it until taken out.
  auto_clear_my_day: boolean
  // When set, tasks due today or earlier go into My Day by themselves.
  add_due_to_my_day: boolean
  // The last day due tasks were put in My Day, so ones taken out that day stay out.
  due_added_to_my_day_on: string
  priority_scale: PriorityScale
  task_layout: TaskLayout
  // The columns the task table is sorted by, most important first; empty keeps the order tasks were dragged into.
  table_sort: TableSortKey[]
  // Widths in pixels of the left sidebar and the task detail panel, set by dragging their edges.
  sidebar_width: number
  detail_width: number
  reschedule_options: RescheduleOption[]
  last_view: View
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  launch_view: 'last',
  confirm_tag_removal: true,
  auto_clear_my_day: true,
  add_due_to_my_day: false,
  due_added_to_my_day_on: '',
  priority_scale: 'high_medium_low',
  task_layout: 'list',
  table_sort: [],
  sidebar_width: 248,
  detail_width: 340,
  reschedule_options: [
    { id: 'today', name: 'Today', mode: 'days', days: 0, rule: '' },
    { id: 'tomorrow', name: 'Tomorrow', mode: 'days', days: 1, rule: '' },
    { id: 'next-weekend', name: 'Next weekend', mode: 'rule', days: 0, rule: 'FREQ=WEEKLY;BYDAY=SA' },
    { id: 'end-of-month', name: 'End of month', mode: 'rule', days: 0, rule: 'FREQ=MONTHLY;BYMONTHDAY=-1' }
  ],
  last_view: { kind: 'all' }
}

// ============================================================================
// Backups
// ============================================================================

// A saved copy of the database, named by the file it lives in.
export interface DatabaseBackup {
  name: string
  taken_at: string
  size_bytes: number
}

// ============================================================================
// Bridge contract
// ============================================================================

export interface SettingsApi {
  get_settings: () => Promise<Settings>
  set_setting: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => Promise<void>
  get_database_path: () => Promise<string>
  show_database_folder: () => Promise<void>
  list_backups: () => Promise<DatabaseBackup[]>
  create_backup: () => Promise<DatabaseBackup>
  restore_backup: (name: string) => Promise<void>
  remove_backup: (name: string) => Promise<void>
  show_backup_folder: () => Promise<void>
}

export const GET_SETTINGS_CHANNEL = 'settings:get'
export const SET_SETTING_CHANNEL = 'settings:set'
export const GET_DATABASE_PATH_CHANNEL = 'settings:database-path'
export const SHOW_DATABASE_FOLDER_CHANNEL = 'settings:show-database-folder'
export const LIST_BACKUPS_CHANNEL = 'backups:list'
export const CREATE_BACKUP_CHANNEL = 'backups:create'
export const RESTORE_BACKUP_CHANNEL = 'backups:restore'
export const REMOVE_BACKUP_CHANNEL = 'backups:remove'
export const SHOW_BACKUP_FOLDER_CHANNEL = 'backups:show-folder'
