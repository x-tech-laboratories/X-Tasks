import { describe, expect, test } from 'vitest'

import { read_task_date, read_time, TITLE_DATE_OPTIONS, VALUE_DATE_OPTIONS } from '../../src/web/syntax/dates.ts'
import { NOW } from './context.ts'

// ============================================================================
// Dates
// ============================================================================

describe('read_task_date', () => {
  test.each([
    ['tomorrow', '2026-03-12'],
    ['friday', '2026-03-13'],
    ['wednesday', '2026-03-18'],
    ['next week', '2026-03-18'],
    ['in 3 days', '2026-03-14'],
    ['eom', '2026-03-31'],
    ['march 30', '2026-03-30'],
    ['march 1', '2027-03-01'],
    ['30 march 2027', '2027-03-30'],
    ['feb 30', null],
    ['tomorrow at 9am', '2026-03-12T09:00'],
    ['5pm', '2026-03-11T17:00'],
    ['2026-03-30 17:00', '2026-03-30T17:00'],
    ['27', '2026-03-27'],
    ['0401', '2026-04-01'],
    ['sat', '2026-03-14'],
    ['friday banana', null]
  ])('a value %j reads as %j', (text, expected) => {
    expect(read_task_date(text, VALUE_DATE_OPTIONS, NOW)).toBe(expected)
  })

  test.each([['27'], ['sat'], ['0401']])('in a title %j is not a date', (text) => {
    expect(read_task_date(text, TITLE_DATE_OPTIONS, NOW)).toBeNull()
  })
})

describe('read_time', () => {
  test.each([
    ['noon', { hours: 12, minutes: 0 }],
    ['12am', { hours: 0, minutes: 0 }],
    ['5:30pm', { hours: 17, minutes: 30 }],
    ['23:59', { hours: 23, minutes: 59 }],
    ['13pm', null],
    ['24:00', null],
    ['17', null]
  ])('%j reads as %j', (word, expected) => {
    expect(read_time(word)).toEqual(expected)
  })
})
