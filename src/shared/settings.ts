import { backup_naming, type Backup } from '@x-tech-laboratories/x-libs/backups'
import type { SyncDirection, SyncStatus } from './sync'
import type { View } from './tasks'

// ============================================================================
// Settings
// ============================================================================

export type ThemeChoice = 'system' | 'light' | 'dark'

// The view the app opens on, where 'last' means the one shown when it was closed.
export type LaunchView = 'last' | 'my_day' | 'upcoming' | 'all' | 'active' | 'completed' | 'reports' | 'history'

// How the center pane shows tasks: a plain list, a table with aligned columns, a board of columns, a calendar, or a Gantt chart.
export type TaskLayout = 'list' | 'table' | 'board' | 'calendar' | 'gantt'

// How much time the calendar shows at once.
export type CalendarSpan = 'month' | 'week' | 'day'

// How much time each column of the Gantt chart covers.
export type GanttScale = 'day' | 'week' | 'month'

// The layout a view shows its tasks in, and the span its calendar and Gantt chart were left at.
export interface ViewLayout {
  layout: TaskLayout
  calendar_span: CalendarSpan
  gantt_scale: GanttScale
}

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

// The ways of writing a new task's tags and dates, or a search, in the multibar, each borrowed from another app.
export type SyntaxId = 'plain' | 'todoist' | 'gtg' | 'trilium'

// What the task list puts its headings by: nothing, the date, or the tags of one filter group, named by "group:" and the group's id.
export type TaskGrouping = 'none' | 'date' | `group:${string}`

// Whether overdue repeating tasks stay put, move to today, or move to their first repeat date from today on.
export type OverdueRepeatReschedule = 'off' | 'today' | 'next'

// Whether one grouping serves every view, each view keeps the grouping picked in it, or a picked grouping stays until saved for that view.
export type GroupingMemory = 'shared' | 'automatic' | 'on_demand'

// The same choice for the layout: one for every view, each view's last pick, or a pick kept until saved for that view.
export type LayoutMemory = 'shared' | 'automatic' | 'on_demand'

// The narrowest and widest each side panel can be dragged to.
export const SIDEBAR_WIDTH_RANGE = { min: 180, max: 480 }
export const DETAIL_WIDTH_RANGE = { min: 260, max: 720 }

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

// A kind of link between two tasks, named both ways, as in "A waits on B" and "B blocks A".
export interface TaskRelationship {
  id: string
  name: string
  inverse_name: string
  // Which task waits on the other: neither, the first (A), or the second (B); a waiting task shows it on its row and the Gantt chart draws an arrow.
  waiter: 'none' | 'first' | 'second'
}

export const UPCOMING_REPEAT_DAYS_RANGE = { min: 0, max: 90 }

export const REPORT_DAYS_RANGE = { min: 7, max: 730 }

