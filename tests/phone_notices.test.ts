import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }))

import { notice_horizon_ms } from '@x-tech-laboratories/x-libs/phone_notices'

import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { phone_notices } from '../src/web/android/phone_notices'
import { make_task } from './fixtures'

// ============================================================================
// Phone notices
// ============================================================================

const now = new Date(2026, 10, 18, 9, 0).getTime()
const until = now + notice_horizon_ms

describe('phone notices', () => {
  it('hands over each open timed task coming due, and nothing already past, done or untimed', () => {
    const tasks = [
      make_task({ id: 'later', title: 'Call the plumber', due_at: '2026-11-19T14:30' }),
      make_task({ id: 'soon', title: 'Stand-up', due_at: '2026-11-18T09:30' }),
      make_task({ id: 'past', title: 'Breakfast', due_at: '2026-11-18T08:00' }),
      make_task({ id: 'done', title: 'Shipped', due_at: '2026-11-18T10:00', is_done: true }),
      make_task({ id: 'day', title: 'Some day', due_at: '2026-11-18' })
    ]

    const notices = phone_notices(tasks, { ...DEFAULT_SETTINGS, reminder_lead_minutes: 10 }, null, now, until)

    expect(notices.map((notice) => notice.extra?.task_id).sort()).toEqual(['later', 'soon'])
    expect(notices.find((notice) => notice.extra?.task_id === 'soon')).toMatchObject({ key: 'due:soon', title: 'Stand-up', at: new Date(2026, 10, 18, 9, 20).getTime() })
    expect(notices[0]!.body).toMatch(/^Due at /)
  })

  it('hands over none when reminders are off, and none past the horizon', () => {
    const tasks = [make_task({ id: 'soon', due_at: '2026-11-18T12:00' })]

    expect(phone_notices(tasks, { ...DEFAULT_SETTINGS, remind_due_tasks: false }, null, now, until)).toEqual([])
    expect(phone_notices(tasks, DEFAULT_SETTINGS, null, now, now + 60_000)).toEqual([])
  })

  it('tells when the running Pomodoro phase ends', () => {
    const pomodoro = { task_id: 'soon', phase: 'work' as const, round: 1, phase_ends_at: new Date(now + 25 * 60_000).toISOString() }

    expect(phone_notices([], DEFAULT_SETTINGS, pomodoro, now, until)).toEqual([
      { key: 'pomodoro', title: 'Time for a break', body: 'Round 1 done. Take 5m away from it.', at: now + 25 * 60_000, extra: { task_id: 'soon' } }
    ])
    expect(phone_notices([], DEFAULT_SETTINGS, { ...pomodoro, phase: 'ready', phase_ends_at: null }, now, until)).toEqual([])
  })
})
