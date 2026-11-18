import { Notifier } from '@x-tech-laboratories/x-libs/agent/desktop_notify'

import { pomodoro_ended_message } from '@shared/pomodoro'
import { due_reminders, reminder_body } from '@shared/reminders'
import { get_settings, list_tasks, list_time_entries, set_setting, tick_pomodoro } from '@shared/task_database'
import { task_link } from '@shared/tasks'
import { break_message, FRESH_BREAK_COUNT, step_break_reminder } from '@shared/time_tracking'

// ============================================================================
// Notices
// ============================================================================

// What the daemon tells the user on its own, window open or not: tasks coming due, breaks, and the end of each Pomodoro phase.
// A click on a task's notification opens its link, which brings up the window on it.

// How often each check runs, so a notice is at most this late.
const REMINDER_CHECK_MS = 30_000
const BREAK_CHECK_MS = 30_000
const POMODORO_CHECK_MS = 1000

export interface NoticeHost {
  // The app's icon file.
  icon_path: string
  // Tells every window the data changed, as when a Pomodoro round ends and stops its timer.
  announce_change: () => void
  // Told why a notification could not be shown.
  on_error: (message: string) => void
}

export function keep_giving_notices(host: NoticeHost): () => void {
  const notifier = new Notifier({ app_name: 'X-Tasks', icons: { app: host.icon_path }, on_error: host.on_error })
  const show = (frame: { title: string; body: string; key: string; url?: string }): void => void notifier.show({ ...frame, icon: 'app' })

  const timers = [
    every(REMINDER_CHECK_MS, remind_due_tasks(show)),
    every(BREAK_CHECK_MS, remind_breaks(show)),
    every(POMODORO_CHECK_MS, () => {
      const ended = tick_pomodoro(new Date().toISOString())
      if (ended.length === 0) return
      host.announce_change()
      const { title, message } = pomodoro_ended_message(ended[ended.length - 1]!, get_settings())
      show({ title, body: message, key: 'pomodoro' })
    })
  ]
  return () => {
    for (const timer of timers) clearInterval(timer)
    notifier.cancel_all()
  }
}

function every(milliseconds: number, check: () => void): ReturnType<typeof setInterval> {
  check()
  return setInterval(check, milliseconds)
}

type Show = (frame: { title: string; body: string; key: string; url?: string }) => void

// Picks up from the last reminder shown, so reminders that fell while the daemon was not running show when it starts, up to half a day late.
function remind_due_tasks(show: Show): () => void {
  const saved = Date.parse(get_settings().reminded_until)
  let checked_until = Number.isNaN(saved) ? Date.now() : saved
  return () => {
    const now = Date.now()
    const settings = get_settings()
    const after = checked_until
    checked_until = now

    const reminders = due_reminders(list_tasks(), settings.task_date_field, after, now, settings.reminder_lead_minutes, settings.remind_due_tasks)
    for (const reminder of reminders) {
      show({ title: reminder.task.title, body: reminder_body(reminder, settings.task_date_field, now), key: reminder.key, url: task_link(reminder.task.id) })
    }
    if (reminders.length > 0) set_setting('reminded_until', new Date(now).toISOString())
  }
}

function remind_breaks(show: Show): () => void {
  let count = FRESH_BREAK_COUNT
  return () => {
    const settings = get_settings()
    const step = step_break_reminder(count, list_time_entries(), new Date(), settings.break_reminder_minutes, settings.break_minutes)
    count = step.count
    if (step.worked_seconds !== null) show({ title: 'Time for a break', body: break_message(step.worked_seconds), key: 'break' })
  }
}
