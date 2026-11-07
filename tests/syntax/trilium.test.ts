import { describe, expect, test } from 'vitest'

import { TRILIUM_SYNTAX } from '../../src/renderer/syntax/trilium.ts'
import type { QuickAdd } from '../../src/renderer/syntax/types.ts'
import { CONTEXT } from './context.ts'

// ============================================================================
// Quick add
// ============================================================================

describe('trilium quick add', () => {
  test.each<[string, Partial<QuickAdd>]>([
    ['Renew passport #area=Home #dueDate=TODAY+30', { title: 'Renew passport', tag_ids: ['home'], due_at: '2026-04-10' }],
    ['Stand-up #Work #startDateTime=2026-11-02T09:30 #recurrence=FREQ=WEEKLY', { title: 'Stand-up', tag_ids: ['work'], start_at: '2026-11-02T09:30', recurrence: 'FREQ=WEEKLY' }],
    ['Read #recurrence=RRULE:FREQ=DAILY', { title: 'Read', due_at: '2026-03-11', recurrence: 'FREQ=DAILY' }],
    ['Thing #dueDate=2026-03-20T10:00', { due_at: '2026-03-20' }],
    ['Ping #dueDateTime=NOW+60', { due_at: '2026-03-11T10:01' }],
    ['Rank #priority=1-High', { tag_ids: ['high'] }],
    ['Paint #area=Nope', { title: 'Paint', problems: ['Area has no tag named Nope'] }],
    ['Paint #color=red', { title: 'Paint #color=red', problems: ['No filter group is named color'] }],
    ['Paint #dueDate=garbage', { due_at: null, problems: ['Cannot read the date in #dueDate'] }]
  ])('%j', (text, expected) => {
    expect(TRILIUM_SYNTAX.parse_quick_add(text, CONTEXT)).toMatchObject(expected)
  })
})

// ============================================================================
// Search
// ============================================================================

describe('trilium search', () => {
  test.each([
    ['#area=Work #!done', { kind: 'and', items: [{ kind: 'tag', tag_ids: ['work'] }, { kind: 'not', item: { kind: 'condition', condition: { kind: 'status', is_done: true } } }] }, []],
    ['#dueDate <= TODAY+7', { kind: 'date', field: 'due', relation: 'on_or_before', day: '2026-03-18' }, []],
    ['#Errands OR #Home', { kind: 'or', items: [{ kind: 'tag', tag_ids: ['errands'] }, { kind: 'tag', tag_ids: ['home'] }] }, []],
    ['note.title *=* invoice', { kind: 'text', text: 'invoice', field: 'title', match: 'contains' }, []],
    ['NOT(#recurrence) #dueDate', { kind: 'and', items: [{ kind: 'not', item: { kind: 'condition', condition: { kind: 'recurring', is_recurring: true } } }, { kind: 'has_date', field: 'due', is_set: true }] }, []],
    ['#area', { kind: 'condition', condition: { kind: 'group', group_id: 'area', has_tag: true } }, []],
    ['#area *=* o', { kind: 'tag', tag_ids: ['work', 'home'] }, []],
    ['#area != Work', { kind: 'not', item: { kind: 'tag', tag_ids: ['work'] } }, []],
    ['~related', { kind: 'nothing' }, ['X-Tasks has no relations to search with ~']],
    ['NOT #done', { kind: 'condition', condition: { kind: 'status', is_done: true } }, ['NOT needs a bracketed part after it, as in NOT(#done)']],
    ['a)', { kind: 'text', text: 'a', field: 'any', match: 'contains' }, ['A closing bracket has no opening one']],
    ['#dueDate > banana', { kind: 'nothing' }, ['Cannot compare #dueDate > banana']]
  ])('%j', (text, query, problems) => {
    expect(TRILIUM_SYNTAX.parse_search(text, CONTEXT)).toEqual({ query, problems })
  })
})
