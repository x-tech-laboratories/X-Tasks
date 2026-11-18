import { has_time, parse_local } from '@x-tech-laboratories/x-libs/dates'

import { task_date_of } from './schedule'
import type { TaskDateField } from './settings'
import type { Task } from './tasks'

// ============================================================================
// Due reminders
// ============================================================================

// A reminder older than this when it is found, as after the app was closed, is left out rather than shown late.
export const MISSED_REMINDER_LIMIT_MS = 12 * 60 * 60 * 1000

// An open task whose date has a time, and when its reminder falls: that time less the lead.
export interface DueReminder {
  task: Task
  // The task's date and time, as milliseconds.
  date_at: number
  remind_at: number
}

// The open, timed tasks whose reminder falls after one moment and by another, oldest first, leaving out any missed by more than
// MISSED_REMINDER_LIMIT_MS; tasks dated without a time have none.
export function due_reminders(tasks: Task[], date_field: TaskDateField, after: number, until: number, lead_minutes: number): DueReminder[] {
  return reminders_between(tasks, date_field, Math.max(after, until - MISSED_REMINDER_LIMIT_MS), until, lead_minutes)
}

// Every reminder falling after one moment and by another, however far apart, as when they are handed to a phone ahead of time.
export function reminders_between(tasks: Task[], date_field: TaskDateField, earliest: number, until: number, lead_minutes: number): DueReminder[] {
  return tasks
    .flatMap((task): DueReminder[] => {
      const date = task_date_of(task, date_field)
      if (task.is_done || !date || !has_time(date)) return []
      const date_at = parse_local(date).getTime()
      const remind_at = date_at - lead_minutes * 60_000
      return remind_at > earliest && remind_at <= until ? [{ task, date_at, remind_at }] : []
    })
    .sort((first, second) => first.remind_at - second.remind_at)
}

// The line under the task's title: due now, due at a later time, or was due at a time already past.
export function reminder_body(reminder: DueReminder, date_field: TaskDateField, now: number): string {
  const time = new Date(reminder.date_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const word = date_field === 'start' ? 'Starts' : 'Due'
  if (Math.abs(reminder.date_at - now) < 60_000) return `${word} now`
  return reminder.date_at > now ? `${word} at ${time}` : `${date_field === 'start' ? 'Started' : 'Was due'} at ${time}`
}
