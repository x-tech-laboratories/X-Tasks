import { describe_rule, next_from_now, next_occurrence, type RuleFormat } from 'recurrence-input'

import type { RescheduleOption } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'

// ============================================================================
// Task dates
// ============================================================================

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export function has_time(task_date: string): boolean {
  return task_date.includes('T')
}

export function parse_task_date(task_date: string): Date {
  const [day = '', time = '00:00'] = task_date.split('T')
  const [year = 0, month = 1, day_of_month = 1] = day.split('-').map(Number)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return new Date(year, month - 1, day_of_month, hours, minutes)
}

export function format_task_date(date: Date, with_time: boolean): string {
  const pad = (number: number) => String(number).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return with_time ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

function start_of_day(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function days_between(first: Date, second: Date): number {
  return Math.round((start_of_day(second).getTime() - start_of_day(first).getTime()) / DAY_IN_MILLISECONDS)
}

// A date without a time is overdue only once its day has passed.
export function is_overdue(task_date: string, now = new Date()): boolean {
  const date = parse_task_date(task_date)
  return has_time(task_date) ? date < now : date < start_of_day(now)
}

export function task_date_label(task_date: string, now = new Date()): string {
  const date = parse_task_date(task_date)
  const day_offset = days_between(now, date)
  const nearby_days: Record<number, string> = { [-1]: 'Yesterday', 0: 'Today', 1: 'Tomorrow' }
  const day_label =
    nearby_days[day_offset] ??
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    })

  if (!has_time(task_date)) return day_label
  return `${day_label} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

// ============================================================================
// Recurrence
// ============================================================================

// The due date anchors the rule, or the start date when there is no due date.
export function recurrence_anchor(schedule: TaskSchedule): string | null {
  return schedule.due_at ?? schedule.start_at
}

// Rules use local clock times, and plain dates when the anchor has no time.
export function rule_format(anchor: string | null): RuleFormat {
  return { time_mode: 'floating', all_day: anchor === null || !has_time(anchor) }
}

export function describe_recurrence(schedule: TaskSchedule): string {
  if (!schedule.recurrence) return 'Does not repeat'
  return describe_rule(schedule.recurrence, rule_format(recurrence_anchor(schedule))) || 'Custom rule'
}

// Puts the anchor date at new_anchor and moves the other date by the same number of days, keeping its own time.
function moved_dates(schedule: TaskSchedule, new_anchor: Date): Pick<TaskSchedule, 'start_at' | 'due_at'> {
  const anchor = recurrence_anchor(schedule)
  // A task with no dates gets a due date.
  if (anchor === null) return { start_at: null, due_at: format_task_date(new_anchor, false) }

  const anchor_date = parse_task_date(anchor)
  function moved(task_date: string | null): string | null {
    if (task_date === null) return null
    if (task_date === anchor) return format_task_date(new_anchor, has_time(task_date))
    const date = parse_task_date(task_date)
    const moved_date = new Date(new_anchor.getFullYear(), new_anchor.getMonth(), new_anchor.getDate() + days_between(anchor_date, date))
    moved_date.setHours(date.getHours(), date.getMinutes())
    return format_task_date(moved_date, has_time(task_date))
  }

  return { start_at: moved(schedule.start_at), due_at: moved(schedule.due_at) }
}

// Moves a recurring task's dates to its next occurrence, keeping the gap between start and due; null once the rule has ended.
export function next_schedule(task: Task): TaskSchedule | null {
  if (!task.recurrence) return null

  const anchor = recurrence_anchor(task)
  const anchor_date = anchor ? parse_task_date(anchor) : start_of_day(new Date())
  let next: ReturnType<typeof next_occurrence>
  try {
    next = next_occurrence(task.recurrence, anchor_date, rule_format(anchor))
  } catch {
    return null
  }
  if (!next) return null

  return { ...moved_dates(task, next.next_date), recurrence: next.rule }
}

// ============================================================================
// Rescheduling
// ============================================================================

// The day an option points to, or null when its rule is unreadable or yields no date.
export function reschedule_day(option: RescheduleOption, now = new Date()): Date | null {
  if (option.mode === 'days') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + option.days)

  try {
    const next_date = next_from_now(option.rule, rule_format(null))
    return next_date && start_of_day(next_date)
  } catch {
    return null
  }
}

// Moves the task's due date, or its start date when it has no due date, to the given day at its own time.
export function rescheduled(task: Task, day: Date): TaskSchedule {
  const anchor = recurrence_anchor(task)
  const new_anchor = new Date(day)
  if (anchor && has_time(anchor)) {
    const anchor_date = parse_task_date(anchor)
    new_anchor.setHours(anchor_date.getHours(), anchor_date.getMinutes())
  }
  return { ...moved_dates(task, new_anchor), recurrence: task.recurrence }
}
