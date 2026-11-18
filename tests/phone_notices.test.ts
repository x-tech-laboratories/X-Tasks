import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }))

import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { MAX_NOTICES, notice_id, phone_notices } from '../src/web/android/phone_notices'
import { make_task } from './fixtures'

// ============================================================================
// Phone notices
// ============================================================================

const now = new Date(2026, 10, 18, 9, 0).getTime()

describe('phone notices', () => {
  it('hands over each open timed task coming due, soonest first, and nothing already past, done or untimed', () => {
    const tasks = [
      make_task({ id: 'later', title: 'Call the plumber', due_at: '2026-11-19T14:30' }),
      make_task({ id: 'soon', title: 'Stand-up', due_at: '2026-11-18T09:30' }),
      make_task({ id: 'past', title: 'Breakfast', due_at: '2026-11-18T08:00' }),
      make_task({ id: 'done', title: 'Shipped', due_at: '2026-11-18T10:00', is_done: true }),
      make_task({ id: 'day', title: 'Some day', due_at: '2026-11-18' })
    ]

    const notices = phone_notices(tasks, { ...DEFAULT_SETTINGS, reminder_lead_minutes: 10 }, null, now)

    expect(notices.map((notice) => notice.task_id)).toEqual(['soon', 'later'])
    expect(notices[0]).toMatchObject({ title: 'Stand-up', at: new Date(2026, 10, 18, 9, 20).getTime(), id: notice_id('due:soon') })
    expect(notices[0]!.body).toMatch(/^Due at /)
  })

  it('hands over none when reminders are off, and never more than Android allows', () => {
    const tasks = Array.from({ length: 100 }, (_, index) => make_task({ id: `task-${index}`, due_at: '2026-11-18T12:00' }))
    expect(phone_notices(tasks, { ...DEFAULT_SETTINGS, remind_due_tasks: false }, null, now)).toEqual([])
    expect(phone_notices(tasks, DEFAULT_SETTINGS, null, now)).toHaveLength(MAX_NOTICES)
  })

  it('tells when the running Pomodoro phase ends', () => {
    const pomodoro = { task_id: 'soon', phase: 'work' as const, round: 1, phase_ends_at: new Date(now + 25 * 60_000).toISOString() }

    expect(phone_notices([], DEFAULT_SETTINGS, pomodoro, now)).toEqual([
      { id: notice_id('pomodoro'), title: 'Time for a break', body: 'Round 1 done. Take 5m away from it.', at: now + 25 * 60_000, task_id: 'soon' }
    ])
    expect(phone_notices([], DEFAULT_SETTINGS, { ...pomodoro, phase: 'ready', phase_ends_at: null }, now)).toEqual([])
  })

  it('names each notice by a positive 32-bit number that stays the same', () => {
    expect(notice_id('due:soon')).toBe(notice_id('due:soon'))
    expect(notice_id('due:soon')).not.toBe(notice_id('due:later'))
    expect(notice_id('pomodoro')).toBeGreaterThanOrEqual(0)
    expect(notice_id('pomodoro')).toBeLessThanOrEqual(0x7fffffff)
  })
})
