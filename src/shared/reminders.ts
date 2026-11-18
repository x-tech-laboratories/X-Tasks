import { has_time, parse_local } from '@x-tech-laboratories/x-libs/dates'

import { task_date_of } from './schedule'
import type { TaskDateField } from './settings'
import type { Task } from './tasks'

// ============================================================================
// Due reminders
// ============================================================================

// A reminder older than this when it is found, as after the app was closed, is left out rather than shown late.
export const MISSED_REMINDER_LIMIT_MS = 12 * 60 * 60 * 1000

// One reminder of an open task: for its date and time, less the lead, or at a time of its own.
export interface DueReminder {
  task: Task
  // Names the reminder, so a notification for it replaces only its own.
  key: string
  // The task's date and time, as milliseconds; null for a reminder of its own on a task with no timed date.
  date_at: number | null
  remind_at: number
}

// The open tasks' reminders falling after one moment and by another, oldest first, leaving out any missed by more than
// MISSED_REMINDER_LIMIT_MS. Reminders for dates come only with include_dates, for a task's date with a time; a task's
// reminders of its own always come, since they were set on purpose.
export function due_reminders(tasks: Task[], date_field: TaskDateField, after: number, until: number, lead_minutes: number, include_dates = true): DueReminder[] {
  return reminders_between(tasks, date_field, Math.max(after, until - MISSED_REMINDER_LIMIT_MS), until, lead_minutes, include_dates)
}

// Every reminder falling after one moment and by another, however far apart, as when they are handed to a phone ahead of time.
export function reminders_between(tasks: Task[], date_field: TaskDateField, earliest: number, until: number, lead_minutes: number, include_dates = true): DueReminder[] {
  const falls = (moment: number): boolean => moment > earliest && moment <= until
  return tasks
    .flatMap((task): DueReminder[] => {
      if (task.is_done) return []
      const date = task_date_of(task, date_field)
      const date_at = date && has_time(date) ? parse_local(date).getTime() : null
      const found: DueReminder[] = []
      if (include_dates && date_at !== null && falls(date_at - lead_minutes * 60_000)) {
        found.push({ task, key: `due:${task.id}`, date_at, remind_at: date_at - lead_minutes * 60_000 })
      }
      for (const reminder of task.reminders ?? []) {
        const remind_at = parse_local(reminder).getTime()
        if (falls(remind_at)) found.push({ task, key: `reminder:${task.id}:${reminder}`, date_at, remind_at })
      }
      return found
    })
    .sort((first, second) => first.remind_at - second.remind_at)
}

// The line under the task's title: due now, due at a later time, or was due at a time already past.
export function reminder_body(reminder: DueReminder, date_field: TaskDateField, now: number): string {
  if (reminder.date_at === null) return 'Reminder'
  const time = new Date(reminder.date_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const word = date_field === 'start' ? 'Starts' : 'Due'
  if (Math.abs(reminder.date_at - now) < 60_000) return `${word} now`
  return reminder.date_at > now ? `${word} at ${time}` : `${date_field === 'start' ? 'Started' : 'Was due'} at ${time}`
}
