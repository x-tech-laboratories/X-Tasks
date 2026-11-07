import { describe, expect, test } from 'vitest'

import { PLAIN_SYNTAX } from '../../src/renderer/syntax/plain.ts'
import { syntax_by_id } from '../../src/renderer/syntax/index.ts'
import { CONTEXT } from './context.ts'

// ============================================================================
// Plain
// ============================================================================

describe('plain syntax', () => {
  test('quick add keeps every word, tidying only the spaces', () => {
    expect(PLAIN_SYNTAX.parse_quick_add('  Call   the bank #Work tomorrow ', CONTEXT)).toEqual({
      title: 'Call the bank #Work tomorrow', tag_ids: [], start_at: null, due_at: null, recurrence: '', problems: []
    })
  })

  test.each([
    ['bank card', { kind: 'text', text: 'bank card', field: 'any', match: 'contains' }],
    ['   ', { kind: 'everything' }]
  ])('search %j reads as %j', (text, query) => {
    expect(PLAIN_SYNTAX.parse_search(text, CONTEXT)).toEqual({ query, problems: [] })
  })

  test('an unknown syntax id falls back to Plain', () => {
    expect(syntax_by_id('newer' as 'plain')).toBe(PLAIN_SYNTAX)
  })
})
