import { describe, expect, test } from 'vitest'

import { query_matches } from '../../src/renderer/syntax/matching.ts'
import { TODOIST_SYNTAX } from '../../src/renderer/syntax/todoist.ts'
import type { SearchContext, SearchQuery } from '../../src/renderer/syntax/types.ts'
import { make_task } from '../fixtures.ts'
import { CONTEXT, NOW, TAGS } from './context.ts'

// ============================================================================
// Setup
// ============================================================================

const parent = make_task({ id: 'parent', title: 'Client project', tag_ids: ['work'], due_at: '2026-03-10' })
const subtask = make_task({ id: 'subtask', title: 'Send invoice', notes: 'Ask about the Invoice terms', parent_id: 'parent', due_at: '2026-03-11T09:00' })
const client_call = make_task({ id: 'client_call', title: 'Call', tag_ids: ['clients'], start_at: '2026-03-12', recurrence: 'FREQ=WEEKLY' })
const done = make_task({ id: 'done', title: 'Old chore', tag_ids: ['home'], is_done: true, due_at: '2026-03-01', done_at: '2026-03-02T23:30:00.000Z' })
const ALL_TASKS = [parent, subtask, client_call, done]

const SEARCH: SearchContext = { all_tasks: ALL_TASKS, tags: TAGS, date_field: 'due', now: NOW }

function found(query: SearchQuery): string[] {
  return ALL_TASKS.filter((task) => query_matches(query, task, SEARCH)).map((task) => task.id)
}

// ============================================================================
// Terms
// ============================================================================

describe('query_matches', () => {
  test.each<[string, SearchQuery, string[]]>([
    ['everything', { kind: 'everything' }, ['parent', 'subtask', 'client_call', 'done']],
    ['nothing', { kind: 'nothing' }, []],
    ['text in title or notes, case-blind', { kind: 'text', text: 'INVOICE', field: 'any', match: 'contains' }, ['subtask']],
    ['text that starts a title', { kind: 'text', text: 'c', field: 'title', match: 'starts' }, ['parent', 'client_call']],
    ['text that ends the notes', { kind: 'text', text: 'terms', field: 'notes', match: 'ends' }, ['subtask']],
    ['text equal to a title', { kind: 'text', text: 'call', field: 'title', match: 'equals' }, ['client_call']],
    ['a tag, its subtags and tags on a parent task', { kind: 'tag', tag_ids: ['work'] }, ['parent', 'subtask', 'client_call']],
    ['a date on a day, timed or not', { kind: 'date', field: 'due', relation: 'on', day: '2026-03-11' }, ['subtask']],
    ['a date before a day', { kind: 'date', field: 'date', relation: 'before', day: '2026-03-11' }, ['parent', 'done']],
    ['a done date read back as a local day', { kind: 'date', field: 'done', relation: 'on', day: '2026-03-02' }, ['done']],
    ['a missing start date', { kind: 'has_date', field: 'start', is_set: false }, ['parent', 'subtask', 'done']],
    ['overdue open tasks, counting the time', { kind: 'overdue', field: 'due' }, ['parent', 'subtask']],
    ['a rule condition', { kind: 'condition', condition: { kind: 'recurring', is_recurring: true } }, ['client_call']],
    ['not', { kind: 'not', item: { kind: 'tag', tag_ids: ['work'] } }, ['done']],
    ['and', { kind: 'and', items: [{ kind: 'tag', tag_ids: ['work'] }, { kind: 'has_date', field: 'due', is_set: true }] }, ['parent', 'subtask']],
    ['or', { kind: 'or', items: [{ kind: 'tag', tag_ids: ['home'] }, { kind: 'tag', tag_ids: ['clients'] }] }, ['client_call', 'done']]
  ])('%s', (_name, query, expected) => {
    expect(found(query)).toEqual(expected)
  })

  test('a parsed search finds the tasks it describes', () => {
    expect(found(TODOIST_SYNTAX.parse_search('#Work & !overdue', CONTEXT).query)).toEqual(['client_call'])
  })
})
