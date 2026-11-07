import { describe, expect, test } from 'vitest'

import { task_duration } from '../src/shared/settings.ts'
import {
  describe_recurrence, due_after, duration_between, duration_label, next_schedule, overdue_repeat_schedule, recurrence_anchor, reschedule_day, rescheduled, rule_format,
  with_recurrence
} from '../src/shared/schedule.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Setup
// ============================================================================

const NOW = new Date(2026, 2, 11, 10, 0)

// ============================================================================
// Durations
// ============================================================================

describe('durations', () => {
  test('duration_label names each unit and calls zero Same day', () => {
    expect(duration_label(task_duration('a', { weeks: 1, days: 2 }))).toBe('1 week 2 days')
    expect(duration_label(task_duration('b', { hours: 1, minutes: 30 }))).toBe('1 hour 30 minutes')
    expect(duration_label(task_duration('c', {}))).toBe('Same day')
  })

  test('due_after clamps a month step to the end of a shorter month', () => {
    expect(due_after('2026-01-31', task_duration('m', { months: 1 }))).toBe('2026-02-28')
    expect(due_after('2026-03-11T22:00', task_duration('h', { hours: 3 }))).toBe('2026-03-12T01:00')
  })

  test('duration_between finds the listed duration that fits the gap', () => {
    const durations = [task_duration('day', { days: 1 }), task_duration('week', { weeks: 1 })]
    expect(duration_between(durations, '2026-03-11', '2026-03-18')?.id).toBe('week')
    expect(duration_between(durations, '2026-03-11', '2026-03-13')).toBeNull()
  })
})

// ============================================================================
// Recurrence
// ============================================================================

describe('recurrence', () => {
  test('recurrence_anchor takes the chosen date, or the other one', () => {
    const schedule = { start_at: '2026-03-01', due_at: null, recurrence: 'FREQ=DAILY' }
    expect(recurrence_anchor(schedule, 'due')).toBe('2026-03-01')
    expect(recurrence_anchor({ ...schedule, due_at: '2026-03-05' }, 'due')).toBe('2026-03-05')
    expect(recurrence_anchor({ ...schedule, due_at: '2026-03-05' }, 'start')).toBe('2026-03-01')
  })

  test('rule_format is all-day unless the anchor has a time', () => {
    expect(rule_format(null)).toEqual({ time_mode: 'floating', all_day: true })
    expect(rule_format('2026-03-11T09:00')).toEqual({ time_mode: 'floating', all_day: false })
  })

  test('describe_recurrence says when a task does not repeat', () => {
    expect(describe_recurrence({ start_at: null, due_at: null, recurrence: '' })).toBe('Does not repeat')
    expect(describe_recurrence({ start_at: null, due_at: '2026-03-11', recurrence: 'FREQ=DAILY' })).not.toBe('Does not repeat')
  })

  test('with_recurrence gives a plain anchor the time the rule sets', () => {
    const schedule = { start_at: null, due_at: '2026-03-12', recurrence: '' }
    expect(with_recurrence(schedule, 'FREQ=DAILY;BYHOUR=9;BYMINUTE=30', NOW)).toEqual({ start_at: null, due_at: '2026-03-12T09:30', recurrence: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=30' })
    expect(with_recurrence(schedule, 'FREQ=DAILY', NOW)).toEqual({ ...schedule, recurrence: 'FREQ=DAILY' })
  })

  test('with_recurrence puts an undated task on today at the current time, in its start date even when due is chosen', () => {
    expect(with_recurrence({ start_at: null, due_at: null, recurrence: '' }, 'FREQ=HOURLY', NOW, 'due')).toEqual({ start_at: '2026-03-11T10:00', due_at: null, recurrence: 'FREQ=HOURLY' })
  })

  test('next_schedule moves both dates to the next occurrence, keeping the gap', () => {
    const task = make_task({ id: 'r', start_at: '2026-03-09', due_at: '2026-03-11', recurrence: 'FREQ=WEEKLY' })
    expect(next_schedule(task)).toEqual({ start_at: '2026-03-16', due_at: '2026-03-18', recurrence: 'FREQ=WEEKLY' })
  })

  test('next_schedule keeps the time of a timed anchor', () => {
    const task = make_task({ id: 'r', due_at: '2026-03-11T09:00', recurrence: 'FREQ=DAILY' })
    expect(next_schedule(task)?.due_at).toBe('2026-03-12T09:00')
  })

  test('next_schedule is empty for a one-off task, an ended rule or an unreadable one', () => {
    expect(next_schedule(make_task({ id: 'o', due_at: '2026-03-11' }))).toBeNull()
    expect(next_schedule(make_task({ id: 'e', due_at: '2026-03-11', recurrence: 'FREQ=DAILY;COUNT=1' }))).toBeNull()
    expect(next_schedule(make_task({ id: 'u', due_at: '2026-03-11', recurrence: 'NOT A RULE' }))).toBeNull()
  })

  test('overdue_repeat_schedule skips to the first occurrence from today, or to today itself', () => {
    const task = make_task({ id: 'r', due_at: '2026-03-02', recurrence: 'FREQ=WEEKLY' })
    expect(overdue_repeat_schedule(task, 'next', 'due', NOW)?.due_at).toBe('2026-03-16')
    expect(overdue_repeat_schedule(task, 'today', 'due', NOW)?.due_at).toBe('2026-03-11')
    expect(overdue_repeat_schedule(task, 'off', 'due', NOW)).toBeNull()
    expect(overdue_repeat_schedule({ ...task, due_at: '2026-03-11' }, 'next', 'due', NOW)).toBeNull()
  })
})

// ============================================================================
// Rescheduling
// ============================================================================

describe('rescheduling', () => {
  test('reschedule_day counts days from today at midnight', () => {
    expect(reschedule_day({ id: 'x', name: 'Next week', mode: 'days', days: 7, rule: '' }, NOW)).toEqual(new Date(2026, 2, 18))
  })

  test('rescheduled moves the anchor to the day, keeps its time and shifts the other date along', () => {
    const task = make_task({ id: 't', start_at: '2026-03-01T08:00', due_at: '2026-03-03T17:00' })
    expect(rescheduled(task, new Date(2026, 2, 20), 'due')).toEqual({ start_at: '2026-03-18T08:00', due_at: '2026-03-20T17:00', recurrence: '' })
  })

  test('rescheduled gives an undated task the chosen field', () => {
    expect(rescheduled(make_task({ id: 'u' }), new Date(2026, 2, 20), 'start')).toEqual({ start_at: '2026-03-20', due_at: null, recurrence: '' })
  })
})
