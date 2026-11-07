import { format_local, has_time, parse_local } from '@x-tech-laboratories/x-libs/dates'
import type { Task, TaskSchedule } from '@shared/tasks'

// ============================================================================
// Spans
// ============================================================================

// The first and last dates a task covers: its start to its due date, or the one date it has.
export interface TaskSpan {
  start: string
  end: string
}

export function task_span(task: Task): TaskSpan | null {
  const start = task.start_at ?? task.due_at
  const end = task.due_at ?? task.start_at
  if (start === null || end === null) return null
  return end < start ? { start: end, end: start } : { start, end }
}

// The day after a date, as YYYY-MM-DD, for calendars that end a span the moment the next day begins.
export function day_after(task_date: string): string {
  const date = parse_local(task_date.slice(0, 10))
  return format_local(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1), false)
}

// ============================================================================
// Moving
// ============================================================================

function schedule_of(task: Task): TaskSchedule {
  return { start_at: task.start_at, due_at: task.due_at, recurrence: task.recurrence }
}

// Moves a date by whole days, keeping its clock time if it has one.
function shifted_date(task_date: string | null, days: number): string | null {
  if (task_date === null) return null
  const date = parse_local(task_date)
  date.setDate(date.getDate() + days)
  return format_local(date, has_time(task_date))
}

// Puts a date on another day, keeping its clock time if it has one.
function on_day(task_date: string, day: Date): string {
  return `${format_local(day, false)}${has_time(task_date) ? task_date.slice(10) : ''}`
}

export function shifted_schedule(task: Task, days: number): TaskSchedule {
  return { ...schedule_of(task), start_at: shifted_date(task.start_at, days), due_at: shifted_date(task.due_at, days) }
}

// Spreads a task over whole days, keeping each date's clock time; a task with one date keeps just that one while it stays a single day.
export function day_span_schedule(task: Task, first_day: Date, last_day: Date): TaskSchedule {
  const span = task_span(task)
  if (!span) return schedule_of(task)
  const is_one_day = format_local(first_day, false) === format_local(last_day, false)

  if (is_one_day && task.start_at === null) return { ...schedule_of(task), due_at: on_day(span.end, last_day) }
  if (is_one_day && task.due_at === null) return { ...schedule_of(task), start_at: on_day(span.start, first_day) }
  return { ...schedule_of(task), start_at: on_day(span.start, first_day), due_at: on_day(span.end, last_day) }
}

// Puts a task at new clock times: both dates when there is an end, or else just the one date it has.
export function timed_schedule(task: Task, start: Date, end: Date | null): TaskSchedule {
  if (end !== null) return { ...schedule_of(task), start_at: format_local(start, true), due_at: format_local(end, true) }
  if (task.due_at === null) return { ...schedule_of(task), start_at: format_local(start, true) }
  return { ...schedule_of(task), due_at: format_local(start, true) }
}
