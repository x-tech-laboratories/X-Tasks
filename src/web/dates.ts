import type { DateRange, DateRangeSplit, TaskDateField } from '@shared/settings'
import type { Task } from '@shared/tasks'
import { is_in_range, resolve_range, type ResolvedRange } from '@x-tech-laboratories/x-libs/date_ranges'
import { days_between, format_local, is_overdue, parse_local } from '@x-tech-laboratories/x-libs/dates'
import { next_schedule, task_date_of } from '@shared/schedule'
import { week_start_of } from './reports'
import type { TaskNode } from './views'

// ============================================================================
// Date groups
// ============================================================================

// A later date a repeating task will move to, shown in Upcoming before the task gets there.
export interface RepeatOccurrence {
  task: Task
  task_date: string
}

// The tasks and coming repeats that share a heading, such as Today, November or a tag.
export interface TaskGroup {
  key: string
  label: string
  nodes: TaskNode[]
  repeats: RepeatOccurrence[]
  // The one day a group stands for, which a card dropped on it moves to.
  drop_day: string | null
}

// Stops a rule that repeats every minute from filling the view.
const MOST_REPEATS_PER_TASK = 50

// A date range worked out for the current minute.
export interface ShownRange {
  range: DateRange
  span: ResolvedRange
}

export function shown_ranges(ranges: DateRange[], now: string): ShownRange[] {
  return ranges.map((range) => ({ range, span: resolve_range(range, parse_local(now)) }))
}

// The first range that holds the date, which is the one its task is listed under.
export function range_of(task_date: string, ranges: ShownRange[]): ShownRange | undefined {
  return ranges.find((shown) => is_in_range(task_date, shown.span))
}

// Upcoming lists a task only while it is overdue or inside one of the ranges.
export function is_within_ranges(task_date: string | null, ranges: ShownRange[], now: string): boolean {
  return task_date !== null && (is_overdue(task_date, parse_local(now)) || range_of(task_date, ranges) !== undefined)
}

// Tasks go under the first range holding them, split by day, week or month if it says so; open ones left out and past their date are overdue, done ones from past days earlier, and the rest later.
function group_key(task_date: string | null, is_done: boolean, now: string, ranges: ShownRange[]): string {
  if (task_date === null) return 'none'
  const day = task_date.slice(0, 10)
  const shown = range_of(task_date, ranges)
  if (shown) return shown.range.split === 'none' ? `range:${shown.range.id}` : `range:${shown.range.id}:${split_part(day, shown.range.split)}`
  if (!is_done && is_overdue(task_date, parse_local(now))) return 'overdue'
  return day < now.slice(0, 10) ? 'earlier' : 'later'
}

function split_part(day: string, split: DateRangeSplit): string {
  if (split === 'month') return day.slice(0, 7)
  if (split === 'week') return week_start_of(day)
  return day
}

