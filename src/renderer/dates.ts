import type { TaskDateField } from '@shared/settings'
import type { Task } from '@shared/tasks'
import { days_between, format_task_date, next_schedule, parse_task_date, task_date_of } from '@shared/schedule'
import type { TaskNode } from './views'

// ============================================================================
// Date groups
// ============================================================================

// A later date a repeating task will move to, shown in Upcoming before the task gets there.
export interface RepeatOccurrence {
  task: Task
  task_date: string
}

// The tasks and coming repeats that share a heading, such as Today, Friday or November.
export interface DateGroup {
  key: string
  label: string
  nodes: TaskNode[]
  repeats: RepeatOccurrence[]
}

// Days this close get a heading of their own; later ones are grouped by month.
const DAYS_SHOWN_ONE_BY_ONE = 7

// Stops a rule that repeats every minute from filling the view.
const MOST_REPEATS_PER_TASK = 50

// Open tasks from past days are overdue, and done ones are earlier; days within a week stand alone, and later ones share their month.
function group_key(task_date: string | null, is_done: boolean, today: string): string {
  if (task_date === null) return 'none'
  const day = task_date.slice(0, 10)
  if (day < today) return is_done ? 'earlier' : 'overdue'
  const day_offset = days_between(parse_task_date(today), parse_task_date(day))
  return day_offset < DAYS_SHOWN_ONE_BY_ONE ? day : day.slice(0, 7)
}

function group_label(key: string, today: string): string {
  const fixed_labels: Record<string, string> = { none: 'No date', earlier: 'Earlier', overdue: 'Overdue' }
  if (key in fixed_labels) return fixed_labels[key]!

  const today_date = parse_task_date(today)
  if (key.length === 7) {
    const month = parse_task_date(`${key}-01`)
    const month_name = month.toLocaleDateString(undefined, { month: 'long', year: month.getFullYear() === today_date.getFullYear() ? undefined : 'numeric' })
    return key === today.slice(0, 7) ? `Rest of ${month_name}` : month_name
  }

  const date = parse_task_date(key)
  const day_offset = days_between(today_date, date)
  const day_name = day_offset === 0 ? 'Today' : day_offset === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' })
  return `${day_name} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// Splits the top tasks into date groups, earliest first with undated ones last; within a group tasks run by date and time.
export function group_by_date(nodes: TaskNode[], repeats: RepeatOccurrence[], date_field: TaskDateField, today: string, keep_order: boolean): DateGroup[] {
  const groups = new Map<string, DateGroup>()
  const group_of = (key: string) => {
    if (!groups.has(key)) groups.set(key, { key, label: group_label(key, today), nodes: [], repeats: [] })
    return groups.get(key)!
  }

  const dated_nodes = keep_order ? nodes : [...nodes].sort((first, second) => compare_dates(node_date(first, date_field), node_date(second, date_field)))
  for (const node of dated_nodes) group_of(group_key(node_date(node, date_field), node.task.is_done, today)).nodes.push(node)
  for (const repeat of repeats) group_of(group_key(repeat.task_date, false, today)).repeats.push(repeat)

  return [...groups.values()].sort((first, second) => group_rank(first.key) - group_rank(second.key) || sort_day(first.key).localeCompare(sort_day(second.key)))
}

function node_date(node: TaskNode, date_field: TaskDateField): string | null {
  return task_date_of(node.task, date_field)
}

// Plain string order works because dates are YYYY-MM-DD with an optional time after; undated tasks go last.
function compare_dates(first: string | null, second: string | null): number {
  if (first === second) return 0
  if (first === null) return 1
  if (second === null) return -1
  return first < second ? -1 : 1
}

// A month group holds only days past the first week, so it sorts after every day of that month shown on its own.
function sort_day(key: string): string {
  return key.length === 7 ? `${key}-99` : key
}

function group_rank(key: string): number {
  if (key === 'earlier' || key === 'overdue') return 0
  if (key === 'none') return 2
  return 1
}

// ============================================================================
// Repeats
// ============================================================================

// The dates each open repeating task moves to after its current one, up to the given number of days from today.
export function coming_repeats(tasks: Task[], date_field: TaskDateField, today: string, days_ahead: number): RepeatOccurrence[] {
  if (days_ahead <= 0) return []
  const today_date = parse_task_date(today)
  const last_day = format_task_date(new Date(today_date.getFullYear(), today_date.getMonth(), today_date.getDate() + days_ahead), false)
  const repeats: RepeatOccurrence[] = []

  for (const task of tasks) {
    if (task.is_done || !task.recurrence || task_date_of(task, date_field) === null) continue
    let current: Task = task
    for (let count = 0; count < MOST_REPEATS_PER_TASK; count++) {
      const next = next_schedule(current)
      const task_date = next && task_date_of(next, date_field)
      if (!next || !task_date || task_date.slice(0, 10) > last_day) break
      // An overdue task's next dates can still be in the past, and those are skipped.
      if (task_date.slice(0, 10) >= today) repeats.push({ task, task_date })
      current = { ...current, ...next }
    }
  }

  return repeats.sort((first, second) => compare_dates(first.task_date, second.task_date))
}
