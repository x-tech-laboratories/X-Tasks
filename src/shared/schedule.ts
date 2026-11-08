import { add_days, add_months, days_between, format_local, has_time, parse_local, start_of_day } from '@x-tech-laboratories/x-libs/dates'
import { format_duration } from '@x-tech-laboratories/x-libs/durations'
import { describe_rule, next_from_now, next_occurrence, parse_rule, type RuleFormat } from 'recurrence-input'

import { DURATION_UNITS, type OverdueRepeatReschedule, type RescheduleOption, type TaskDateField, type TaskDuration } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'

// ============================================================================
// Task dates
// ============================================================================

// The task's due date or start date, whichever the settings make its date.
export function task_date_of(schedule: TaskSchedule, field: TaskDateField): string | null {
  return field === 'start' ? schedule.start_at : schedule.due_at
}

// ============================================================================
// Durations
// ============================================================================

// How many seconds one of each unit is, a month counting as 30 days as format_duration counts it.
const SECONDS_IN = { months: 2592000, weeks: 604800, days: 86400, hours: 3600, minutes: 60 } as const

function needs_time(duration: TaskDuration): boolean {
  return duration.hours > 0 || duration.minutes > 0
}

// A duration's name, such as 1 hour 30 minutes, with Same day when every unit is zero.
export function duration_label(duration: TaskDuration): string {
  const parts = DURATION_UNITS.filter((unit) => duration[unit] > 0).map((unit) => format_duration(duration[unit] * SECONDS_IN[unit], { largest_unit: unit }))
  return parts.length > 0 ? parts.join(' ') : 'Same day'
}

// A duration with minutes or hours needs a start time, and Same day is only for a start without one.
export function durations_for_start(durations: TaskDuration[], start_at: string): TaskDuration[] {
  if (has_time(start_at)) return durations.filter((duration) => DURATION_UNITS.some((unit) => duration[unit] > 0))
  return durations.filter((duration) => !needs_time(duration))
}

// The due date that lies the given duration after the start, with a time only when the start has one.
export function due_after(start_at: string, duration: TaskDuration): string {
  const due = add_days(add_months(parse_local(start_at), duration.months), duration.weeks * 7 + duration.days)
  due.setHours(due.getHours() + duration.hours, due.getMinutes() + duration.minutes)
  return format_local(due, has_time(start_at))
}

// The start that lies the given duration before the due date, or null when no start leads back to that exact due date,
// such as a start without a time before a due date with one, or a month back from the 31st.
export function start_before(due_at: string, duration: TaskDuration, with_time: boolean): string | null {
  const due = parse_local(due_at)
  due.setHours(due.getHours() - duration.hours, due.getMinutes() - duration.minutes)
  due.setDate(due.getDate() - duration.weeks * 7 - duration.days)
  const last_day = new Date(due.getFullYear(), due.getMonth() - duration.months + 1, 0).getDate()
  const start = new Date(due.getFullYear(), due.getMonth() - duration.months, Math.min(due.getDate(), last_day), due.getHours(), due.getMinutes())
  const start_at = format_local(start, with_time)
  return due_after(start_at, duration) === due_at ? start_at : null
}

// Moves a date as far as another date moved from `from` to `to`: to the minute when all three have a time, or else by whole days.
export function moved_alongside(task_date: string, from: string, to: string): string {
  const date = parse_local(task_date)
  const from_date = parse_local(from)
  const to_date = parse_local(to)
  if (has_time(task_date) && has_time(from) && has_time(to)) date.setMinutes(date.getMinutes() + Math.round((to_date.getTime() - from_date.getTime()) / 60_000))
  else date.setDate(date.getDate() + days_between(from_date, to_date))
  return format_local(date, has_time(task_date))
}

// The listed duration that leads from start to due, or null when the gap matches none of them.
export function duration_between(durations: TaskDuration[], start_at: string | null, due_at: string | null): TaskDuration | null {
  if (start_at === null || due_at === null) return null
  return durations_for_start(durations, start_at).find((duration) => due_after(start_at, duration) === due_at) ?? null
}

// ============================================================================
// Recurrence
// ============================================================================

// The chosen date anchors the rule, or the other date when the chosen one is missing.
export function recurrence_anchor(schedule: TaskSchedule, field: TaskDateField = 'due'): string | null {
  return field === 'start' ? schedule.start_at ?? schedule.due_at : schedule.due_at ?? schedule.start_at
}

// rrule numbers frequencies from YEARLY at 0, so HOURLY and everything shorter is 4 or more.
const HOURLY_FREQUENCY = 4

