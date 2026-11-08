import { describe, expect, test } from 'vitest'

import { GTG_SYNTAX } from '../../src/web/syntax/gtg.ts'
import type { QuickAdd } from '../../src/web/syntax/types.ts'
import { CONTEXT } from './context.ts'

// ============================================================================
// Quick add
// ============================================================================

describe('gtg quick add', () => {
  test.each<[string, Partial<QuickAdd>]>([
    ['Buy paper for the @Home office tags:Errands due:friday', { title: 'Buy paper for the @Home office', tag_ids: ['home', 'errands'], due_at: '2026-03-13' }],
    ['Write report start:tomorrow due:next-week', { title: 'Write report', start_at: '2026-03-12', due_at: '2026-03-18' }],
    ['Pay taxes every:year', { title: 'Pay taxes', due_at: '2026-03-11', recurrence: 'FREQ=YEARLY' }],
    ['Think due:someday', { title: 'Think due:someday', due_at: null, problems: ['"someday" is a GTG fuzzy date, which X-Tasks has no place for'] }],
    ['Keep due:banana and key:value', { title: 'Keep due:banana and key:value', due_at: null, problems: [] }]
  ])('%j', (text, expected) => {
    expect(GTG_SYNTAX.parse_quick_add(text, CONTEXT)).toMatchObject(expected)
  })
})

// ============================================================================
// Search
// ============================================================================

const due_on = (day: string) => ({ kind: 'date', field: 'due', relation: 'on', day })

describe('gtg search', () => {
  test.each([
    ['!today !or !tomorrow', { kind: 'or', items: [due_on('2026-03-11'), due_on('2026-03-12')] }, []],
    ['@Work @Home', { kind: 'and', items: [{ kind: 'tag', tag_ids: ['work'] }, { kind: 'tag', tag_ids: ['home'] }] }, []],
    ['@Work !before 2026-12-01', { kind: 'and', items: [{ kind: 'tag', tag_ids: ['work'] }, { kind: 'date', field: 'due', relation: 'before', day: '2026-12-01' }] }, []],
    ['buy !not @Errands', { kind: 'and', items: [{ kind: 'text', text: 'buy', field: 'any', match: 'contains' }, { kind: 'not', item: { kind: 'tag', tag_ids: ['errands'] } }] }, []],
    ['!notag', { kind: 'condition', condition: { kind: 'tagged', is_tagged: false } }, []],
    ['!someday', { kind: 'nothing' }, ["!someday looks for GTG's fuzzy dates, which X-Tasks has none of"]],
    ['!bogus', { kind: 'everything' }, ['GTG has no !bogus']],
    ['!before', { kind: 'everything' }, ['!before needs a date after it']]
  ])('%j', (text, query, problems) => {
    expect(GTG_SYNTAX.parse_search(text, CONTEXT)).toEqual({ query, problems })
  })
})
