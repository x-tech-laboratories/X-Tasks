import type { TableSortKey, TaskDateField } from '@shared/settings'
import type { RoutineStreak } from '@shared/streaks'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { ordered_columns as ordered_column_ids, sorted_tree, type TreeRow } from '@x-tech-laboratories/x-libs/web/tables'
import { days_between, format_local, has_time, is_overdue, parse_local } from '@x-tech-laboratories/x-libs/dates'
import { format_duration } from '@x-tech-laboratories/x-libs/durations'
import { task_date_of } from '@shared/schedule'
import { in_tree_order } from '@x-tech-laboratories/x-libs/web/tree'
import { task_is_in_view, type TaskNode } from './views'

// ============================================================================
// Columns
// ============================================================================

// A table column is the title, a date, the duration, a mark, the streak, the history strip, or one filter group, named by "group:" and the group's id.
export type TableColumn = 'title' | DateColumn | 'duration' | MarkColumn | 'streak' | 'history' | `group:${string}`

// The columns that each show one mark: the task is in My Day, has notes, or repeats.
export type MarkColumn = 'my_day' | 'notes' | 'repeats'

export function is_mark_column(column: string): column is MarkColumn {
  return column === 'my_day' || column === 'notes' || column === 'repeats'
}

// The smart date shows the done date once a task is ticked and the date picked in settings before that; the others show one date each.
export type DateColumn = 'date' | 'start' | 'due' | 'done'

export function is_date_column(column: string): column is DateColumn {
  return column === 'date' || column === 'start' || column === 'due' || column === 'done'
}

// The columns that stay hidden until turned on in the columns menu.
const OPTIONAL_COLUMNS: TableColumn[] = ['start', 'due', 'done', 'duration']

export function is_column_shown(column: TableColumn, hidden: string[], shown: string[]): boolean {
  return OPTIONAL_COLUMNS.includes(column) ? shown.includes(column) : !hidden.includes(column)
}

// When a task was last ticked, from its completion log; empty for one never done.
export type LastDoneOf = (task: Task) => string | null

// The date a date column shows for a task, or empty when it has none; a repeating task is never left done, so its done date is its last tick.
export function column_date(task: Task, column: DateColumn, date_field: TaskDateField, last_done_of: LastDoneOf): string | null {
  const done_at = task.recurrence ? last_done_of(task) : task.is_done ? task.done_at : null
  const done_date = done_at ? format_local(new Date(done_at), false) : null
  switch (column) {
    case 'date': return (task.is_done ? done_date : null) ?? task_date_of(task, date_field)
    case 'start': return task.start_at
    case 'due': return task.due_at
    case 'done': return done_date
  }
}

// How many minutes lie between a task's start and due dates, counting whole days when either has no time; empty when one is missing or due comes first.
export function task_duration_minutes(task: Task): number | null {
  if (task.start_at === null || task.due_at === null) return null
  const start = parse_local(task.start_at)
  const due = parse_local(task.due_at)
  const minutes = has_time(task.start_at) && has_time(task.due_at)
    ? Math.round((due.getTime() - start.getTime()) / 60_000)
    : days_between(start, due) * MINUTES_IN_DAY
  return minutes >= 0 ? minutes : null
}

const MINUTES_IN_DAY = 24 * 60

// A duration in minutes in its two largest units, such as 1 week 2 days.
export function task_duration_label(minutes: number): string {
  return minutes === 0 ? 'Same day' : format_duration(minutes * 60, { separator: ' ', largest_unit: 'weeks' })
}

// The streak a task's row shows, or empty for a task that neither repeats nor sits under one that does.
export type StreakOf = (task: Task) => RoutineStreak | null

export function group_column(group: TagGroup): TableColumn {
  return `group:${group.id}`
}

function group_id_of(column: string): string | null {
  return column.startsWith('group:') ? column.slice('group:'.length) : null
}

// Every column after the title, in the order a table starts with.
export function all_table_columns(tag_groups: TagGroup[]): TableColumn[] {
  return ['date', ...OPTIONAL_COLUMNS, 'my_day', 'notes', 'repeats', 'streak', 'history', ...tag_groups.map(group_column)]
}

// Lists the columns after the title in their saved order, leaving out removed groups and placing any column not yet saved just after the one before it.
export function ordered_columns(saved_order: string[], tag_groups: TagGroup[]): TableColumn[] {
  return ordered_column_ids(saved_order, all_table_columns(tag_groups)) as TableColumn[]
}

// How wide a column starts, and the narrowest and widest it can be dragged to.
export const COLUMN_WIDTH_RANGE = { min: 64, max: 480 }

export function default_column_width(column: TableColumn): number {
  if (is_date_column(column)) return 104
  if (is_mark_column(column)) return 64
  if (column === 'streak') return 84
  if (column === 'duration') return 112
  return 124
}

