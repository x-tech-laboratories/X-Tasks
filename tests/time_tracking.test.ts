import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  add_task, attach_task_database, close_task_database, list_task_versions, list_tasks, list_time_entries, remove_task, remove_time_entry, set_setting, set_task_estimate, start_timer, stop_timer
} from '../src/main/task_database'
import { entry_seconds, estimate_left_seconds, work_stretch_start, parse_estimate, running_entries, seconds_by_day, short_time_label, stopped_entries, time_spent_label, total_seconds, type TimeEntry } from '../src/shared/time_tracking'
import { make_task } from './fixtures'

// ============================================================================
// Helpers
// ============================================================================

function entry(started_at: Date, ended_at: Date | null, task_id = 'task'): TimeEntry {
  return { id: `${task_id}@${started_at.toISOString()}`, task_id, started_at: started_at.toISOString(), ended_at: ended_at?.toISOString() ?? null }
}

function local(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 10, day, hour, minute)
}

// ============================================================================
// Totals
// ============================================================================

describe('time totals', () => {
  it('counts a running entry up to now', () => {
    const running = entry(local(17, 9), null)

    expect(entry_seconds(running, local(17, 9, 30))).toBe(1800)
    expect(total_seconds([running, entry(local(16, 9), local(16, 10))], local(17, 9, 30))).toBe(5400)
  })

  it('splits an entry that runs past midnight between the two days', () => {
    const by_day = seconds_by_day([entry(local(16, 23), local(17, 1, 30))], local(17, 12))

    expect(Object.fromEntries(by_day)).toEqual({ '2026-11-16': 3600, '2026-11-17': 5400 })
  })

  it('adds up every entry on the same day', () => {
    const by_day = seconds_by_day([entry(local(17, 9), local(17, 10)), entry(local(17, 14), local(17, 14, 15))], local(17, 18))

    expect(by_day.get('2026-11-17')).toBe(4500)
  })

  it('shows only the later of two running entries when one timer is allowed, as two devices can leave', () => {
    const earlier = entry(local(17, 9), null, 'first')
    const later = entry(local(17, 10), null, 'second')

    expect(running_entries([later, earlier], false).map((each) => each.task_id)).toEqual(['second'])
    expect(running_entries([entry(local(17, 9), local(17, 10))], false)).toEqual([])
  })

  it('shows every task timed, oldest first and once each, when several are allowed', () => {
    const entries = [entry(local(17, 10), null, 'second'), entry(local(17, 9), null, 'first'), entry(local(17, 11), null, 'first')]

    expect(running_entries(entries, true).map((each) => `${each.task_id}@${new Date(each.started_at).getHours()}`)).toEqual(['second@10', 'first@11'])
  })

  it("stops one task's running entries, never before they started", () => {
    const entries = [entry(local(17, 9), null, 'first'), entry(local(17, 10), null, 'second')]

    const stopped = stopped_entries(entries, local(17, 9, 30).toISOString(), 'second')

    expect(stopped.map((each) => each.ended_at)).toEqual([null, local(17, 10).toISOString()])
  })

  it('words time to the minute from a minute on', () => {
    expect(time_spent_label(45)).toBe('45 seconds')
    expect(time_spent_label(3959)).toBe('1 hour, 5 minutes')
  })
})

// ============================================================================
// Breaks
// ============================================================================

describe('work in a row', () => {
  const now = local(17, 12)

  it('joins entries of any task across pauses shorter than a break', () => {
    const entries = [entry(local(17, 9), local(17, 10), 'first'), entry(local(17, 10, 3), local(17, 11), 'second'), entry(local(17, 11, 4), null, 'first')]

    expect(work_stretch_start(entries, now, 5)).toEqual(local(17, 9))
  })

  it('starts again after a pause as long as a break', () => {
    const entries = [entry(local(17, 9), local(17, 10)), entry(local(17, 10, 5), null)]

    expect(work_stretch_start(entries, now, 5)).toEqual(local(17, 10, 5))
  })

  it('takes in an entry that ran through the others, whatever it overlaps', () => {
    const entries = [entry(local(17, 8), local(17, 11, 30), 'long'), entry(local(17, 11), null, 'short')]

    expect(work_stretch_start(entries, now, 5)).toEqual(local(17, 8))
  })

  it('has no stretch while no timer runs', () => {
    expect(work_stretch_start([entry(local(17, 9), local(17, 10))], now, 5)).toBeNull()
  })
})

// ============================================================================
// Estimates
// ============================================================================