export interface Settings {
  theme: ThemeChoice
  launch_view: LaunchView
  confirm_tag_removal: boolean
  confirm_clear_completed: boolean
  task_date_field: TaskDateField
  // When set, My Day starts empty each day; otherwise tasks stay in it until taken out.
  auto_clear_my_day: boolean
  // When set, completing a top-level task takes it out of My Day.
  remove_done_from_my_day: boolean
  // When set, moving a task's date past today takes it out of My Day.
  remove_future_from_my_day: boolean
  // When set, tasks due today or earlier go into My Day by themselves.
  add_due_to_my_day: boolean
  // Where overdue repeating tasks move by themselves each day.
  reschedule_overdue_repeats: OverdueRepeatReschedule
  // The minute up to which due tasks have been put in My Day, so ones taken out by hand stay out.
  due_added_to_my_day_until: string
  tag_selection: TagSelection
  tag_match: TagMatch
  tag_scope: TagScope
  // When cleared, the sidebar leaves out tags no task has, done or not, unless selected or holding a tag that shows.
  show_empty_tags: boolean
  search_scope: SearchScope
  // When set, a new subtask starts with its parent's tags; otherwise it shows under whichever tags its parent has, with none of its own.
  subtasks_inherit_tags: boolean
  // How the multibar reads a new task's tags, dates and repeat, and how it reads a search; each can follow a different app.
  quick_add_syntax: SyntaxId
  search_syntax: SyntaxId
  // The layout, calendar span and Gantt scale of views with none saved, or of every view when they share one.
  task_layout: TaskLayout
  calendar_span: CalendarSpan
  gantt_scale: GanttScale
  layout_memory: LayoutMemory
  // How many minutes each row of the calendar's week and day views covers, and how often a time is printed beside them.
  calendar_slot_minutes: number
  calendar_slot_label_minutes: number
  // The layouts saved for single views and tag selections, keyed as view_key names them, which take the place of the default.
  view_layouts: Record<string, ViewLayout>
  // The headings every view but Reports and Upcoming shows its tasks under; Upcoming always goes by date.
  task_grouping: TaskGrouping
  grouping_memory: GroupingMemory
  // The groupings saved for single views and tag selections, keyed as view_key names them, which take the place of the default.
  view_groupings: Record<string, TaskGrouping>
  // How many days ahead Upcoming shows the later dates of repeating tasks; zero shows none.
  upcoming_repeat_days: number
  // The columns the task table is sorted by, most important first; empty keeps the order tasks were dragged into.
  table_sort: TableSortKey[]
  // The order of the table's columns after the title; columns for groups added since come at the end.
  table_column_order: string[]
  // The table columns left out; the title is always shown.
  hidden_table_columns: string[]
  // The start, due, done and duration columns turned on; they stay hidden until then.
  shown_table_columns: string[]
  // Widths in pixels of table columns dragged away from their default; the title takes whatever room is left.
  table_column_widths: Record<string, number>
  // When set, the task table keeps its columns at their set widths and scrolls sideways instead of shrinking them to fit.
  scroll_table_sideways: boolean
  // The order of the sections in a task's details; sections for groups added since come just after the one before them.
  task_detail_order: string[]
  // The sections left out of a task's details.
  hidden_task_detail_sections: string[]
  // Widths in pixels of the left sidebar and the task detail panel, set by dragging their edges.
  sidebar_width: number
  detail_width: number
  reschedule_options: RescheduleOption[]
  // The gaps offered by the Duration list in a task's details, in the order shown.
  task_durations: TaskDuration[]
  // The kinds of links tasks can have to one another, in the order offered.
  task_relationships: TaskRelationship[]
  // The swatches, as #rrggbb, offered when picking a tag colour; any other colour can still be picked.
  tag_colors: string[]
  last_view: View
  // The tasks whose subtasks are folded away, kept so they stay folded after a restart.
  collapsed_task_ids: string[]
  // When set, completing a task whose subtasks all end up done folds them away.
  collapse_completed_branches: boolean
  // The sidebar's tag groups and tags folded shut, kept the same way.
  collapsed_sidebar_ids: string[]
  // When set, an MCP endpoint on this machine lets AI assistants read and change tasks.
  mcp_enabled: boolean
  mcp_port: number
  // The cards on the Reports page, top to bottom.
  report_widgets: ReportWidget[]
  // When set, each tracked task's row shows its latest occurrences or rounds as a strip of dots.
  show_streak_strip_on_rows: boolean
  // When set, each task row is tinted with the colour of its first coloured tag.
  tint_rows_by_tag: boolean
  // When set, a backup is taken once a day, and only the newest of these are kept.
  auto_backup: boolean
  auto_backups_to_keep: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  launch_view: 'last',
  confirm_tag_removal: true,
  confirm_clear_completed: true,
  task_date_field: 'due',
  auto_clear_my_day: true,
  remove_done_from_my_day: true,
  remove_future_from_my_day: true,
  add_due_to_my_day: false,
  due_added_to_my_day_until: '',
  reschedule_overdue_repeats: 'off',
  tag_selection: 'one_per_group',
  tag_match: 'all',
  tag_scope: 'subtags',
  show_empty_tags: true,
  search_scope: 'view',
  subtasks_inherit_tags: false,
  quick_add_syntax: 'todoist',
  search_syntax: 'todoist',
  task_layout: 'list',
  calendar_span: 'month',
  gantt_scale: 'day',
  layout_memory: 'automatic',
  calendar_slot_minutes: 30,
  calendar_slot_label_minutes: 60,
  view_layouts: {},
  task_grouping: 'none',
  grouping_memory: 'automatic',
  view_groupings: {},
  upcoming_repeat_days: 7,
  table_sort: [],
  table_column_order: [],
  hidden_table_columns: [],
  shown_table_columns: [],
  table_column_widths: {},
  scroll_table_sideways: false,
  task_detail_order: [],
  hidden_task_detail_sections: [],
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
  task_relationships: [
    { id: 'waits_on', name: 'Waits on', inverse_name: 'Blocks', waiter: 'first' },
    { id: 'related_to', name: 'Related to', inverse_name: 'Related to', waiter: 'none' }
  ],
  tag_colors: ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#db2777', '#64748b'],
  last_view: { kind: 'all' },
  collapsed_task_ids: [],
  collapse_completed_branches: false,
  collapsed_sidebar_ids: [],
  mcp_enabled: false,
  mcp_port: 3917,
  show_streak_strip_on_rows: false,
  tint_rows_by_tag: false,
  report_widgets: [
    { id: 'streaks', kind: 'streaks', title: 'Routine streaks', tag_ids: [], days: 30, group_id: '' },
    { id: 'calendar', kind: 'calendar', title: 'Ticks per day', tag_ids: [], days: 182, group_id: '' },
    { id: 'weekly', kind: 'weekly', title: 'Ticks per week', tag_ids: [], days: 84, group_id: '' },
    { id: 'by-area', kind: 'by_tag', title: 'Ticks by area', tag_ids: [], days: 30, group_id: 'area' }
  ],
  auto_backup: true,
  auto_backups_to_keep: 14
}

