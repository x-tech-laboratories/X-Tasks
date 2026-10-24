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

// How clicking tags builds the sidebar filter: one tag in all, one tag per group, or any number of tags.
export type TagSelection = 'single' | 'one_per_group' | 'many'

// Whether a task must match every selected tag or just one of them.
export type TagMatch = 'all' | 'any'

// Whether selecting a tag shows the tasks of the tags inside it too, or only its own.
export type TagScope = 'subtags' | 'own'

// Whether the multibar searches only the view on screen or every task.
export type SearchScope = 'view' | 'all'

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
  months: number
  weeks: number
  days: number
  hours: number
  minutes: number
}

export const DURATION_UNITS = ['months', 'weeks', 'days', 'hours', 'minutes'] as const

// Builds a duration from the units given, with every other unit at zero.
export function task_duration(id: string, amounts: Partial<Omit<TaskDuration, 'id'>>): TaskDuration {
  return { id, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, ...amounts }
}

// Saved durations can still hold a single amount and unit, which this turns into the same gap.
export function saved_task_duration(saved: TaskDuration | { id: string; amount: number; unit: string }): TaskDuration {
  if (!('unit' in saved)) return saved
  return task_duration(saved.id, { [`${saved.unit}s`]: saved.amount })
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
  // When set, completing a top-level task takes it out of My Day.
  remove_done_from_my_day: boolean
  // When set, tasks due today or earlier go into My Day by themselves.
  add_due_to_my_day: boolean
  // The last day due tasks were put in My Day, so ones taken out that day stay out.
  due_added_to_my_day_on: string
  priority_scale: PriorityScale
  tag_selection: TagSelection
  tag_match: TagMatch
  tag_scope: TagScope
  search_scope: SearchScope
  task_layout: TaskLayout
  // The columns the task table is sorted by, most important first; empty keeps the order tasks were dragged into.
  table_sort: TableSortKey[]
  // The order of the table's columns after the title; columns for groups added since come at the end.
  table_column_order: string[]
  // The table columns left out; the title is always shown.
  hidden_table_columns: string[]
  // The start, due and done columns turned on; they stay hidden until then.
  shown_table_columns: string[]
  // Widths in pixels of table columns dragged away from their default; the title takes whatever room is left.
  table_column_widths: Record<string, number>
  // Widths in pixels of the left sidebar and the task detail panel, set by dragging their edges.
  sidebar_width: number
  detail_width: number
  reschedule_options: RescheduleOption[]
  // The gaps offered by the Duration list in a task's details, in the order shown.
  task_durations: TaskDuration[]
  // The swatches, as #rrggbb, offered when picking a tag colour; any other colour can still be picked.
  tag_colors: string[]
  last_view: View
  // The tasks whose subtasks are folded away, kept so they stay folded after a restart.
  collapsed_task_ids: string[]
  // The sidebar's tag groups and tags folded shut, kept the same way.
  collapsed_sidebar_ids: string[]
  // When set, an MCP endpoint on this machine lets AI assistants read and change tasks.
  mcp_enabled: boolean
  mcp_port: number
  // The cards on the Reports page, top to bottom.
  report_widgets: ReportWidget[]
  // When set, each tracked task's row shows its latest occurrences or rounds as a strip of dots.
  show_streak_strip_on_rows: boolean
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
  remove_done_from_my_day: true,
  add_due_to_my_day: false,
  due_added_to_my_day_on: '',
  priority_scale: 'high_medium_low',
  tag_selection: 'one_per_group',
  tag_match: 'all',
  tag_scope: 'subtags',
  search_scope: 'view',
  task_layout: 'list',
  table_sort: [],
  table_column_order: [],
  hidden_table_columns: [],
  shown_table_columns: [],
  table_column_widths: {},
  sidebar_width: 248,
  detail_width: 340,
  reschedule_options: [
    { id: 'today', name: 'Today', mode: 'days', days: 0, rule: '' },
    { id: 'tomorrow', name: 'Tomorrow', mode: 'days', days: 1, rule: '' },
    { id: 'next-weekend', name: 'Next weekend', mode: 'rule', days: 0, rule: 'FREQ=WEEKLY;BYDAY=SA' },
    { id: 'end-of-month', name: 'End of month', mode: 'rule', days: 0, rule: 'FREQ=MONTHLY;BYMONTHDAY=-1' }
  ],
  task_durations: [
    task_duration('30m', { minutes: 30 }),
    task_duration('1h', { hours: 1 }),
    task_duration('2h', { hours: 2 }),
    task_duration('4h', { hours: 4 }),
    task_duration('0d', {}),
    task_duration('1d', { days: 1 }),
    task_duration('2d', { days: 2 }),
    task_duration('3d', { days: 3 }),
    task_duration('1w', { weeks: 1 }),
    task_duration('2w', { weeks: 2 }),
    task_duration('1mo', { months: 1 }),
    task_duration('3mo', { months: 3 })
  ],
  tag_colors: ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#db2777', '#64748b'],
  last_view: { kind: 'all' },
  collapsed_task_ids: [],
  collapsed_sidebar_ids: [],
  mcp_enabled: false,
  mcp_port: 3917,
  show_streak_strip_on_rows: false,
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
  // Whether the page runs in the desktop app or in a browser, where folders cannot be opened.
  host: 'desktop' | 'web'
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
