import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  add_task, attach_task_database, close_task_database, list_time_entries, remove_task, remove_time_entry, set_setting, start_timer, stop_timer
} from '../src/main/task_database'
import { entry_seconds, running_entries, seconds_by_day, stopped_entries, time_spent_label, total_seconds, type TimeEntry } from '../src/shared/time_tracking'

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