// Settings that belong to one device and never sync: its window layout, its MCP endpoint and its backups.
export const DEVICE_ONLY_SETTINGS: readonly (keyof Settings)[] = [
  'sidebar_width', 'detail_width', 'table_column_widths', 'last_view', 'collapsed_task_ids', 'collapsed_sidebar_ids',
  'mcp_enabled', 'mcp_port', 'auto_backup', 'auto_backups_to_keep'
]

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
export type DatabaseBackup = Backup

// A backup is named after the UTC time it was taken, such as tasks-2026-06-10T09-30-00Z-auto.db.
export const task_backup_naming = backup_naming('tasks', '.db')

// ============================================================================
// Bridge contract
// ============================================================================

export interface SettingsApi {
  // Whether the page runs in the desktop app, in a browser served by the web server, or in the Android app.
  host: 'desktop' | 'web' | 'android'
  get_settings: () => Promise<Settings>
  set_setting: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => Promise<void>
  get_database_path: () => Promise<string>
  show_database_folder: () => Promise<void>
  list_backups: () => Promise<DatabaseBackup[]>
  create_backup: () => Promise<DatabaseBackup>
  restore_backup: (name: string) => Promise<void>
  remove_backup: (name: string) => Promise<void>
  show_backup_folder: () => Promise<void>
  // Only on Android, where backups go to a folder picked once in the phone's storage; the name is empty until one is picked.
  get_backup_folder?: () => Promise<string>
  choose_backup_folder?: () => Promise<string>
  get_mcp_status: () => Promise<McpStatus>
  get_sync_status: () => Promise<SyncStatus>
  // An empty token keeps the one saved before, for choosing a direction again with the same server.
  connect_sync: (server_url: string, token: string, direction: SyncDirection) => Promise<SyncStatus>
  disconnect_sync: () => Promise<SyncStatus>
  sync_now: () => Promise<SyncStatus>
  // The certificate authority, as PEM, that the app trusts for a server with a private or self-signed certificate.
  get_trusted_certificate: () => Promise<TrustedCertificate>
  // Saves the authority, or forgets it when given an empty text, and answers with the name it was issued to.
  set_trusted_certificate: (pem: string) => Promise<TrustedCertificate>
  // The authority behind a server certificate this device does not trust, or null when it is trusted or cannot be read.
  inspect_server_certificate: (server_url: string) => Promise<ServerCertificate | null>
}

export interface TrustedCertificate {
  pem: string
  // The name the certificate was issued to, such as "CN=TechNet Root CA"; empty when none is set.
  subject: string
}

// An authority a server's certificate chain leads to, offered to the user to trust.
export interface ServerCertificate {
  pem: string
  subject: string
  // The SHA-256 fingerprint as colon-separated hex, for checking against the authority's own copy.
  fingerprint: string
}