export function column_width(widths: Record<string, number>, column: TableColumn): number {
  return widths[column] ?? default_column_width(column)
}

// ============================================================================
// Sorting
// ============================================================================

// What a column's sort value needs to know besides the task.
export interface SortContext {
  tags_of: (task: Task) => Tag[]
  streak_of: StreakOf
  is_in_my_day: (task: Task) => boolean
  date_field: TaskDateField
  last_done_of: LastDoneOf
  // Every tag numbered in its sidebar order, and in that order with each set of siblings reversed.
  tag_rank: Map<string, number>
  reversed_tag_rank: Map<string, number>
}

// Numbers every tag in its sidebar order, so a tag column sorts the way its group reads, such as High before Low.
export function tag_ranks(tags: Tag[], is_reversed: boolean): Map<string, number> {
  return new Map(in_tree_order(tags, is_reversed).map((tag, index) => [tag.id, index]))
}

// The value a column sorts a task by, or null for an empty cell, which sorts last either way.
// A descending tag column reverses each set of sibling tags but still puts a tag before the tags below it, so it hands the table a value it flips back.
export function table_sort_value(task: Task, column: TableColumn, context: SortContext, is_descending: boolean): string | number | null {
  if (column === 'title') return task.title
  if (is_date_column(column)) return column_date(task, column, context.date_field, context.last_done_of)
  if (column === 'duration') return task_duration_minutes(task)
  if (column === 'my_day') return context.is_in_my_day(task) ? 1 : null
  if (column === 'notes') return task.notes ? 1 : null
  if (column === 'repeats') return task.recurrence ? 1 : null
  if (column === 'streak') return context.streak_of(task)?.current ?? null
  if (column === 'history') return null
  const group_id = group_id_of(column)
  const ranks_by_id = is_descending ? context.reversed_tag_rank : context.tag_rank
  const ranks = context.tags_of(task).filter((tag) => tag.group_id === group_id).map((tag) => ranks_by_id.get(tag.id) ?? 0)
  if (ranks.length === 0) return null
  return is_descending ? -Math.min(...ranks) : Math.min(...ranks)
}

// Sorts each level of the tree on its own, so subtasks stay under their parents, in the order the table shows them.
export function sort_task_tree(nodes: TaskNode[], sort: TableSortKey[], context: SortContext): TaskNode[] {
  if (sort.length === 0) return nodes
  const columns = sort.map((key) => ({ id: key.column, label: key.column, sort: (node: TaskNode) => table_sort_value(node.task, key.column as TableColumn, context, key.is_descending) }))
  const sorting = sort.map((key) => ({ key: key.column, descending: key.is_descending }))
  const as_nodes = (rows: TreeRow<TaskNode>[]): TaskNode[] => rows.map(({ row, children }) => ({ task: row.task, children: as_nodes(children) }))
  return as_nodes(sorted_tree(columns, nodes, sorting, (node) => node.children))
}


// ============================================================================
// Filtering
// ============================================================================

export type DateFilter = 'any' | 'overdue' | 'earlier' | 'today' | 'upcoming' | 'none'

// Only the smart and due dates can be overdue, and a done date never lies ahead.
export function date_filter_choices(column: DateColumn): { value: DateFilter; label: string }[] {
  if (column === 'done') {
    return [
      { value: 'any', label: 'Any date' },
      { value: 'earlier', label: 'Before today' },
      { value: 'today', label: 'Today' },
      { value: 'none', label: 'Not done' }
    ]
  }
  return [
    { value: 'any', label: 'Any date' },
    column === 'start' ? { value: 'earlier', label: 'Before today' } : { value: 'overdue', label: 'Overdue' },
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Later' },
    { value: 'none', label: 'No date' }
  ]
}

// A duration filter keeps tasks at most a day or a week long, longer than a week, or without both a start and a due date.
export type DurationFilter = 'any' | 'day' | 'week' | 'longer' | 'none'

export const DURATION_FILTER_CHOICES: { value: DurationFilter; label: string }[] = [
  { value: 'any', label: 'Any length' },
  { value: 'day', label: 'A day or less' },
  { value: 'week', label: 'A week or less' },
  { value: 'longer', label: 'Over a week' },
  { value: 'none', label: 'No duration' }
]

// Broken means a tracked task whose current streak is zero; untracked means one that neither repeats nor sits under one that does.
export type StreakFilter = 'any' | 'active' | 'week' | 'month' | 'broken' | 'untracked'

export const STREAK_FILTER_CHOICES: { value: StreakFilter; label: string }[] = [
  { value: 'any', label: 'Any streak' },
  { value: 'active', label: 'On a streak' },
  { value: 'week', label: '7 or more' },
  { value: 'month', label: '30 or more' },
  { value: 'broken', label: 'Streak broken' },
  { value: 'untracked', label: 'Not tracked' }
]

