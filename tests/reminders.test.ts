import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { due_reminders, MISSED_REMINDER_LIMIT_MS, reminder_body } from '../src/shared/reminders'
import { add_task, attach_task_database, close_task_database, list_task_versions, list_tasks, set_task_reminders, set_task_schedule } from '../src/shared/task_database'
import { make_task } from './fixtures'

// ============================================================================
// Helpers
// ============================================================================

function at(hour: number, minute = 0, day = 17): number {
  return new Date(2026, 10, day, hour, minute).getTime()
}

const tasks = [
  make_task({ id: 'call', title: 'Call the dentist', due_at: '2026-11-17T10:00' }),
  make_task({ id: 'review', title: 'Team review', due_at: '2026-11-17T15:30', start_at: '2026-11-17T15:00' }),
  make_task({ id: 'all_day', title: 'Pay rent', due_at: '2026-11-17' }),
  make_task({ id: 'done', title: 'Done already', due_at: '2026-11-17T10:00', is_done: true })
]

const ids = (reminders: ReturnType<typeof due_reminders>) => reminders.map((reminder) => reminder.task.id)

// ============================================================================
// Due reminders
// ============================================================================

describe('due reminders', () => {
  it('finds the open timed tasks whose time falls after the last look and by now', () => {
    expect(ids(due_reminders(tasks, 'due', at(9, 59), at(10, 0), 0))).toEqual(['call'])
    expect(ids(due_reminders(tasks, 'due', at(10, 0), at(10, 1), 0))).toEqual([])
  })

  it('leaves out tasks dated without a time, and done tasks', () => {
    expect(ids(due_reminders(tasks, 'due', at(9), at(20), 0))).toEqual(['call', 'review'])
  })

  it('reads the start date when the settings make it the task date', () => {
    expect(ids(due_reminders(tasks, 'start', at(14, 59), at(15, 0), 0))).toEqual(['review'])
  })

  it('comes the set minutes ahead of the time', () => {
    expect(ids(due_reminders(tasks, 'due', at(15, 9), at(15, 10), 20))).toEqual(['review'])
  })

  it('catches up on reminders missed while closed, up to half a day back', () => {
    const now = at(2, 0, 18)

    expect(ids(due_reminders(tasks, 'due', at(8, 0), now, 0))).toEqual(['review'])
    expect(now - at(10, 0)).toBeGreaterThan(MISSED_REMINDER_LIMIT_MS)
  })

  it('says whether the task is due now, later, or was due', () => {
    const [review] = due_reminders(tasks, 'due', at(14, 59), at(15, 0), 30)
    expect(reminder_body(review!, 'due', at(15, 0))).toMatch(/^Due at 0?3:30/)
    expect(reminder_body(review!, 'due', at(15, 30))).toBe('Due now')
    expect(reminder_body(review!, 'due', at(16, 0))).toMatch(/^Was due at 0?3:30/)
  })
})

// ============================================================================
// Reminders of a task's own
// ============================================================================

describe('reminders of a task\'s own', () => {
  const own = [
    make_task({ id: 'plumber', title: 'Call the plumber', reminders: ['2026-11-17T09:00', '2026-11-17T17:00'] }),
    make_task({ id: 'timed', title: 'Stand-up', due_at: '2026-11-17T10:00', reminders: ['2026-11-17T09:45'] }),
    make_task({ id: 'finished', title: 'Finished', reminders: ['2026-11-17T09:00'], is_done: true })
  ]

  it('falls at each of its times, whatever its dates, for open tasks alone', () => {
    const found = due_reminders(own, 'due', at(8, 59), at(9, 50), 0)
    expect(found.map((reminder) => reminder.key)).toEqual(['reminder:plumber:2026-11-17T09:00', 'reminder:timed:2026-11-17T09:45'])
  })

  it('comes even with reminders for dates turned off, which leaves out only the dates', () => {
    expect(ids(due_reminders(own, 'due', at(9, 50), at(10, 0), 0, false))).toEqual([])
    expect(ids(due_reminders(own, 'due', at(9, 50), at(10, 0), 0, true))).toEqual(['timed'])
    expect(ids(due_reminders(own, 'due', at(16, 59), at(17, 0), 0, false))).toEqual(['plumber'])
  })

  it('says Reminder on a task with no timed date, and the task\'s time on one with', () => {
    const [plain, timed] = due_reminders(own, 'due', at(8, 59), at(9, 50), 0)
    expect(reminder_body(plain!, 'due', at(9))).toBe('Reminder')
    expect(reminder_body(timed!, 'due', at(9, 45))).toMatch(/^Due at /)
  })
})

describe('stored reminders', () => {
  beforeEach(() => attach_task_database(new DatabaseSync(':memory:'), ':memory:'))
  afterEach(() => close_task_database())

  it('keeps them earliest first, each once, moves them with a schedule that carries them, and records them in history', () => {
    const task = add_task('Call the plumber', null, [], null)
    expect(list_tasks()[0]!.reminders).toEqual([])

    set_task_reminders(task.id, ['2026-11-18T17:00', '2026-11-18T09:00', '2026-11-18T17:00'])
    expect(list_tasks()[0]!.reminders).toEqual(['2026-11-18T09:00', '2026-11-18T17:00'])

    set_task_schedule(task.id, { start_at: null, due_at: '2026-11-19', recurrence: '' })
    expect(list_tasks()[0]!.reminders).toEqual(['2026-11-18T09:00', '2026-11-18T17:00'])
    set_task_schedule(task.id, { start_at: null, due_at: '2026-11-20', recurrence: '', reminders: ['2026-11-19T09:00'] })
    expect(list_tasks()[0]!.reminders).toEqual(['2026-11-19T09:00'])

    expect(list_task_versions(task.id).some((version) => version.snapshot.reminders.includes('2026-11-18T17:00'))).toBe(true)
  })
})
