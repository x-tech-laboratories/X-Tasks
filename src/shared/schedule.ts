import { describe_rule, next_from_now, next_occurrence, parse_rule, type RuleFormat } from 'recurrence-input'

import { DURATION_UNITS, type RescheduleOption, type TaskDateField, type TaskDuration } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'

// ============================================================================
// Task dates
// ============================================================================

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export function has_time(task_date: string): boolean {
  return task_date.includes('T')
}

// The task's due date or start date, whichever the settings make its date.
export function task_date_of(schedule: TaskSchedule, field: TaskDateField): string | null {
  return field === 'start' ? schedule.start_at : schedule.due_at
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
// Durations
// ============================================================================

function needs_time(duration: TaskDuration): boolean {
  return duration.hours > 0 || duration.minutes > 0
}

// A duration's name, such as 1 hour 30 minutes, with Same day when every unit is zero.
export function duration_label(duration: TaskDuration): string {
  const parts = DURATION_UNITS.filter((unit) => duration[unit] > 0).map(
    (unit) => `${duration[unit]} ${duration[unit] === 1 ? unit.slice(0, -1) : unit}`
  )
  return parts.length > 0 ? parts.join(' ') : 'Same day'
}

// A duration with minutes or hours needs a start time, and Same day is only for a start without one.
export function durations_for_start(durations: TaskDuration[], start_at: string): TaskDuration[] {
  if (has_time(start_at)) return durations.filter((duration) => DURATION_UNITS.some((unit) => duration[unit] > 0))
  return durations.filter((duration) => !needs_time(duration))
}

// The due date that lies the given duration after the start, with a time only when the start has one.
export function due_after(start_at: string, duration: TaskDuration): string {
  const start = parse_task_date(start_at)
  // A day past the end of the target month falls back to its last day, so Jan 31 plus a month is Feb 28.
  const last_day = new Date(start.getFullYear(), start.getMonth() + duration.months + 1, 0).getDate()
  const due = new Date(start.getFullYear(), start.getMonth() + duration.months, Math.min(start.getDate(), last_day), start.getHours(), start.getMinutes())
  due.setDate(due.getDate() + duration.weeks * 7 + duration.days)
  due.setHours(due.getHours() + duration.hours, due.getMinutes() + duration.minutes)
  return format_task_date(due, has_time(start_at))
}

// The listed duration that leads from start to due, or null when the gap matches none of them.
export function duration_between(durations: TaskDuration[], start_at: string | null, due_at: string | null): TaskDuration | null {
  if (start_at === null || due_at === null) return null
  return durations_for_start(durations, start_at).find((duration) => due_after(start_at, duration) === due_at) ?? null
}

// ============================================================================
// Recurrence
// ============================================================================

// The due date anchors the rule, or the start date when there is no due date.
export function recurrence_anchor(schedule: TaskSchedule): string | null {
  return schedule.due_at ?? schedule.start_at
}

// rrule numbers frequencies from YEARLY at 0, so HOURLY and everything shorter is 4 or more.
const HOURLY_FREQUENCY = 4

// Rules use local clock times, and plain dates when the anchor has no time.
export function rule_format(anchor: string | null): RuleFormat {
  return { time_mode: 'floating', all_day: anchor === null || !has_time(anchor) }
}

export function describe_recurrence(schedule: TaskSchedule): string {
  if (!schedule.recurrence) return 'Does not repeat'
  return describe_rule(schedule.recurrence, rule_format(recurrence_anchor(schedule))) || 'Custom rule'
}

// The clock time a rule sets, such as 09:30 for BYHOUR=9;BYMINUTE=30, or null when it repeats on whole days.
function rule_time(recurrence: string, now: Date): { hours: number; minutes: number } | null {
  let options: ReturnType<typeof parse_rule>
  try {
    options = parse_rule(recurrence)
  } catch {
    return null
  }
  const is_sub_daily = options.freq !== undefined && options.freq >= HOURLY_FREQUENCY
  const hours = options.byhour?.[0]
  const minutes = options.byminute?.[0]
  if (!is_sub_daily && hours === undefined && minutes === undefined) return null
  return { hours: hours ?? now.getHours(), minutes: minutes ?? (hours === undefined ? now.getMinutes() : 0) }
}

// Sets the rule, and gives the anchor a time when the rule repeats by the hour or at set times and the anchor has none.
export function with_recurrence(schedule: TaskSchedule, recurrence: string, now = new Date()): TaskSchedule {
  const anchor = recurrence_anchor(schedule)
  const time = recurrence ? rule_time(recurrence, now) : null
  if (time === null || (anchor !== null && has_time(anchor))) return { ...schedule, recurrence }

  const day = anchor === null ? now : parse_task_date(anchor)
  const timed_anchor = format_task_date(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes), true)
  if (schedule.due_at === null && schedule.start_at !== null) return { ...schedule, start_at: timed_anchor, recurrence }
  return { ...schedule, due_at: timed_anchor, recurrence }
}

// The date rescheduling moves: the chosen date, or the other one when the task lacks it.
function moved_anchor(schedule: TaskSchedule, field: TaskDateField): string | null {
  return field === 'start' ? schedule.start_at ?? schedule.due_at : recurrence_anchor(schedule)
}

// Puts the anchor date at new_anchor and moves the other date by the same number of days, keeping its own time.
function moved_dates(schedule: TaskSchedule, new_anchor: Date, field: TaskDateField = 'due'): Pick<TaskSchedule, 'start_at' | 'due_at'> {
  const anchor = moved_anchor(schedule, field)
  // A task with no dates gets the chosen date.
  if (anchor === null) {
    const day = format_task_date(new_anchor, false)
    return field === 'start' ? { start_at: day, due_at: null } : { start_at: null, due_at: day }
  }

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

// Moves the task's chosen date, or its other date when it lacks that one, to the given day at its own time.
export function rescheduled(task: Task, day: Date, field: TaskDateField): TaskSchedule {
  const anchor = moved_anchor(task, field)
  const new_anchor = new Date(day)
  if (anchor && has_time(anchor)) {
    const anchor_date = parse_task_date(anchor)
    new_anchor.setHours(anchor_date.getHours(), anchor_date.getMinutes())
  }
  return { ...moved_dates(task, new_anchor, field), recurrence: task.recurrence }
}
