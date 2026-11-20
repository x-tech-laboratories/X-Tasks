import { Notifier } from '@x-tech-laboratories/x-libs/agent/desktop_notify'
import { keep_giving_scheduled_notices } from '@x-tech-laboratories/x-libs/agent/scheduled_notices'

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

  const stop_reminders = remind_due_tasks(notifier, host.on_error)
  const timers = [
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
    stop_reminders()
    notifier.cancel_all()
  }
}

function every(milliseconds: number, check: () => void): ReturnType<typeof setInterval> {
  check()
  return setInterval(check, milliseconds)
}

type Show = (frame: { title: string; body: string; key: string; url?: string }) => void

// Picks up from the last reminder shown, so reminders that fell while the daemon was not running show when it starts, up to half a day late.
function remind_due_tasks(notifier: Notifier, on_error: (message: string) => void): () => void {
  return keep_giving_scheduled_notices({
    notifier,
    check_ms: REMINDER_CHECK_MS,
    due: (after, until) => {
      const settings = get_settings()
      return due_reminders(list_tasks(), settings.task_date_field, after, until, settings.reminder_lead_minutes, settings.remind_due_tasks).map((reminder) => ({
        key: reminder.key,
        title: reminder.task.title,
        body: reminder_body(reminder, settings.task_date_field, until),
        url: task_link(reminder.task.id),
        icon: 'app'
      }))
    },
    read_checked_until: () => {
      const saved = Date.parse(get_settings().reminded_until)
      return Number.isNaN(saved) ? null : saved
    },
    write_checked_until: (moment) => set_setting('reminded_until', new Date(moment).toISOString()),
    on_error: (error) => on_error(error instanceof Error ? error.message : String(error))
  })
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
