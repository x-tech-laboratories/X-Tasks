import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { TableSortKey } from '../src/shared/settings.ts'
import type { Tag } from '../src/shared/tasks.ts'
import type { RoutineStreak } from '../src/shared/streaks.ts'
import type { Task } from '../src/shared/tasks.ts'
import {
  COLUMN_WIDTH_RANGE, EMPTY_TABLE_FILTERS, NO_TAG_FILTER, column_width, default_column_width, ordered_columns, sort_task_tree, tag_ranks, task_passes_filters,
  type SortContext, type TableFilters
} from '../src/web/table.ts'
import { nest_tasks, type TaskNode } from '../src/web/views.ts'
import { make_group, make_tag, make_task } from './fixtures.ts'

// ============================================================================
// Setup
// ============================================================================

const NOW = new Date(2026, 2, 11, 10, 0)
const TODAY = '2026-03-11'

const no_streak = (): RoutineStreak | null => null
const never_done = (): string | null => null

// What sorting needs besides the tasks: their tags, no streaks and no completions.
function context_for(tags: Tag[], tags_of: (task: Task) => Tag[]): SortContext {
  return { tags_of, streak_of: no_streak, is_in_my_day: () => false, date_field: 'due', last_done_of: never_done, tag_rank: tag_ranks(tags, false), reversed_tag_rank: tag_ranks(tags, true) }
}

function titles(nodes: TaskNode[]): unknown[] {
  return nodes.map((node) => (node.children.length > 0 ? [node.task.title, titles(node.children)] : node.task.title))
}

// ============================================================================
// Sorting the tree
// ============================================================================

describe('sort_task_tree', () => {
  const tasks: Task[] = [
    make_task({ id: 'b', title: 'Bravo', position: 1, due_at: '2026-03-12' }),
    make_task({ id: 'a', title: 'Alpha', position: 2, due_at: '2026-03-12' }),
    make_task({ id: 'c', title: 'Charlie', position: 3, due_at: null }),
    make_task({ id: 'd', title: 'Delta', position: 4, due_at: '2026-03-01' }),
    make_task({ id: 'b2', title: 'Task 10', parent_id: 'b', position: 1 }),
    make_task({ id: 'b1', title: 'Task 9', parent_id: 'b', position: 2 })
  ]
  const tree = nest_tasks(tasks, tasks)

  function sorted(sort: TableSortKey[]): unknown[] {
    return titles(sort_task_tree(tree, sort, context_for([], () => [])))
  }

  test('no sort keys leaves the tree as given', () => {
    expect(sorted([])).toEqual([['Bravo', ['Task 10', 'Task 9']], 'Alpha', 'Charlie', 'Delta'])
  })

  test('children stay under their parent and are sorted among themselves, numbers read as numbers', () => {
    expect(sorted([{ column: 'title', is_descending: false }])).toEqual(['Alpha', ['Bravo', ['Task 9', 'Task 10']], 'Charlie', 'Delta'])
  })

  test('a second key breaks ties in the first, and an empty date sorts last', () => {
    expect(sorted([{ column: 'date', is_descending: false }, { column: 'title', is_descending: true }])).toEqual(['Delta', ['Bravo', ['Task 10', 'Task 9']], 'Alpha', 'Charlie'])
  })

  test('an empty date still sorts last when descending, and ties fall back to position', () => {
    expect(sorted([{ column: 'date', is_descending: true }])).toEqual([['Bravo', ['Task 10', 'Task 9']], 'Alpha', 'Delta', 'Charlie'])
  })

  test('a tag column sorts by sidebar order and descending reverses siblings only', () => {
    const group = make_group({ id: 'priority' })
    const tags = [
      make_tag({ id: 'high', group_id: 'priority', position: 1 }),
      make_tag({ id: 'high_urgent', group_id: 'priority', parent_id: 'high', position: 1 }),
      make_tag({ id: 'low', group_id: 'priority', position: 2 })
    ]
    const tagged = [
      make_task({ id: 'one', position: 1, tag_ids: ['low'] }),
      make_task({ id: 'two', position: 2, tag_ids: ['high_urgent'] }),
      make_task({ id: 'three', position: 3, tag_ids: ['high'] }),
      make_task({ id: 'four', position: 4 })
    ]
    const tags_of = (task: Task) => tags.filter((tag) => task.tag_ids.includes(tag.id))
    const by_group = (is_descending: boolean) =>
      titles(sort_task_tree(nest_tasks(tagged, tagged), [{ column: `group:${group.id}`, is_descending }], context_for(tags, tags_of)))

    expect(by_group(false)).toEqual(['three', 'two', 'one', 'four'])
    expect(by_group(true)).toEqual(['one', 'three', 'two', 'four'])
  })
})

// ============================================================================
// Columns
// ============================================================================

describe('columns', () => {
  test('ordered_columns drops removed groups and slots new columns in after their neighbour', () => {
    const groups = [make_group({ id: 'area' })]
    expect(ordered_columns(['streak', 'date', 'group:gone'], groups)).toEqual(['streak', 'history', 'group:area', 'date', 'start', 'due', 'done', 'duration', 'my_day', 'notes', 'repeats'])
  })

  test('widths fall back to a default per kind and saved widths are not clamped here', () => {
    expect(COLUMN_WIDTH_RANGE).toEqual({ min: 64, max: 480 })
    expect([default_column_width('due'), default_column_width('streak'), default_column_width('duration'), default_column_width('group:area')]).toEqual([104, 84, 112, 124])
    expect(column_width({ due: 200 }, 'due')).toBe(200)
    expect(column_width({ due: 10, streak: 9000 }, 'due')).toBe(10)
    expect(column_width({ due: 10, streak: 9000 }, 'streak')).toBe(9000)
  })
})

