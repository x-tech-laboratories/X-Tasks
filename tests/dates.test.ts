import { describe, expect, test } from 'vitest'

import { DEFAULT_SETTINGS, saved_date_range, type DateRange } from '../src/shared/settings.ts'
import type { Task } from '../src/shared/tasks.ts'
import { group_by_date, is_within_ranges, shown_ranges } from '../src/web/dates.ts'
import type { TaskNode } from '../src/web/views.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Setup
// ============================================================================

// A Wednesday afternoon.
const NOW = '2026-11-11T14:30'
const RANGES = shown_ranges(DEFAULT_SETTINGS.date_ranges, NOW)

function node_of(task: Task): TaskNode {
  return { task, children: [] }
}

function groups_of(tasks: Task[]) {
  return group_by_date(tasks.map(node_of), [], 'due', NOW, false, RANGES)
}

// ============================================================================
// Groups
// ============================================================================

describe('group_by_date', () => {
  test('puts each task under the first range holding it, between overdue and undated', () => {
    const groups = groups_of([
      make_task({ id: 'undated' }),
      make_task({ id: 'january', due_at: '2027-01-05' }),
      make_task({ id: 'month', due_at: '2026-11-27' }),
      make_task({ id: 'next_week', due_at: '2026-11-17' }),
      make_task({ id: 'week', due_at: '2026-11-14' }),
      make_task({ id: 'tomorrow', due_at: '2026-11-12' }),
      make_task({ id: 'today', due_at: '2026-11-11' }),
      make_task({ id: 'earlier_today', due_at: '2026-11-11T09:00' }),
      make_task({ id: 'done', due_at: '2026-11-08', is_done: true }),
      make_task({ id: 'overdue', due_at: '2026-11-09' })
    ])

    expect(groups.map((group) => [group.key, group.nodes.map((node) => node.task.id)])).toEqual([
      ['earlier', ['done']],
      ['overdue', ['overdue']],
      ['range:earlier-today', ['earlier_today']],
      ['range:today', ['today']],
      ['range:tomorrow', ['tomorrow']],
      ['range:this-week', ['week']],
      ['range:next-week', ['next_week']],
      ['range:this-month', ['month']],
      ['range:later:2027-01', ['january']],
      ['none', ['undated']]
    ])
  })

  test('names a group by its range, with the days it covers', () => {
    const [earlier_today, later] = groups_of([make_task({ id: 'a', due_at: '2026-11-11T09:00' }), make_task({ id: 'b', due_at: '2027-01-05' })])

    expect(earlier_today!.label.startsWith('Earlier today · ')).toBe(true)
    expect(later!.label).toContain('2027')
  })

  test('takes drops only on a group that is one whole day', () => {
    const groups = groups_of([
      make_task({ id: 'a', due_at: '2026-11-11T09:00' }),
      make_task({ id: 'b', due_at: '2026-11-11' }),
      make_task({ id: 'c', due_at: '2026-11-12' }),
      make_task({ id: 'd', due_at: '2026-11-17' })
    ])

    expect(groups.map((group) => group.drop_day)).toEqual([null, '2026-11-11', '2026-11-12', null])
  })

  test('splits a range into a heading per day', () => {
    const by_day: DateRange[] = [{ id: 'soon', name: 'Soon', comparison: 'is_between', from: 'start_of_this_day', to: 'end_of_next_week', inclusivity: '[]', split: 'day' }]
    const groups = group_by_date([make_task({ id: 'a', due_at: '2026-11-13' })].map(node_of), [], 'due', NOW, false, shown_ranges(by_day, NOW))

    expect(groups.map((group) => [group.key, group.drop_day])).toEqual([['range:soon:2026-11-13', '2026-11-13']])
  })

  test('puts a date outside every range under later', () => {
    const today_only = shown_ranges([DEFAULT_SETTINGS.date_ranges[1]!], NOW)
    const groups = group_by_date([make_task({ id: 'a', due_at: '2026-12-01' })].map(node_of), [], 'due', NOW, false, today_only)

    expect(groups.map((group) => group.key)).toEqual(['later'])
  })
})

// ============================================================================
// Upcoming
// ============================================================================

describe('is_within_ranges', () => {
  const today_only = shown_ranges([DEFAULT_SETTINGS.date_ranges[1]!], NOW)

  test('keeps overdue tasks and those inside a range', () => {
    expect(is_within_ranges('2026-11-02', today_only, NOW)).toBe(true)
    expect(is_within_ranges('2026-11-11', today_only, NOW)).toBe(true)
    expect(is_within_ranges('2026-11-12', today_only, NOW)).toBe(false)
    expect(is_within_ranges(null, today_only, NOW)).toBe(false)
  })
})

// ============================================================================
// Saved ranges
// ============================================================================

describe('saved_date_range', () => {
  test('turns a start and end counted from now into the nearest rule', () => {
    const earlier_today = saved_date_range({ id: 'a', name: 'Earlier today', start: { offset: 0, unit: 'day' }, end: { offset: 0, unit: 'minute' }, split: 'none' })
    const later = saved_date_range({ id: 'b', name: 'Later', start: { offset: 1, unit: 'month' }, end: null, split: 'month' })

    expect(earlier_today).toEqual({ id: 'a', name: 'Earlier today', comparison: 'is_between', from: 'start_of_this_day', to: 'now', inclusivity: '[]', split: 'none' })
    expect(later).toMatchObject({ comparison: 'is_after', from: 'start_of_next_month' })
  })

  test('keeps a rule as it is', () => {
    expect(saved_date_range(DEFAULT_SETTINGS.date_ranges[0]!)).toBe(DEFAULT_SETTINGS.date_ranges[0])
  })
})