describe('estimates', () => {
  it('reads hours and minutes typed in several ways', () => {
    expect(parse_estimate('1h 30m')).toBe(90)
    expect(parse_estimate('1.5 hours')).toBe(90)
    expect(parse_estimate('90m')).toBe(90)
    expect(parse_estimate('1:30')).toBe(90)
    expect(parse_estimate('45')).toBe(45)
    expect(parse_estimate('2H')).toBe(120)
  })

  it('clears on empty text or zero, and refuses text it cannot read', () => {
    expect(parse_estimate('  ')).toBeNull()
    expect(parse_estimate('0m')).toBeNull()
    expect(parse_estimate('soon')).toBeUndefined()
    expect(parse_estimate('1h and a bit')).toBeUndefined()
  })

  it('shortens a time to hours and minutes', () => {
    expect(short_time_label(45 * 60)).toBe('45m')
    expect(short_time_label(120 * 60)).toBe('2h')
    expect(short_time_label(95 * 60 + 30)).toBe('1h 35m')
  })

  it('totals the estimate left on open tasks, never below nothing for one run over', () => {
    const now = local(17, 12)
    const tasks = [
      make_task({ id: 'half', estimate_minutes: 60 }),
      make_task({ id: 'over', estimate_minutes: 30 }),
      make_task({ id: 'done', estimate_minutes: 60, is_done: true }),
      make_task({ id: 'unestimated' })
    ]
    const entries = [entry(local(17, 9), local(17, 9, 30), 'half'), entry(local(17, 10), local(17, 11), 'over')]

    expect(estimate_left_seconds(tasks, entries, now)).toBe(1800)
  })
})

// ============================================================================
// Database
// ============================================================================

describe('timer queries', () => {
  beforeEach(() => attach_task_database(new DatabaseSync(':memory:'), ':memory:'))
  afterEach(() => close_task_database())

  it('stops the running timer when another starts', () => {
    const first = add_task('Write report', null, [], null)
    const second = add_task('Answer email', null, [], null)

    start_timer(first.id, '2026-11-17T09:00:00.000Z')
    start_timer(second.id, '2026-11-17T09:30:00.000Z')

    expect(list_time_entries().map(({ task_id, ended_at }) => ({ task_id, ended_at }))).toEqual([
      { task_id: first.id, ended_at: '2026-11-17T09:30:00.000Z' },
      { task_id: second.id, ended_at: null }
    ])
  })

  it('leaves the other timers running when several are allowed, and stops one alone', () => {
    set_setting('allow_several_timers', true)
    const first = add_task('Write report', null, [], null)
    const second = add_task('Answer email', null, [], null)

    start_timer(first.id, '2026-11-17T09:00:00.000Z')
    start_timer(second.id, '2026-11-17T09:30:00.000Z')
    stop_timer('2026-11-17T10:00:00.000Z', first.id)

    expect(list_time_entries().map(({ task_id, ended_at }) => ({ task_id, ended_at }))).toEqual([
      { task_id: first.id, ended_at: '2026-11-17T10:00:00.000Z' },
      { task_id: second.id, ended_at: null }
    ])
  })

  it('keeps a task\'s running entry when its timer is started again', () => {
    const task = add_task('Write report', null, [], null)
    const first = start_timer(task.id, '2026-11-17T09:00:00.000Z')

    const again = start_timer(task.id, '2026-11-17T09:30:00.000Z')

    expect(again.id).toBe(first.id)
    expect(list_time_entries()).toHaveLength(1)
  })

  it('saves an estimate and keeps it in the task history', () => {
    const task = add_task('Write report', null, [], null)

    set_task_estimate(task.id, 90)

    expect(list_tasks()[0]!.estimate_minutes).toBe(90)
    expect(list_task_versions(task.id)[0]!.snapshot.estimate_minutes).toBe(90)
  })

  it('never ends an entry before it started', () => {
    const task = add_task('Write report', null, [], null)
    start_timer(task.id, '2026-11-17T09:00:00.000Z')

    stop_timer('2026-11-17T08:59:00.000Z', null)

    expect(list_time_entries()[0]!.ended_at).toBe('2026-11-17T09:00:00.000Z')
  })

  it('removes an entry, and every entry of a deleted task', () => {
    const kept = add_task('Write report', null, [], null)
    const deleted = add_task('Answer email', null, [], null)
    const removed_entry = start_timer(kept.id, '2026-11-17T09:00:00.000Z')
    stop_timer('2026-11-17T09:30:00.000Z', kept.id)
    start_timer(kept.id, '2026-11-17T10:00:00.000Z')
    start_timer(deleted.id, '2026-11-17T11:00:00.000Z')

    remove_time_entry(removed_entry.id)
    remove_task(deleted.id)

    expect(list_time_entries().map((each) => each.started_at)).toEqual(['2026-11-17T10:00:00.000Z'])
  })
})
