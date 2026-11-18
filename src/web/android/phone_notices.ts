import { LocalNotifications } from '@capacitor/local-notifications'

import { pomodoro_ended_message, type PomodoroState } from '@shared/pomodoro'
import { reminder_body, reminders_between } from '@shared/reminders'
import type { Settings } from '@shared/settings'
import type { Task } from '@shared/tasks'

// ============================================================================
// Phone notices
// ============================================================================

// A phone has no daemon, so whatever must reach the user while the app is closed is handed to Android ahead of time:
// each timed task's reminder and the end of the running Pomodoro phase. They are set again whenever the tasks or settings
// change, and each time the app opens or comes back, so a moved or finished task never rings.

// How far ahead reminders are handed over; the app sets them again long before this runs out in everyday use.
export const NOTICE_HORIZON_MS = 14 * 24 * 60 * 60 * 1000

// Android caps how many alarms one app may hold, so only the soonest are handed over.
export const MAX_NOTICES = 64

// One notice for Android to show at a set time; a tap opens its task.
export interface PhoneNotice {
  id: number
  title: string
  body: string
  at: number
  task_id: string
}

// Every notice due after now and within the horizon, soonest first.
export function phone_notices(tasks: Task[], settings: Settings, pomodoro: PomodoroState | null, now: number): PhoneNotice[] {
  const notices: PhoneNotice[] = []
  for (const reminder of reminders_between(tasks, settings.task_date_field, now, now + NOTICE_HORIZON_MS, settings.reminder_lead_minutes, settings.remind_due_tasks)) {
    notices.push({
      id: notice_id(reminder.key),
      title: reminder.task.title,
      body: reminder_body(reminder, settings.task_date_field, reminder.remind_at),
      at: reminder.remind_at,
      task_id: reminder.task.id
    })
  }
  const ends_at = pomodoro?.phase_ends_at ? Date.parse(pomodoro.phase_ends_at) : null
  if (pomodoro && ends_at !== null && ends_at > now) {
    const { title, message } = pomodoro_ended_message(pomodoro, settings)
    notices.push({ id: notice_id('pomodoro'), title, body: message, at: ends_at, task_id: pomodoro.task_id })
  }
  return notices.sort((first, second) => first.at - second.at).slice(0, MAX_NOTICES)
}

// Android names notifications by a positive 32-bit number, so each key is hashed to one (FNV-1a).
export function notice_id(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) & 0x7fffffff
}

// ============================================================================
// Handing them to Android
// ============================================================================

export interface PhoneNoticeHost {
  read: () => { tasks: Task[]; settings: Settings; pomodoro: PomodoroState | null }
  // A tap on a notice, with the task it is about.
  open_task: (task_id: string) => void
}

export interface PhoneNotices {
  // Sets every notice again; calls close together are run once.
  refresh: () => void
  // Asks once to show notifications, as when reminders are turned on.
  ask_permission: () => Promise<void>
}

const REFRESH_DELAY_MS = 500

export function keep_phone_notices(host: PhoneNoticeHost): PhoneNotices {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = Promise.resolve()

  async function set_again(): Promise<void> {
    const { tasks, settings, pomodoro } = host.read()
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) })
    const notices = phone_notices(tasks, settings, pomodoro, Date.now())
    if (notices.length === 0 || (await LocalNotifications.checkPermissions()).display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: notices.map((notice) => ({
        id: notice.id,
        title: notice.title,
        body: notice.body,
        schedule: { at: new Date(notice.at), allowWhileIdle: true },
        extra: { task_id: notice.task_id }
      }))
    })
  }

  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const task_id = (action.notification.extra as { task_id?: unknown } | undefined)?.task_id
    if (typeof task_id === 'string') host.open_task(task_id)
  })

  return {
    refresh: () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        running = running.then(set_again).catch((error: unknown) => console.error('could not set reminders', error))
      }, REFRESH_DELAY_MS)
    },
    ask_permission: async () => {
      const { display } = await LocalNotifications.checkPermissions()
      if (display !== 'granted' && display !== 'denied') await LocalNotifications.requestPermissions()
    }
  }
}