function group_label(key: string, today: string, ranges: ShownRange[]): string {
  const fixed_labels: Record<string, string> = { none: 'No date', earlier: 'Earlier', overdue: 'Overdue', later: 'Later' }
  if (key in fixed_labels) return fixed_labels[key]!

  const [, range_id, part] = key.split(':')
  const shown = ranges.find((each) => each.range.id === range_id)!
  if (part === undefined) return span_label(shown)
  if (shown.range.split === 'month') return month_label(part, today)
  if (shown.range.split === 'week') return `Week of ${parse_local(part).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  return day_label(part, today)
}

// The range's name, then the days it covers when it has an end, such as "Next week · Nov 16 – 22".
function span_label(shown: ShownRange): string {
  const { first, last } = shown.span
  if (first === null || last === null || first > last) return shown.range.name
  const days = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).formatRange(parse_local(first.slice(0, 10)), parse_local(last.slice(0, 10)))
  return `${shown.range.name} · ${days}`
}

function month_label(month_key: string, today: string): string {
  const month = parse_local(`${month_key}-01`)
  return month.toLocaleDateString(undefined, { month: 'long', year: month.getFullYear() === parse_local(today).getFullYear() ? undefined : 'numeric' })
}

function day_label(day: string, today: string): string {
  const date = parse_local(day)
  const day_offset = days_between(parse_local(today), date)
  const day_name = day_offset === 0 ? 'Today' : day_offset === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' })
  return `${day_name} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// The day a card dropped on the group moves to, when the group covers that one whole day.
function drop_day(key: string, ranges: ShownRange[]): string | null {
  const [kind, range_id, part] = key.split(':')
  if (kind !== 'range') return null
  const { range, span } = ranges.find((each) => each.range.id === range_id)!
  const first_day = span.first?.slice(0, 10)
  const day = range.split === 'day' ? part : range.split === 'none' && first_day === span.last?.slice(0, 10) ? first_day : undefined
  if (day === undefined) return null
  const covers_day = (span.first === null || span.first <= `${day}T00:00`) && (span.last === null || span.last >= `${day}T23:59`)
  return covers_day ? day : null
}

// Splits the top tasks into date groups: overdue and earlier first, then the ranges in their order, then later and undated; within a group tasks run by date and time.
export function group_by_date(nodes: TaskNode[], repeats: RepeatOccurrence[], date_field: TaskDateField, now: string, keep_order: boolean, ranges: ShownRange[]): TaskGroup[] {
  const today = now.slice(0, 10)
  const groups = new Map<string, TaskGroup>()
  const group_of = (key: string) => {
    if (!groups.has(key)) groups.set(key, { key, label: group_label(key, today, ranges), nodes: [], repeats: [], drop_day: drop_day(key, ranges) })
    return groups.get(key)!
  }

  const dated_nodes = keep_order ? nodes : [...nodes].sort((first, second) => compare_dates(node_date(first, date_field), node_date(second, date_field)))
  for (const node of dated_nodes) group_of(group_key(node_date(node, date_field), node.task.is_done, now, ranges)).nodes.push(node)
  for (const repeat of repeats) group_of(group_key(repeat.task_date, false, now, ranges)).repeats.push(repeat)

  const rank = (key: string) => group_rank(key, ranges)
  return [...groups.values()].sort((first, second) => rank(first.key) - rank(second.key) || first.key.localeCompare(second.key))
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

function group_rank(key: string, ranges: ShownRange[]): number {
  if (key === 'earlier' || key === 'overdue') return 0
  if (key === 'later') return ranges.length + 1
  if (key === 'none') return ranges.length + 2
  return 1 + ranges.findIndex((shown) => shown.range.id === key.split(':')[1])
}

// ============================================================================
// Repeats
// ============================================================================

// The dates each open repeating task moves to after its current one, up to the given number of days from today.
export function coming_repeats(tasks: Task[], date_field: TaskDateField, now: string, days_ahead: number): RepeatOccurrence[] {
  if (days_ahead <= 0) return []
  const now_date = parse_local(now)
  const today_date = parse_local(now.slice(0, 10))
  const last_day = format_local(new Date(today_date.getFullYear(), today_date.getMonth(), today_date.getDate() + days_ahead), false)
  const repeats: RepeatOccurrence[] = []

  for (const task of tasks) {
    if (task.is_done || !task.recurrence || task_date_of(task, date_field) === null) continue
    let current: Task = task
    for (let count = 0; count < MOST_REPEATS_PER_TASK; count++) {
      const next = next_schedule(current, date_field)
      const task_date = next && task_date_of(next, date_field)
      if (!next || !task_date || task_date.slice(0, 10) > last_day) break
      // An overdue task's next dates can still be in the past, and those are skipped.
      if (!is_overdue(task_date, now_date)) repeats.push({ task, task_date })
      current = { ...current, ...next }
    }
  }

  return repeats.sort((first, second) => compare_dates(first.task_date, second.task_date))
}
