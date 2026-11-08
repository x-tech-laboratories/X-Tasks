import type { ReportWidget, TaskRelationship } from '@shared/settings'
import { format_local, parse_local } from '@x-tech-laboratories/x-libs/dates'
import {
  record_since, repeating_ancestor_of, routine_history, routine_streak, subtask_history, subtask_streak, type HistoryMark, type RoutineRecord,
  type RoutineStreak
} from '@shared/streaks'
import type { Completion, Tag, Task } from '@shared/tasks'
import { children_of } from '@x-tech-laboratories/x-libs/web/tree'
import { task_is_in_view } from './views'

// ============================================================================
// Days
// ============================================================================

export function day_offset(day: string, offset: number): string {
  const date = parse_local(day)
  return format_local(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset), false)
}

// The Monday on or before a day.
export function week_start_of(day: string): string {
  return day_offset(day, -((parse_local(day).getDay() + 6) % 7))
}

// The first day a card looks at, counting today as its last.
export function first_report_day(widget: ReportWidget, today: string): string {
  return day_offset(today, 1 - widget.days)
}

// ============================================================================
// Which ticks count
// ============================================================================

// The tasks a card counts: every task, or those holding all its tags.
export function tasks_for_widget(widget: ReportWidget, tasks: Task[], tags: Tag[]): Task[] {
  const known_tag_ids = widget.tag_ids.filter((tag_id) => tags.some((tag) => tag.id === tag_id))
  if (known_tag_ids.length === 0) return tasks
  return tasks.filter((task) => task_is_in_view(task, { kind: 'tag', tag_ids: known_tag_ids }, tasks, tags, ''))
}

// The local day of each tick of the given tasks that falls inside the card's days.
function tick_days(widget: ReportWidget, widget_tasks: Task[], completions: Completion[], today: string): { task_id: string; day: string }[] {
  const task_ids = new Set(widget_tasks.map((task) => task.id))
  const first_day = first_report_day(widget, today)
  return completions
    .filter((entry) => task_ids.has(entry.task_id))
    .map((entry) => ({ task_id: entry.task_id, day: format_local(new Date(entry.done_at), false) }))
    .filter(({ day }) => day >= first_day && day <= today)
}

// ============================================================================
// Card data
// ============================================================================

export interface StreakRow {
  task: Task
  // How far below its routine a subtask sits; zero for the routine itself.
  depth: number
  streak: RoutineStreak
  record: RoutineRecord
  history: HistoryMark[]
}

// Each open routine, longest current streak first, with the subtasks it measures listed under it in their own order.
export function streak_rows(widget: ReportWidget, widget_tasks: Task[], completions: Completion[], tasks: Task[], today: string): StreakRow[] {
  const since = parse_local(first_report_day(widget, today))
  const routine_rows = widget_tasks
    .filter((task) => task.recurrence && !task.is_done)
    .map((task) => {
      const history = routine_history(task, completions)
      return { task, depth: 0, streak: routine_streak(task, completions)!, record: record_since(history, since), history }
    })
    .sort((first, second) => second.streak.current - first.streak.current || second.streak.best - first.streak.best)
  if (widget.hide_subtasks) return routine_rows

  // A subtask that repeats on its own gets a routine row instead, and so do the subtasks under it.
  function subtask_rows(routine: Task, parent: Task, depth: number): StreakRow[] {
    return children_of(parent.id, tasks).flatMap((subtask) => {
      if (repeating_ancestor_of(subtask, tasks)?.id !== routine.id) return []
      const history = subtask_history(subtask, routine, completions)
      const row = { task: subtask, depth, streak: subtask_streak(subtask, routine, completions), record: record_since(history, since), history }
      return [row, ...subtask_rows(routine, subtask, depth + 1)]
    })
  }

  return routine_rows.flatMap((row) => [row, ...subtask_rows(row.task, row.task, 1)])
}

export function ticks_per_day(widget: ReportWidget, widget_tasks: Task[], completions: Completion[], today: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { day } of tick_days(widget, widget_tasks, completions, today)) counts.set(day, (counts.get(day) ?? 0) + 1)
  return counts
}

