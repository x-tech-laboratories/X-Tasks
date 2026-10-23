import type { TableSortKey, TaskDateField } from '@shared/settings'
import type { RoutineStreak } from '@shared/streaks'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { format_task_date, is_overdue, task_date_of } from '@shared/schedule'
import { by_position, children_of, task_is_in_view, type TaskNode } from './views'

// ============================================================================
// Columns
// ============================================================================

// A table column is the title, a date, the streak, or one filter group, named by "group:" and the group's id.
export type TableColumn = 'title' | DateColumn | 'streak' | `group:${string}`

// The smart date shows the done date once a task is ticked and the date picked in settings before that; the others show one date each.
export type DateColumn = 'date' | 'start' | 'due' | 'done'

export function is_date_column(column: string): column is DateColumn {
  return column === 'date' || column === 'start' || column === 'due' || column === 'done'
}

// The columns that stay hidden until turned on in the columns menu.
const OPTIONAL_COLUMNS: TableColumn[] = ['start', 'due', 'done']

export function is_column_shown(column: TableColumn, hidden: string[], shown: string[]): boolean {
  return OPTIONAL_COLUMNS.includes(column) ? shown.includes(column) : !hidden.includes(column)
}

// When a task was last ticked, from its completion log; empty for one never done.
export type LastDoneOf = (task: Task) => string | null

// The date a date column shows for a task, or empty when it has none; a repeating task is never left done, so its done date is its last tick.
export function column_date(task: Task, column: DateColumn, date_field: TaskDateField, last_done_of: LastDoneOf): string | null {
  const done_at = task.recurrence ? last_done_of(task) : task.is_done ? task.done_at : null
  const done_date = done_at ? format_task_date(new Date(done_at), false) : null
  switch (column) {
    case 'date': return (task.is_done ? done_date : null) ?? task_date_of(task, date_field)
    case 'start': return task.start_at
    case 'due': return task.due_at
    case 'done': return done_date
  }
}

// The streak a task's row shows, or empty for a task that neither repeats nor sits under one that does.
export type StreakOf = (task: Task) => RoutineStreak | null

export function group_column(group: TagGroup): TableColumn {
  return `group:${group.id}`
}

function group_id_of(column: string): string | null {
  return column.startsWith('group:') ? column.slice('group:'.length) : null
}

// Lists the columns after the title in their saved order, leaving out removed groups and placing any column not yet saved just after the one before it.
export function ordered_columns(saved_order: string[], tag_groups: TagGroup[]): TableColumn[] {
  const all_columns: TableColumn[] = ['date', ...OPTIONAL_COLUMNS, 'streak', ...tag_groups.map(group_column)]
  const ordered = saved_order.filter((column): column is TableColumn => all_columns.includes(column as TableColumn))
  all_columns.forEach((column, index) => {
    if (!ordered.includes(column)) ordered.splice(index === 0 ? 0 : ordered.indexOf(all_columns[index - 1]!) + 1, 0, column)
  })
  return ordered
}

// How wide a column starts, and the narrowest and widest it can be dragged to.
export const COLUMN_WIDTH_RANGE = { min: 64, max: 480 }

export function default_column_width(column: TableColumn): number {
  if (is_date_column(column)) return 104
  if (column === 'streak') return 84
  return 124
}

export function column_width(widths: Record<string, number>, column: TableColumn): number {
  return widths[column] ?? default_column_width(column)
}

// Moves a column to just before or after another one.
export function move_column(order: TableColumn[], column: TableColumn, target: TableColumn, is_after: boolean): TableColumn[] {
  const rest = order.filter((each) => each !== column)
  const index = rest.indexOf(target) + (is_after ? 1 : 0)
  return [...rest.slice(0, index), column, ...rest.slice(index)]
}

// ============================================================================
// Sorting
// ============================================================================

// A plain click sorts by that column alone; a Shift+click adds it to the sort or flips it; a third click takes it out.
export function sort_after_click(sort: TableSortKey[], column: TableColumn, is_adding: boolean): TableSortKey[] {
  const current = sort.find((key) => key.column === column)
  const next: TableSortKey | null = !current ? { column, is_descending: false } : current.is_descending ? null : { column, is_descending: true }

  if (!is_adding) {
    if (current && sort.length === 1) return next ? [next] : []
    return [{ column, is_descending: false }]
  }

  if (!current) return [...sort, next!]
  return next ? sort.map((key) => (key.column === column ? next : key)) : sort.filter((key) => key.column !== column)
}

