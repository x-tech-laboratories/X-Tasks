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

// ============================================================================
// History
// ============================================================================

// One occurrence of a routine, or one round of a subtask, and how it went; pending while it is still under way and not yet done.
export interface HistoryMark {
  time: number
  state: 'on_time' | 'late' | 'missed' | 'pending'
}

// Every occurrence from the routine's first logged tick or its pending date, whichever is earlier, up to the one under way now, oldest first.
export function routine_history(task: Task, completions: Completion[], now = new Date()): HistoryMark[] {
  if (!task.recurrence) return []
  const logged = logged_occurrences(task, completions)
  const pending = recurrence_anchor(task)
  const start_times = [...(logged[0] ? [logged[0].time] : []), ...(pending ? [parse_task_date(pending).getTime()] : [])]
  if (start_times.length === 0) return []

  // Logged ticks count wherever they fall, as a rule changed since may no longer produce their dates.
  const marks: HistoryMark[] = logged
    .filter((occurrence) => occurrence.time < now.getTime())
    .map((occurrence) => ({ time: occurrence.time, state: occurrence.is_on_time ? 'on_time' : 'late' }))
  const logged_times = new Set(logged.map((occurrence) => occurrence.time))
  const with_time = pending ? has_time(pending) : completions.some((entry) => entry.task_id === task.id && entry.occurrence_on !== null && has_time(entry.occurrence_on))

  // Walks the rule, marking each unticked occurrence as missed once its time ran out, or pending while it is still under way.
  let occurrence: Date | null = new Date(Math.min(...start_times))
  for (let step = 0; occurrence && occurrence <= now && step < MAX_OCCURRENCES_WALKED; step += 1) {
    const next = next_after(task.recurrence, format_task_date(occurrence, with_time))
    if (!logged_times.has(occurrence.getTime())) marks.push({ time: occurrence.getTime(), state: next && next <= now ? 'missed' : 'pending' })
    occurrence = next
  }

  return marks.sort((first_mark, second_mark) => first_mark.time - second_mark.time)
}

export interface RoutineRecord {
  on_time: number
  due: number
}

// Of the marks since a time, those done on time, out of all of them but the one still pending.
export function record_since(history: HistoryMark[], since: Date): RoutineRecord {
  const recent = history.filter((mark) => mark.time >= since.getTime() && mark.state !== 'pending')
  return { on_time: recent.filter((mark) => mark.state === 'on_time').length, due: recent.length }
}

// ============================================================================
// Subtasks of a repeating task
// ============================================================================

// The closest task above this one that repeats, which a subtask without a rule of its own is measured against.
export function repeating_ancestor_of(task: Task, tasks: Task[]): Task | null {
  const seen = new Set([task.id])
  let parent = tasks.find((each) => each.id === task.parent_id)
  while (parent && !seen.has(parent.id)) {
    if (parent.recurrence) return parent
    seen.add(parent.id)
    const parent_id = parent.parent_id
    parent = tasks.find((each) => each.id === parent_id)
  }
  return null
}

// Each tick of the ancestor since the subtask was added closes one round, done when the subtask was ticked since the ancestor's tick before.
// The round after the ancestor's latest tick is still open, and is timed at the subtask's tick in it or at now.
interface SubtaskRound {
  time: number
  is_done: boolean
  is_open: boolean
}

function subtask_rounds(subtask: Task, ancestor: Task, completions: Completion[], now: Date): SubtaskRound[] {
  const tick_times = (task_id: string) =>
    completions.filter((entry) => entry.task_id === task_id).map((entry) => new Date(entry.done_at).getTime()).sort((first, second) => first - second)
  const ancestor_ticks = tick_times(ancestor.id)
  const subtask_ticks = tick_times(subtask.id)
  const added_time = new Date(subtask.created_at).getTime()

  const closed_rounds = ancestor_ticks.flatMap((time, index) => {
    if (time < added_time) return []
    const previous_time = ancestor_ticks[index - 1] ?? -Infinity
    return [{ time, is_done: subtask_ticks.some((tick) => tick > previous_time && tick <= time), is_open: false }]
  })

  const open_tick = subtask_ticks.find((tick) => tick > (ancestor_ticks.at(-1) ?? -Infinity))
  return [...closed_rounds, { time: open_tick ?? now.getTime(), is_done: open_tick !== undefined, is_open: true }]
}

// Rounds in a row the subtask was done in, counting the open round once it is done there.
export function subtask_streak(subtask: Task, ancestor: Task, completions: Completion[], now = new Date()): RoutineStreak {
  let run = 0
  let best = 0
  for (const round of subtask_rounds(subtask, ancestor, completions, now)) {
    if (round.is_open && !round.is_done) continue
    run = round.is_done ? run + 1 : 0
    best = Math.max(best, run)
  }
  return { current: run, best }
}

// Each round since the subtask was added, marked by whether the subtask was done in it.
export function subtask_history(subtask: Task, ancestor: Task, completions: Completion[], now = new Date()): HistoryMark[] {
  return subtask_rounds(subtask, ancestor, completions, now).map((round) => ({
    time: round.time,
    state: round.is_done ? 'on_time' : round.is_open ? 'pending' : 'missed'
  }))
}

// ============================================================================
// Any task
// ============================================================================

// A repeating task's own streak, a subtask's streak against its repeating ancestor, or empty for any other task.
export function task_streak(task: Task, tasks: Task[], completions: Completion[], now = new Date()): RoutineStreak | null {
  if (task.recurrence) return routine_streak(task, completions, now)
  const ancestor = repeating_ancestor_of(task, tasks)
  return ancestor && subtask_streak(task, ancestor, completions, now)
}

export function task_history(task: Task, tasks: Task[], completions: Completion[], now = new Date()): HistoryMark[] {
  if (task.recurrence) return routine_history(task, completions, now)
  const ancestor = repeating_ancestor_of(task, tasks)
  return ancestor ? subtask_history(task, ancestor, completions, now) : []
}
