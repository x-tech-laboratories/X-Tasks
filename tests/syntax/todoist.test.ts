import { describe, expect, test } from 'vitest'

import { TODOIST_SYNTAX } from '../../src/web/syntax/todoist.ts'
import type { QuickAdd } from '../../src/web/syntax/types.ts'
import { CONTEXT } from './context.ts'

// ============================================================================
// Quick add
// ============================================================================

describe('todoist quick add', () => {
  test.each<[string, Partial<QuickAdd>]>([
    ['Call Sam tomorrow at 5pm #Work p1', { title: 'Call Sam', tag_ids: ['work', 'high'], due_at: '2026-03-12T17:00' }],
    ['Pay rent every 1st @Home', { title: 'Pay rent', tag_ids: ['home'], due_at: '2026-04-01', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=1' }],
    ['Water plants every mon, wed and fri at 9am', { title: 'Water plants', due_at: '2026-03-11T09:00', recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }],
    ['Book "Monday Club" tickets next week', { title: 'Book Monday Club tickets', due_at: '2026-03-18' }],
    ['Meet friday or saturday', { title: 'Meet or saturday', due_at: '2026-03-13' }],
    ['Work sat', { title: 'Work sat', due_at: null }],
    ['Sort it p1 p3 p4', { title: 'Sort it', tag_ids: ['low'], problems: [] }],
    ['Buy milk #Nope', { title: 'Buy milk', tag_ids: [], problems: ['No tag is named Nope'] }]
  ])('%j', (text, expected) => {
    expect(TODOIST_SYNTAX.parse_quick_add(text, CONTEXT)).toMatchObject(expected)
  })

  test('a date with no field named sets the start when settings make start the date', () => {
    expect(TODOIST_SYNTAX.parse_quick_add('Thing friday', { ...CONTEXT, date_field: 'start' })).toMatchObject({ start_at: '2026-03-13', due_at: null })
  })
})

// ============================================================================
// Search
// ============================================================================

const on = (day: string) => ({ kind: 'date', field: 'date', relation: 'on', day })

describe('todoist search', () => {
  test.each([
    ['today | overdue', { kind: 'or', items: [on('2026-03-11'), { kind: 'overdue', field: 'date' }] }],
    ['#Work & p1', { kind: 'and', items: [{ kind: 'tag', tag_ids: ['work'] }, { kind: 'tag', tag_ids: ['high'] }] }],
    ['3 days & !@Home', {
      kind: 'and',
      items: [
        { kind: 'and', items: [{ kind: 'date', field: 'date', relation: 'on_or_after', day: '2026-03-11' }, { kind: 'date', field: 'date', relation: 'on_or_before', day: '2026-03-13' }] },
        { kind: 'not', item: { kind: 'tag', tag_ids: ['home'] } }
      ]
    }],
    ['no date, recurring', { kind: 'or', items: [{ kind: 'has_date', field: 'date', is_set: false }, { kind: 'condition', condition: { kind: 'recurring', is_recurring: true } }] }],
    ['due before: fri', { kind: 'date', field: 'date', relation: 'before', day: '2026-03-13' }],
    ['search: Invoice', { kind: 'text', text: 'Invoice', field: 'any', match: 'contains' }],
    ['p4', { kind: 'condition', condition: { kind: 'group', group_id: 'priority', has_tag: false } }],
    ['groceries', { kind: 'text', text: 'groceries', field: 'any', match: 'contains' }]
  ])('%j', (text, query) => {
    expect(TODOIST_SYNTAX.parse_search(text, CONTEXT)).toEqual({ query, problems: [] })
  })

  test.each([
    ['(today', ['A bracket is not closed']],
    ['today)', ['Some of the filter could not be read']],
    ['due: someday', ['Cannot read the date in "due: someday"']],
    ['#Nope', ['No tag is named Nope']]
  ])('%j reports %j', (text, problems) => {
    expect(TODOIST_SYNTAX.parse_search(text, CONTEXT).problems).toEqual(problems)
  })
})