// ============================================================================
// Filters
// ============================================================================

describe('task_passes_filters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const group = make_group({ id: 'area' })
  const tags = [make_tag({ id: 'work', group_id: 'area', name: 'Work' }), make_tag({ id: 'clients', group_id: 'area', name: 'Clients', parent_id: 'work' })]

  function passes(task: Task, filters: Partial<TableFilters>, streak: RoutineStreak | null = null, all_tasks: Task[] = [task]): boolean {
    return task_passes_filters(task, { ...EMPTY_TABLE_FILTERS, ...filters }, all_tasks, tags, () => streak, TODAY, 'due', () => task.done_at)
  }

  test('the title filter matches a trimmed, case-blind substring', () => {
    const task = make_task({ id: 'x', title: 'Call the Bank' })
    expect(passes(task, { title: '  bank ' })).toBe(true)
    expect(passes(task, { title: 'shop' })).toBe(false)
  })

  test('date filters compare the day part against today', () => {
    const yesterday = make_task({ id: 'y', due_at: '2026-03-10' })
    const today = make_task({ id: 't', due_at: '2026-03-11T08:00' })
    const later = make_task({ id: 'l', due_at: '2026-03-20' })
    const undated = make_task({ id: 'u' })

    expect([yesterday, today, later, undated].map((task) => passes(task, { dates: { due: 'earlier' } }))).toEqual([true, false, false, false])
    expect([yesterday, today, later, undated].map((task) => passes(task, { dates: { due: 'today' } }))).toEqual([false, true, false, false])
    expect([yesterday, today, later, undated].map((task) => passes(task, { dates: { due: 'upcoming' } }))).toEqual([false, false, true, false])
    expect([yesterday, today, later, undated].map((task) => passes(task, { dates: { due: 'none' } }))).toEqual([false, false, false, true])
  })

  test('overdue counts the time of day and skips done tasks', () => {
    expect(passes(make_task({ id: 'a', due_at: '2026-03-11T08:00' }), { dates: { due: 'overdue' } })).toBe(true)
    expect(passes(make_task({ id: 'b', due_at: '2026-03-11' }), { dates: { due: 'overdue' } })).toBe(false)
    expect(passes(make_task({ id: 'c', due_at: '2026-03-10', is_done: true }), { dates: { due: 'overdue' } })).toBe(false)
  })

  test('a repeating task counts as not done only while its due date has passed', () => {
    const missed = make_task({ id: 'm', recurrence: 'FREQ=DAILY', due_at: '2026-03-10', done_at: '2026-03-09T10:00:00.000Z' })
    const on_time = make_task({ id: 'o', recurrence: 'FREQ=DAILY', due_at: '2026-03-12', done_at: '2026-03-11T09:00:00.000Z' })
    expect(passes(missed, { dates: { done: 'none' } })).toBe(true)
    expect(passes(on_time, { dates: { done: 'none' } })).toBe(false)
    expect(passes(on_time, { dates: { done: 'today' } })).toBe(true)
  })

  test('duration filters measure from start to due', () => {
    const one_day = make_task({ id: 'd', start_at: '2026-03-11', due_at: '2026-03-12' })
    const three_hours = make_task({ id: 'h', start_at: '2026-03-11T09:00', due_at: '2026-03-11T12:00' })
    const two_weeks = make_task({ id: 'w', start_at: '2026-03-01', due_at: '2026-03-15' })
    const backwards = make_task({ id: 'b', start_at: '2026-03-15', due_at: '2026-03-01' })

    expect([one_day, three_hours, two_weeks, backwards].map((task) => passes(task, { duration: 'day' }))).toEqual([true, true, false, false])
    expect([one_day, three_hours, two_weeks, backwards].map((task) => passes(task, { duration: 'longer' }))).toEqual([false, false, true, false])
    expect([one_day, three_hours, two_weeks, backwards].map((task) => passes(task, { duration: 'none' }))).toEqual([false, false, false, true])
  })

  test('streak filters read the current streak', () => {
    const task = make_task({ id: 's' })
    expect(passes(task, { streak: 'active' }, { current: 3, best: 5 })).toBe(true)
    expect(passes(task, { streak: 'week' }, { current: 6, best: 9 })).toBe(false)
    expect(passes(task, { streak: 'month' }, { current: 30, best: 30 })).toBe(true)
    expect(passes(task, { streak: 'broken' }, { current: 0, best: 4 })).toBe(true)
    expect(passes(task, { streak: 'untracked' }, null)).toBe(true)
    expect(passes(task, { streak: 'untracked' }, { current: 0, best: 0 })).toBe(false)
  })

  test('a group filter matches the tag, tags below it and tags on a parent task, and none matches untagged', () => {
    const parent = make_task({ id: 'p', tag_ids: ['work'] })
    const child = make_task({ id: 'c', parent_id: 'p' })
    const client_task = make_task({ id: 'k', tag_ids: ['clients'] })
    const plain = make_task({ id: 'n' })
    const all_tasks = [parent, child, client_task, plain]

    expect(passes(child, { group_tag_ids: { [group.id]: 'work' } }, null, all_tasks)).toBe(true)
    expect(passes(client_task, { group_tag_ids: { [group.id]: 'work' } }, null, all_tasks)).toBe(true)
    expect(passes(plain, { group_tag_ids: { [group.id]: 'work' } }, null, all_tasks)).toBe(false)
    expect(passes(plain, { group_tag_ids: { [group.id]: NO_TAG_FILTER } }, null, all_tasks)).toBe(true)
    expect(passes(child, { group_tag_ids: { [group.id]: NO_TAG_FILTER } }, null, all_tasks)).toBe(false)
  })
})
