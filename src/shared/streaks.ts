import { next_occurrence } from 'recurrence-input'

import { format_task_date, has_time, parse_task_date, recurrence_anchor, rule_format } from '@shared/schedule'
import type { Completion, CompletionLogChange, Task } from '@shared/tasks'

// ============================================================================
// Completion log
// ============================================================================

// The log as it stands after a change, matching what the database does with the same change.
export function completions_after(completions: Completion[], task_id: string, done_at: string | null, log_change: CompletionLogChange): Completion[] {
  const latest_index = completions.findLastIndex((entry) => entry.task_id === task_id)

  switch (log_change.kind) {
    case 'add': return done_at === null ? completions : [...completions, { task_id, done_at, occurrence_on: log_change.occurrence_on }]
    case 'remove': return latest_index < 0 ? completions : completions.filter((_entry, index) => index !== latest_index)
    case 'retime': {
      if (done_at === null) return completions
      if (latest_index < 0) return [...completions, { task_id, done_at, occurrence_on: null }]
      return completions.map((entry, index) => (index === latest_index ? { ...entry, done_at } : entry))
    }
    case 'none': return completions
  }
}

// ============================================================================
// Occurrences
// ============================================================================

const MAX_OCCURRENCES_WALKED = 2000

// The occurrence after this one under the rule, or null once the rule has ended.
function next_after(rule: string, occurrence_on: string): Date | null {
  try {
    return next_occurrence(rule, parse_task_date(occurrence_on), rule_format(occurrence_on))?.next_date ?? null
  } catch {
    return null
  }
}

// A routine's logged ticks, one per occurrence in date order, each marked on time when done before the next occurrence began.
interface LoggedOccurrence {
  time: number
  next: Date | null
  is_on_time: boolean
}

function logged_occurrences(task: Task, completions: Completion[]): LoggedOccurrence[] {
  const entries = completions
    .filter((entry) => entry.task_id === task.id && entry.occurrence_on !== null)
    .map((entry) => ({ entry, occurrence: parse_task_date(entry.occurrence_on!) }))
    .sort((first, second) => first.occurrence.getTime() - second.occurrence.getTime())

  const logged: LoggedOccurrence[] = []
  for (const { entry, occurrence } of entries) {
    // A second tick of the same occurrence adds nothing.
    if (logged.at(-1)?.time === occurrence.getTime()) continue
    const next = next_after(task.recurrence, entry.occurrence_on!)
    logged.push({ time: occurrence.getTime(), next, is_on_time: next === null || new Date(entry.done_at) < next })
  }
  return logged
}

// ============================================================================
// Streaks
// ============================================================================

export interface RoutineStreak {
  // Occurrences done on time in a row up to the one now pending; zero once one has run out undone or been skipped.
  current: number
  best: number
}

// Empty for a task that does not repeat; a tick late or a skipped occurrence starts the count again.
export function routine_streak(task: Task, completions: Completion[], now = new Date()): RoutineStreak | null {
  if (!task.recurrence) return null

  let run = 0
  let best = 0
  let expected_time: number | null = null
  for (const occurrence of logged_occurrences(task, completions)) {
    run = occurrence.is_on_time ? (occurrence.time === expected_time ? run + 1 : 1) : 0
    best = Math.max(best, run)
    expected_time = occurrence.is_on_time && occurrence.next ? occurrence.next.getTime() : null
  }

  // The streak lives on while the pending occurrence is the one right after the last done, and its time has not run out.
  const pending = recurrence_anchor(task)
  if (pending === null || parse_task_date(pending).getTime() !== expected_time) return { current: 0, best }
  const pending_next = next_after(task.recurrence, pending)
  return { current: pending_next && now >= pending_next ? 0 : run, best }
}

export interface RoutineRecord {
  on_time: number
  due: number
}

// Of the routine's occurrences since a time, those done on time, out of every one done or whose time is up; counted from its first logged tick.
export function routine_record(task: Task, completions: Completion[], since: Date, now = new Date()): RoutineRecord {
  const logged = logged_occurrences(task, completions)
  const first = logged[0]
  if (!task.recurrence || !first) return { on_time: 0, due: 0 }

  const logged_by_time = new Map(logged.map((occurrence) => [occurrence.time, occurrence]))
  const with_time = completions.some((entry) => entry.task_id === task.id && entry.occurrence_on !== null && has_time(entry.occurrence_on))
  const record: RoutineRecord = { on_time: 0, due: 0 }

  // Logged ticks count wherever they fall, as a rule changed since may no longer produce their dates.
  for (const occurrence of logged) {
    if (occurrence.time < since.getTime() || occurrence.time >= now.getTime()) continue
    record.due += 1
    if (occurrence.is_on_time) record.on_time += 1
  }

  // Walks the rule from the first logged tick, counting each occurrence whose time ran out with no tick as missed.
  let occurrence: Date | null = new Date(first.time)
  for (let step = 0; occurrence && occurrence < now && step < MAX_OCCURRENCES_WALKED; step += 1) {
    const next = next_after(task.recurrence, format_task_date(occurrence, with_time))
    if (occurrence >= since && !logged_by_time.has(occurrence.getTime()) && next && next <= now) record.due += 1
    occurrence = next
  }

  return record
}
