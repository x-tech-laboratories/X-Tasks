import { format_local } from '@x-tech-laboratories/x-libs/dates'
import { format_duration } from '@x-tech-laboratories/x-libs/durations'

import type { Task } from './tasks'

// ============================================================================
// Time entries
// ============================================================================

// One stretch of work on a task, between two ISO times; the timer is running while it has no end.
export interface TimeEntry {
  id: string
  task_id: string
  started_at: string
  ended_at: string | null
}

// The running timers, oldest first, one per task: two devices that started one on the same task apart show the later.
// With only one timer allowed, the latest started alone, as two devices can leave two running.
export function running_entries(entries: TimeEntry[], allow_several: boolean): TimeEntry[] {
  const latest_by_task = new Map<string, TimeEntry>()
  for (const entry of entries) {
    if (entry.ended_at !== null) continue
    const latest = latest_by_task.get(entry.task_id)
    if (!latest || entry.started_at > latest.started_at) latest_by_task.set(entry.task_id, entry)
  }
  const running = [...latest_by_task.values()].sort((first, second) => first.started_at.localeCompare(second.started_at))
  return allow_several ? running : running.slice(-1)
}

// The entries with the running ones ended at the given time, those of one task or every one, never before their start.
export function stopped_entries(entries: TimeEntry[], ended_at: string, task_id: string | null): TimeEntry[] {
  return entries.map((entry) =>
    entry.ended_at === null && (task_id === null || entry.task_id === task_id) ? { ...entry, ended_at: entry.started_at > ended_at ? entry.started_at : ended_at } : entry
  )
}

// A running entry counts up to now.
export function entry_seconds(entry: TimeEntry, now: Date): number {
  const ended_at = entry.ended_at === null ? now : new Date(entry.ended_at)
  return Math.max(0, (ended_at.getTime() - new Date(entry.started_at).getTime()) / 1000)
}

// ============================================================================
// Totals
// ============================================================================

// Seconds worked on each local day, as YYYY-MM-DD, with an entry that runs past midnight split between the days.
export function seconds_by_day(entries: TimeEntry[], now: Date): Map<string, number> {
  const by_day = new Map<string, number>()

  for (const entry of entries) {
    const ended_at = entry.ended_at === null ? now : new Date(entry.ended_at)
    let piece_start = new Date(entry.started_at)
    while (piece_start < ended_at) {
      const next_midnight = new Date(piece_start.getFullYear(), piece_start.getMonth(), piece_start.getDate() + 1)
      const piece_end = next_midnight < ended_at ? next_midnight : ended_at
      const day = format_local(piece_start, false)
      by_day.set(day, (by_day.get(day) ?? 0) + (piece_end.getTime() - piece_start.getTime()) / 1000)
      piece_start = piece_end
    }
  }

  return by_day
}

export function task_entries(entries: TimeEntry[], task_id: string): TimeEntry[] {
  return entries.filter((entry) => entry.task_id === task_id)
}

export function total_seconds(entries: TimeEntry[], now: Date): number {
  return entries.reduce((total, entry) => total + entry_seconds(entry, now), 0)
}

// Time spent in words, to the minute from a minute on, such as "1 hour, 5 minutes".
export function time_spent_label(seconds: number): string {
  if (seconds < 60) return format_duration(seconds)
  return format_duration(Math.floor(seconds / 60) * 60, { largest_unit: 'hours' })
}

// A time in hours and minutes, such as "1h 30m" or "45m", for rows and headings.
export function short_time_label(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes}m`
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
}

// ============================================================================
// Estimates
// ============================================================================

const ESTIMATE_PART = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)/g

// An estimate in minutes typed as "1h 30m", "1.5h", "90m", "1:30" or plain minutes such as "45"; empty text or zero clears it, and text it cannot read gives undefined.
export function parse_estimate(text: string): number | null | undefined {
  const typed = text.trim().toLowerCase()
  if (typed === '') return null

  const clock = /^(\d+):(\d{1,2})$/.exec(typed)
  const minutes = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : /^\d+(\.\d+)?$/.test(typed)
      ? Number(typed)
      : parts_in_minutes(typed)
  if (minutes === undefined) return undefined
  return Math.round(minutes) === 0 ? null : Math.round(minutes)
}

// The minutes in text made only of hour and minute parts, or undefined when anything else is in it.
function parts_in_minutes(typed: string): number | undefined {
  if (typed.replace(ESTIMATE_PART, '').trim() !== '') return undefined
  let minutes = 0
  for (const [, amount, unit] of typed.matchAll(ESTIMATE_PART)) minutes += Number(amount) * (unit!.startsWith('h') ? 60 : 1)
  return minutes
}

// An estimate as it is typed back into its field.
export function estimate_text(estimate_minutes: number | null): string {
  return estimate_minutes === null ? '' : short_time_label(estimate_minutes * 60)
}

// The estimated time not yet spent on open tasks: each task's estimate less what was spent on it, never below nothing.
export function estimate_left_seconds(tasks: Task[], entries: TimeEntry[], now: Date): number {
  return tasks.reduce((left, task) => {
    if (task.is_done || task.estimate_minutes === null) return left
    return left + Math.max(0, task.estimate_minutes * 60 - total_seconds(task_entries(entries, task.id), now))
  }, 0)
}
