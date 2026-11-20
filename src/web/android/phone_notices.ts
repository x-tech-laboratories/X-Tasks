import { LocalNotifications } from '@capacitor/local-notifications'
import { keep_phone_notices as keep_notices, type PhoneNotice, type PhoneNotices } from '@x-tech-laboratories/x-libs/phone_notices'

import { pomodoro_ended_message, type PomodoroState } from '@shared/pomodoro'
import { reminder_body, reminders_between } from '@shared/reminders'
import type { Settings } from '@shared/settings'
import type { Task } from '@shared/tasks'

// ============================================================================
// Phone notices
// ============================================================================

// A phone has no daemon, so whatever must reach the user while the app is closed is handed to Android ahead of time:
// each timed task's reminder and the end of the running Pomodoro phase. X-Libs sets them again whenever the tasks or
// settings change, and each time the app opens or comes back, so a moved or finished task never rings.

// Every notice due from now until a later moment, each tap opening its task.
export function phone_notices(tasks: Task[], settings: Settings, pomodoro: PomodoroState | null, now: number, until: number): PhoneNotice[] {
  const notices: PhoneNotice[] = []
  for (const reminder of reminders_between(tasks, settings.task_date_field, now, until, settings.reminder_lead_minutes, settings.remind_due_tasks)) {
    notices.push({
      key: reminder.key,
      title: reminder.task.title,
      body: reminder_body(reminder, settings.task_date_field, reminder.remind_at),
      at: reminder.remind_at,
      extra: { task_id: reminder.task.id }
    })
  }
  const ends_at = pomodoro?.phase_ends_at ? Date.parse(pomodoro.phase_ends_at) : null
  if (pomodoro && ends_at !== null && ends_at > now) {
    const { title, message } = pomodoro_ended_message(pomodoro, settings)
    notices.push({ key: 'pomodoro', title, body: message, at: ends_at, extra: { task_id: pomodoro.task_id } })
  }
  return notices
}

// ============================================================================
// Handing them to Android
// ============================================================================

export interface PhoneNoticeHost {
  read: () => { tasks: Task[]; settings: Settings; pomodoro: PomodoroState | null }
  // A tap on a notice, with the task it is about.
  open_task: (task_id: string) => void
}

export function keep_phone_notices(host: PhoneNoticeHost): PhoneNotices {
  return keep_notices({
    plugin: LocalNotifications,
    read: (now, until) => {
      const { tasks, settings, pomodoro } = host.read()
      return phone_notices(tasks, settings, pomodoro, now, until)
    },
    on_tap: (extra) => {
      if (extra.task_id) host.open_task(extra.task_id)
    },
    on_error: (error) => console.error('could not set reminders', error)
  })
}