// A group filter is empty for any tag, "none" for tasks without one, or a tag id that matches that tag and the tags below it.
export interface TableFilters {
  title: string
  dates: Partial<Record<DateColumn, DateFilter>>
  duration: DurationFilter
  streak: StreakFilter
  group_tag_ids: Record<string, string>
}

export const NO_TAG_FILTER = 'none'

export const EMPTY_TABLE_FILTERS: TableFilters = { title: '', dates: {}, duration: 'any', streak: 'any', group_tag_ids: {} }

export function has_table_filters(filters: TableFilters): boolean {
  return filters.title.trim() !== '' || Object.values(filters.dates).some((filter) => filter !== 'any') || filters.duration !== 'any' || filters.streak !== 'any' ||
    Object.values(filters.group_tag_ids).some(Boolean)
}

export function is_column_filtered(filters: TableFilters, column: TableColumn): boolean {
  if (column === 'title') return filters.title.trim() !== ''
  if (is_date_column(column)) return (filters.dates[column] ?? 'any') !== 'any'
  if (column === 'duration') return filters.duration !== 'any'
  if (column === 'streak') return filters.streak !== 'any'
  if (is_mark_column(column) || column === 'history') return false
  return Boolean(filters.group_tag_ids[group_id_of(column)!])
}

// Clears the filter on one column, leaving the others set.
export function without_column_filter(filters: TableFilters, column: TableColumn): TableFilters {
  if (column === 'title') return { ...filters, title: '' }
  if (is_date_column(column)) return { ...filters, dates: { ...filters.dates, [column]: 'any' } }
  if (column === 'duration') return { ...filters, duration: 'any' }
  if (column === 'streak') return { ...filters, streak: 'any' }
  if (is_mark_column(column) || column === 'history') return filters
  return { ...filters, group_tag_ids: { ...filters.group_tag_ids, [group_id_of(column)!]: '' } }
}

// A task passes when every filter set holds, with tags counted the same way the sidebar counts them.
export function task_passes_filters(
  task: Task,
  filters: TableFilters,
  all_tasks: Task[],
  tags: Tag[],
  streak_of: StreakOf,
  today: string,
  date_field: TaskDateField,
  last_done_of: LastDoneOf
): boolean {
  const title_text = filters.title.trim().toLocaleLowerCase()
  if (title_text && !task.title.toLocaleLowerCase().includes(title_text)) return false
  for (const [column, filter] of Object.entries(filters.dates) as [DateColumn, DateFilter][]) {
    if (column === 'done' && filter === 'none' && task.recurrence) {
      if (!missed_its_due_date(task)) return false
    } else if (!date_passes(task, column_date(task, column, date_field, last_done_of), filter, today)) return false
  }
  if (!duration_passes(task_duration_minutes(task), filters.duration)) return false
  if (!streak_passes(streak_of(task), filters.streak)) return false

  return Object.entries(filters.group_tag_ids).every(([group_id, tag_id]) => {
    if (!tag_id) return true
    const has_tag = (each_id: string) => task_is_in_view(task, { kind: 'tag', tag_ids: [each_id] }, all_tasks, tags, '')
    if (tag_id !== NO_TAG_FILTER) return has_tag(tag_id)
    return !tags.some((tag) => tag.group_id === group_id && tag.parent_id === null && has_tag(tag.id))
  })
}

function duration_passes(minutes: number | null, filter: DurationFilter): boolean {
  switch (filter) {
    case 'any': return true
    case 'day': return minutes !== null && minutes <= MINUTES_IN_DAY
    case 'week': return minutes !== null && minutes <= 7 * MINUTES_IN_DAY
    case 'longer': return minutes !== null && minutes > 7 * MINUTES_IN_DAY
    case 'none': return minutes === null
  }
}

function streak_passes(streak: RoutineStreak | null, filter: StreakFilter): boolean {
  switch (filter) {
    case 'any': return true
    case 'active': return streak !== null && streak.current > 0
    case 'week': return streak !== null && streak.current >= 7
    case 'month': return streak !== null && streak.current >= 30
    case 'broken': return streak !== null && streak.current === 0
    case 'untracked': return streak === null
  }
}

// A repeating task always has a done date once ticked, so it counts as not done while its due date has passed unticked.
function missed_its_due_date(task: Task): boolean {
  return task.due_at !== null && is_overdue(task.due_at)
}

function date_passes(task: Task, task_date: string | null, filter: DateFilter, today: string): boolean {
  const task_day = task_date?.slice(0, 10) ?? null
  switch (filter) {
    case 'any': return true
    case 'overdue': return !task.is_done && task_date !== null && is_overdue(task_date)
    case 'earlier': return task_day !== null && task_day < today
    case 'today': return task_day === today
    case 'upcoming': return task_day !== null && task_day > today
    case 'none': return task_day === null
  }
}
