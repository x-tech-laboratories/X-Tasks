import type { ReportWidget } from '@shared/settings'
import { format_task_date, parse_task_date } from '@shared/schedule'
import {
  record_since, repeating_ancestor_of, routine_history, routine_streak, subtask_history, subtask_streak, type HistoryMark, type RoutineRecord,
  type RoutineStreak
} from '@shared/streaks'
import type { Completion, Tag, Task } from '@shared/tasks'
import { children_of, task_is_in_view } from './views'

// ============================================================================
// Days
// ============================================================================

export function day_offset(day: string, offset: number): string {
  const date = parse_task_date(day)
  return format_task_date(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset), false)
}

// The Monday on or before a day.
export function week_start_of(day: string): string {
  return day_offset(day, -((parse_task_date(day).getDay() + 6) % 7))
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
    .map((entry) => ({ task_id: entry.task_id, day: format_task_date(new Date(entry.done_at), false) }))
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
  const since = parse_task_date(first_report_day(widget, today))
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

// Every week the card's days touch, oldest first, with weeks that had no ticks kept at zero.
export function ticks_per_week(widget: ReportWidget, widget_tasks: Task[], completions: Completion[], today: string): { week: string; count: number }[] {
  const counts = new Map<string, number>()
  for (let week = week_start_of(first_report_day(widget, today)); week <= today; week = day_offset(week, 7)) counts.set(week, 0)
  for (const { day } of tick_days(widget, widget_tasks, completions, today)) {
    const week = week_start_of(day)
    counts.set(week, (counts.get(week) ?? 0) + 1)
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
