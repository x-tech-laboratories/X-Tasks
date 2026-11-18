import { Notification } from 'electron'

import { due_reminders, reminder_body } from '@shared/reminders'
import { get_settings, list_tasks, set_setting } from './task_database'

// ============================================================================
// Due reminders
// ============================================================================

// What reminders need from the app: the icon they show and a way to open the task clicked.
export interface ReminderHost {
  icon_path: string
  open_task: (task_id: string) => void
}

// How often the main process looks for tasks coming due, so a reminder is at most this late.
const CHECK_MS = 30_000

// Notifications are kept until closed, since one let go of early stops answering clicks.
const shown = new Set<Notification>()

// Picks up from the last reminder shown, so reminders that fell while the app was closed show on the next start, up to half a day late.
let checked_until = 0

export function keep_reminding(host: ReminderHost): void {
  const saved = Date.parse(get_settings().reminded_until)
  checked_until = Number.isNaN(saved) ? Date.now() : saved
  check(host)
  setInterval(() => check(host), CHECK_MS)
}

function check(host: ReminderHost): void {
  const now = Date.now()
  const settings = get_settings()
  const after = checked_until
  checked_until = now
  if (!settings.remind_due_tasks || !Notification.isSupported()) return

  const reminders = due_reminders(list_tasks(), settings.task_date_field, after, now, settings.reminder_lead_minutes)
  for (const reminder of reminders) {
    const notification = new Notification({ title: reminder.task.title, body: reminder_body(reminder, settings.task_date_field, now), icon: host.icon_path })
    notification.on('click', () => host.open_task(reminder.task.id))
    notification.on('close', () => shown.delete(notification))
    shown.add(notification)
    notification.show()
  }
  if (reminders.length > 0) set_setting('reminded_until', new Date(now).toISOString())
}
