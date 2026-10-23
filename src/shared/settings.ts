import type { View } from './tasks'

// ============================================================================
// Settings
// ============================================================================

export type ThemeChoice = 'system' | 'light' | 'dark'

// The view the app opens on, where 'last' means the one shown when it was closed.
export type LaunchView = 'last' | 'my_day' | 'all' | 'active' | 'completed' | 'reports'

// How the center pane shows tasks: a plain list, or a table with aligned columns.
export type TaskLayout = 'list' | 'table'

// Which of a task's dates it is shown, sorted, filtered, rescheduled and put in My Day by.
export type TaskDateField = 'due' | 'start'

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

// A gap the Duration list in a task's details offers, which sets the due date that long after the start.
export interface TaskDuration {
  id: string
  amount: number
  unit: 'hour' | 'day' | 'week' | 'month'
}

// A card on the Reports page: routine streaks, a calendar of ticks, ticks per week, or ticks split by the tags of a group.
export type ReportWidgetKind = 'streaks' | 'calendar' | 'weekly' | 'by_tag'

export interface ReportWidget {
  id: string
  kind: ReportWidgetKind
  title: string
  // Only tasks holding every one of these tags count; empty counts every task.
  tag_ids: string[]
  // How many days back from today the card looks.
  days: number
  // The tag group a by-tag card splits ticks by.
  group_id: string
  // When set, a streak card lists only the routines, leaving out the subtasks under each.
  hide_subtasks?: boolean
}

export const REPORT_DAYS_RANGE = { min: 7, max: 730 }

export interface Settings {
  theme: ThemeChoice
  launch_view: LaunchView
  confirm_tag_removal: boolean
  task_date_field: TaskDateField
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
  // The gaps offered by the Duration list in a task's details, in the order shown.
  task_durations: TaskDuration[]
  last_view: View
  // When set, an MCP endpoint on this machine lets AI assistants read and change tasks.
  mcp_enabled: boolean
  mcp_port: number
  // The cards on the Reports page, top to bottom.
  report_widgets: ReportWidget[]
  // When set, a backup is taken once a day, and only the newest of these are kept.
  auto_backup: boolean
  auto_backups_to_keep: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  launch_view: 'last',
  confirm_tag_removal: true,
  task_date_field: 'due',
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
  task_durations: [
    { id: '1h', amount: 1, unit: 'hour' },
    { id: '2h', amount: 2, unit: 'hour' },
    { id: '4h', amount: 4, unit: 'hour' },
    { id: '0d', amount: 0, unit: 'day' },
    { id: '1d', amount: 1, unit: 'day' },
    { id: '2d', amount: 2, unit: 'day' },
    { id: '3d', amount: 3, unit: 'day' },
    { id: '1w', amount: 1, unit: 'week' },
    { id: '2w', amount: 2, unit: 'week' },
    { id: '1mo', amount: 1, unit: 'month' },
    { id: '3mo', amount: 3, unit: 'month' }
  ],
  last_view: { kind: 'all' },
  mcp_enabled: false,
  mcp_port: 3917,
  report_widgets: [
    { id: 'streaks', kind: 'streaks', title: 'Routine streaks', tag_ids: [], days: 30, group_id: '' },
    { id: 'calendar', kind: 'calendar', title: 'Ticks per day', tag_ids: [], days: 182, group_id: '' },
    { id: 'weekly', kind: 'weekly', title: 'Ticks per week', tag_ids: [], days: 84, group_id: '' },
    { id: 'by-area', kind: 'by_tag', title: 'Ticks by area', tag_ids: [], days: 30, group_id: 'area' }
  ],
  auto_backup: true,
  auto_backups_to_keep: 14
}

// The ports the MCP endpoint can be set to, leaving out those that need root.
export const MCP_PORT_RANGE = { min: 1024, max: 65535 }

// Whether the MCP endpoint is listening, and at which address, or why it could not start.
export interface McpStatus {
  state: 'off' | 'running' | 'failed'
  url: string
  error: string
}

// ============================================================================
// Backups
// ============================================================================

// A saved copy of the database, named by the file it lives in.
export interface DatabaseBackup {
  name: string
  taken_at: string
  size_bytes: number
  is_automatic: boolean
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
  get_mcp_status: () => Promise<McpStatus>
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
export const GET_MCP_STATUS_CHANNEL = 'mcp:status'
