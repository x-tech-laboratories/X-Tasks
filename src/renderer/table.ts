import type { TableSortKey, TaskDateField } from '@shared/settings'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { format_task_date, is_overdue, task_date_of } from '@shared/schedule'
import { by_position, children_of, task_is_in_view, type TaskNode } from './views'

// ============================================================================
// Columns
// ============================================================================

// A table column is the title, the date, or one filter group, named by "group:" and the group's id.
export type TableColumn = 'title' | 'date' | `group:${string}`

export function group_column(group: TagGroup): TableColumn {
  return `group:${group.id}`
}

function group_id_of(column: string): string | null {
  return column.startsWith('group:') ? column.slice('group:'.length) : null
}

// Lists the columns after the title in their saved order, leaving out removed groups and adding new ones at the end.
export function ordered_columns(saved_order: string[], tag_groups: TagGroup[]): TableColumn[] {
  const all_columns: TableColumn[] = ['date', ...tag_groups.map(group_column)]
  const saved = saved_order.filter((column): column is TableColumn => all_columns.includes(column as TableColumn))
  return [...saved, ...all_columns.filter((column) => !saved.includes(column))]
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
export function sort_task_tree(nodes: TaskNode[], sort: TableSortKey[], tags: Tag[], tags_of: (task: Task) => Tag[], date_field: TaskDateField): TaskNode[] {
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
    if (column === 'date') return task.is_done && task.done_at ? format_task_date(new Date(task.done_at), false) : task_date_of(task, date_field)
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

export type DateFilter = 'any' | 'overdue' | 'today' | 'upcoming' | 'none'

export const DATE_FILTER_CHOICES: { value: DateFilter; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Later' },
  { value: 'none', label: 'No date' }
]

// A group filter is empty for any tag, "none" for tasks without one, or a tag id that matches that tag and the tags below it.
export interface TableFilters {
  title: string
  date: DateFilter
  group_tag_ids: Record<string, string>
}

export const NO_TAG_FILTER = 'none'

export const EMPTY_TABLE_FILTERS: TableFilters = { title: '', date: 'any', group_tag_ids: {} }

export function has_table_filters(filters: TableFilters): boolean {
  return filters.title.trim() !== '' || filters.date !== 'any' || Object.values(filters.group_tag_ids).some(Boolean)
}

// A task passes when every filter set holds, with tags counted the same way the sidebar counts them.
export function task_passes_filters(task: Task, filters: TableFilters, all_tasks: Task[], tags: Tag[], today: string, date_field: TaskDateField): boolean {
  const title_text = filters.title.trim().toLocaleLowerCase()
  if (title_text && !task.title.toLocaleLowerCase().includes(title_text)) return false
  if (!date_passes(task, filters.date, today, date_field)) return false

  return Object.entries(filters.group_tag_ids).every(([group_id, tag_id]) => {
    if (!tag_id) return true
    const has_tag = (each_id: string) => task_is_in_view(task, { kind: 'tag', tag_ids: [each_id] }, all_tasks, tags, '')
    if (tag_id !== NO_TAG_FILTER) return has_tag(tag_id)
    return !tags.some((tag) => tag.group_id === group_id && tag.parent_id === null && has_tag(tag.id))
  })
}

function date_passes(task: Task, filter: DateFilter, today: string, date_field: TaskDateField): boolean {
  const task_date = task_date_of(task, date_field)
  const task_day = task_date?.slice(0, 10) ?? null
  switch (filter) {
    case 'any': return true
    case 'overdue': return !task.is_done && task_date !== null && is_overdue(task_date)
    case 'today': return task_day === today
    case 'upcoming': return task_day !== null && task_day > today
    case 'none': return task_day === null
  }
}
