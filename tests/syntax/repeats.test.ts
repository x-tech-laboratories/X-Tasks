import { describe, expect, test } from 'vitest'

import { split_words } from '../../src/renderer/syntax/dates.ts'
import { find_repeat, read_repeat_value } from '../../src/renderer/syntax/repeats.ts'
import { NOW } from './context.ts'

// ============================================================================
// Repeats
// ============================================================================

describe('find_repeat', () => {
  test.each([
    ['daily', { rule: 'FREQ=DAILY', first_day: '2026-03-11', length: 1 }],
    ['every 1 day', { rule: 'FREQ=DAILY', first_day: '2026-03-11', length: 3 }],
    ['every other week', { rule: 'FREQ=WEEKLY;INTERVAL=2', first_day: '2026-03-11', length: 3 }],
    ['every 3 months', { rule: 'FREQ=MONTHLY;INTERVAL=3', first_day: '2026-03-11', length: 3 }],
    ['every weekday', { rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', first_day: '2026-03-11', length: 2 }],
    ['every weekend', { rule: 'FREQ=WEEKLY;BYDAY=SA,SU', first_day: '2026-03-14', length: 2 }],
    ['every fri, mon and wed', { rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', first_day: '2026-03-11', length: 5 }],
    ['every other monday', { rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', first_day: '2026-03-16', length: 3 }],
    ['every 1st', { rule: 'FREQ=MONTHLY;BYMONTHDAY=1', first_day: '2026-04-01', length: 2 }],
    ['every 31st', { rule: 'FREQ=MONTHLY;BYMONTHDAY=31', first_day: '2026-03-31', length: 2 }],
    ['every banana', null],
    ['weekly', { rule: 'FREQ=WEEKLY', first_day: '2026-03-11', length: 1 }]
  ])('%j reads as %j', (text, expected) => {
    expect(find_repeat(split_words(text), 0, NOW)).toEqual(expected)
  })

  test('a trailing "and" is left for the words after the list', () => {
    expect(find_repeat(split_words('every monday and then'), 0, NOW)?.length).toBe(2)
  })
})

describe('read_repeat_value', () => {
  test.each([
    ['week', { rule: 'FREQ=WEEKLY', first_day: '2026-03-11' }],
    ['other-week', { rule: 'FREQ=WEEKLY;INTERVAL=2', first_day: '2026-03-11' }],
    ['27', { rule: 'FREQ=MONTHLY;BYMONTHDAY=27', first_day: '2026-03-27' }],
    ['0401', { rule: 'FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=1', first_day: '2026-04-01' }],
    ['next-week', { rule: 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=18', first_day: '2026-03-18' }],
    ['', null]
  ])('%j reads as %j', (text, expected) => {
    expect(read_repeat_value(text, NOW)).toEqual(expected)
  })
})