// Every week from the first one that starts inside the card's days, oldest first, with weeks that had no ticks kept at zero.
export function ticks_per_week(widget: ReportWidget, widget_tasks: Task[], completions: Completion[], today: string): { week: string; count: number }[] {
  const first_day = first_report_day(widget, today)
  const first_week = week_start_of(first_day) < first_day ? day_offset(week_start_of(first_day), 7) : first_day
  const counts = new Map<string, number>()
  for (let week = first_week; week <= today; week = day_offset(week, 7)) counts.set(week, 0)
  for (const { day } of tick_days(widget, widget_tasks, completions, today)) {
    const week = week_start_of(day)
    if (counts.has(week)) counts.set(week, counts.get(week)! + 1)
  }
  return [...counts].map(([week, count]) => ({ week, count }))
}

// Ticks under each top tag of the group, sub-tags included, most first; ticks of tasks with none of its tags go under null.
export function ticks_per_tag(
  widget: ReportWidget,
  widget_tasks: Task[],
  completions: Completion[],
  tasks: Task[],
  tags: Tag[],
  today: string
): { tag: Tag | null; count: number }[] {
  const top_tags = tags.filter((tag) => tag.group_id === widget.group_id && tag.parent_id === null)
  const ticks = tick_days(widget, widget_tasks, completions, today)
  const task_by_id = new Map(tasks.map((task) => [task.id, task]))
  const holds = (task_id: string, tag: Tag) => {
    const task = task_by_id.get(task_id)
    return task !== undefined && task_is_in_view(task, { kind: 'tag', tag_ids: [tag.id] }, tasks, tags, '')
  }

  const rows: { tag: Tag | null; count: number }[] = top_tags.map((tag) => ({ tag, count: ticks.filter((tick) => holds(tick.task_id, tag)).length }))
  rows.push({ tag: null, count: ticks.filter((tick) => !top_tags.some((tag) => holds(tick.task_id, tag))).length })
  return rows.filter((row) => row.count > 0).sort((first, second) => second.count - first.count)
}

// ============================================================================
// Task map
// ============================================================================

export interface TaskMapNode {
  id: string
  task: Task
  // How many lines meet the task, so busier tasks draw larger.
  degree: number
}

export interface TaskMapLink {
  source: string
  target: string
  // A subtask line from parent to subtask, or a relationship link from the task that made it.
  kind: 'subtask' | 'relationship'
  // How the link reads in words, as in "Write report waits on Gather data".
  description: string
  // Whether the link reads differently each way, so it draws an arrow.
  is_directed: boolean
}

// The card's tasks that have a parent, a subtask or a link among them, with the lines between them.
export function task_map(widget: ReportWidget, widget_tasks: Task[], relationships: TaskRelationship[]): { nodes: TaskMapNode[]; links: TaskMapLink[] } {
  const shown = new Map(widget_tasks.filter((task) => widget.show_done || !task.is_done).map((task) => [task.id, task]))
  const links: TaskMapLink[] = []

  for (const task of shown.values()) {
    const parent = task.parent_id === null ? undefined : shown.get(task.parent_id)
    if (parent) links.push({ source: parent.id, target: task.id, kind: 'subtask', description: `${task.title} is a subtask of ${parent.title}`, is_directed: false })

    for (const link of task.links) {
      const other = shown.get(link.other_id)
      const relationship = relationships.find((each) => each.id === link.relationship_id)
      if (!other || !relationship) continue
      const description = `${task.title} ${relationship.name.toLowerCase()} ${other.title}`
      links.push({ source: task.id, target: other.id, kind: 'relationship', description, is_directed: relationship.name !== relationship.inverse_name })
    }
  }

  const degrees = new Map<string, number>()
  for (const { source, target } of links) for (const id of [source, target]) degrees.set(id, (degrees.get(id) ?? 0) + 1)
  const nodes = [...degrees].map(([id, degree]) => ({ id, task: shown.get(id)!, degree }))
  return { nodes, links }
}