// Sorts each level of the tree on its own, so subtasks stay under their parents; an empty cell sorts last either way.
export function sort_task_tree(
  nodes: TaskNode[],
  sort: TableSortKey[],
  tags: Tag[],
  tags_of: (task: Task) => Tag[],
  streak_of: StreakOf,
  date_field: TaskDateField,
  last_done_of: LastDoneOf
): TaskNode[] {
  if (sort.length === 0) return nodes
  const tag_rank = tag_ranks(tags)

  function sort_level(level: TaskNode[]): TaskNode[] {
    const sorted = [...level].sort((first, second) => {
      for (const key of sort) {
        const order = compare_cells(cell_value(first.task, key.column), cell_value(second.task, key.column), key.is_descending)
        if (order !== 0) return order
      }
      return by_position(first.task, second.task)
    })
    return sorted.map((node) => ({ ...node, children: sort_level(node.children) }))
  }

  function cell_value(task: Task, column: string): CellValue {
    if (column === 'title') return task.title
    if (is_date_column(column)) return column_date(task, column, date_field, last_done_of)
    if (column === 'streak') return streak_of(task)?.current ?? null
    const group_id = group_id_of(column)
    const ranks = tags_of(task).filter((tag) => tag.group_id === group_id).map((tag) => tag_rank.get(tag.id) ?? 0)
    return ranks.length > 0 ? Math.min(...ranks) : null
  }

  return sort_level(nodes)
}

type CellValue = string | number | null

function compare_cells(first: CellValue, second: CellValue, is_descending: boolean): number {
  const is_empty = (value: CellValue) => value === null || value === ''
  if (is_empty(first) || is_empty(second)) return Number(is_empty(first)) - Number(is_empty(second))
  const order = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' })
  return is_descending ? -order : order
}

// Lists tags the way the sidebar shows them, each followed by the tags below it.
export function tags_in_sidebar_order(tags: Tag[]): Tag[] {
  const ordered: Tag[] = []
  const visit = (parent_id: string | null) => {
    for (const tag of children_of(parent_id, tags).sort(by_position)) {
      ordered.push(tag)
      visit(tag.id)
    }
  }
  visit(null)
  return ordered
}

// Numbers every tag in its sidebar order, so a tag column sorts the way its group reads, such as High before Low.
function tag_ranks(tags: Tag[]): Map<string, number> {
  return new Map(tags_in_sidebar_order(tags).map((tag, index) => [tag.id, index]))
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
  streak: StreakFilter
  group_tag_ids: Record<string, string>
}

export const NO_TAG_FILTER = 'none'

export const EMPTY_TABLE_FILTERS: TableFilters = { title: '', dates: {}, streak: 'any', group_tag_ids: {} }

export function has_table_filters(filters: TableFilters): boolean {
  return filters.title.trim() !== '' || Object.values(filters.dates).some((filter) => filter !== 'any') || filters.streak !== 'any' ||
    Object.values(filters.group_tag_ids).some(Boolean)
}

export function is_column_filtered(filters: TableFilters, column: TableColumn): boolean {
  if (column === 'title') return filters.title.trim() !== ''
  if (is_date_column(column)) return (filters.dates[column] ?? 'any') !== 'any'
  if (column === 'streak') return filters.streak !== 'any'
  return Boolean(filters.group_tag_ids[group_id_of(column)!])
}

// Clears the filter on one column, leaving the others set.
export function without_column_filter(filters: TableFilters, column: TableColumn): TableFilters {
  if (column === 'title') return { ...filters, title: '' }
  if (is_date_column(column)) return { ...filters, dates: { ...filters.dates, [column]: 'any' } }
  if (column === 'streak') return { ...filters, streak: 'any' }
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
    if (!date_passes(task, column_date(task, column, date_field, last_done_of), filter, today)) return false
  }
  if (!streak_passes(streak_of(task), filters.streak)) return false

  return Object.entries(filters.group_tag_ids).every(([group_id, tag_id]) => {
    if (!tag_id) return true
    const has_tag = (each_id: string) => task_is_in_view(task, { kind: 'tag', tag_ids: [each_id] }, all_tasks, tags, '')
    if (tag_id !== NO_TAG_FILTER) return has_tag(tag_id)
    return !tags.some((tag) => tag.group_id === group_id && tag.parent_id === null && has_tag(tag.id))
  })
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