// Rules use local clock times, and plain dates when the anchor has no time.
export function rule_format(anchor: string | null): RuleFormat {
  return { time_mode: 'floating', all_day: anchor === null || !has_time(anchor) }
}

export function describe_recurrence(schedule: TaskSchedule, field: TaskDateField = 'due'): string {
  if (!schedule.recurrence) return 'Does not repeat'
  return describe_rule(schedule.recurrence, rule_format(recurrence_anchor(schedule, field))) || 'Custom rule'
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
export function with_recurrence(schedule: TaskSchedule, recurrence: string, now = new Date(), field: TaskDateField = 'due'): TaskSchedule {
  const anchor = recurrence_anchor(schedule, field)
  const time = recurrence ? rule_time(recurrence, now) : null
  if (time === null || (anchor !== null && has_time(anchor))) return { ...schedule, recurrence }

  const day = anchor === null ? now : parse_local(anchor)
  const timed_anchor = format_local(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes), true)
  if (anchor === schedule.start_at) return { ...schedule, start_at: timed_anchor, recurrence }
  if (anchor === schedule.due_at) return { ...schedule, due_at: timed_anchor, recurrence }
  if (schedule.start_at === null) return { ...schedule, due_at: timed_anchor, recurrence }
  return { ...schedule, start_at: timed_anchor, recurrence }
}

// The date rescheduling moves: the chosen date, or the other one when the task lacks it.
function moved_anchor(schedule: TaskSchedule, field: TaskDateField): string | null {
  return field === 'start' ? schedule.start_at ?? schedule.due_at : recurrence_anchor(schedule, field)
}

// Puts the anchor date at new_anchor and moves the other date by the same number of days, keeping its own time.
function moved_dates(schedule: TaskSchedule, new_anchor: Date, field: TaskDateField = 'due'): Pick<TaskSchedule, 'start_at' | 'due_at'> {
  const anchor = moved_anchor(schedule, field)
  // A task with no dates gets the chosen date.
  if (anchor === null) {
    const day = format_local(new_anchor, false)
    return field === 'start' ? { start_at: day, due_at: null } : { start_at: null, due_at: day }
  }

  const anchor_date = parse_local(anchor)
  function moved(task_date: string | null): string | null {
    if (task_date === null) return null
    if (task_date === anchor) return format_local(new_anchor, has_time(task_date))
    const date = parse_local(task_date)
    const moved_date = new Date(new_anchor.getFullYear(), new_anchor.getMonth(), new_anchor.getDate() + days_between(anchor_date, date))
    moved_date.setHours(date.getHours(), date.getMinutes())
    return format_local(moved_date, has_time(task_date))
  }

  return { start_at: moved(schedule.start_at), due_at: moved(schedule.due_at) }
}

// Moves a recurring task's dates to its next occurrence, keeping the gap between start and due; null once the rule has ended.
export function next_schedule(task: Task, field: TaskDateField = 'due'): TaskSchedule | null {
  if (!task.recurrence) return null

  const anchor = recurrence_anchor(task, field)
  const anchor_date = anchor ? parse_local(anchor) : start_of_day(new Date())
  let next: ReturnType<typeof next_occurrence>
  try {
    next = next_occurrence(task.recurrence, anchor_date, rule_format(anchor))
  } catch {
    return null
  }
  if (!next) return null

  return { ...moved_dates(task, next.next_date, field), recurrence: next.rule }
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
    const anchor_date = parse_local(anchor)
    new_anchor.setHours(anchor_date.getHours(), anchor_date.getMinutes())
  }
  return { ...moved_dates(task, new_anchor, field), recurrence: task.recurrence }
}

// ============================================================================
// Overdue repeats
// ============================================================================

// How many occurrences an overdue repeat skips at most while looking for one from today on.
const MOST_SKIPPED_REPEATS = 1000

function is_before_today(task_date: string, now: Date): boolean {
  return days_between(now, parse_local(task_date)) < 0
}

// Where an open repeating task whose date lies before today moves, or null when it stays put.
export function overdue_repeat_schedule(task: Task, mode: OverdueRepeatReschedule, field: TaskDateField, now = new Date()): TaskSchedule | null {
  const task_date = task_date_of(task, field)
  if (mode === 'off' || task.is_done || !task.recurrence || task_date === null || !is_before_today(task_date, now)) return null
  if (mode === 'today') return rescheduled(task, start_of_day(now), field)

  let current: Task = task
  for (let count = 0; count < MOST_SKIPPED_REPEATS; count++) {
    const next = next_schedule(current, field)
    const next_date = next && task_date_of(next, field)
    if (!next || !next_date) return null
    if (!is_before_today(next_date, now)) return next
    current = { ...current, ...next }
  }
  return null
}
