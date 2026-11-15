import { describe, expect, test } from 'vitest'

import type { RuleCondition, TagRule, Task } from '../src/shared/tasks.ts'
import { rule_matches } from '../src/web/rules.ts'
import { chain_tag_ids_of } from '../src/web/views.ts'
import { make_tag, make_task } from './fixtures.ts'

// ============================================================================
// Tag holders
// ============================================================================

describe('tag conditions by holder', () => {
  const tags = [make_tag({ id: 'work', group_id: 'area' })]
  const parent = make_task({ id: 'parent', tag_ids: ['work'] })
  const child = make_task({ id: 'child', parent_id: 'parent' })
  const tagged_child = make_task({ id: 'tagged_child', parent_id: 'parent', tag_ids: ['work'] })
  const loner = make_task({ id: 'loner' })
  const all_tasks = [parent, child, tagged_child, loner]

  function matching(...conditions: RuleCondition[]): string[] {
    const matches = (task: Task) => rule_matches({ match: 'all', conditions }, task, all_tasks, chain_tag_ids_of(task, all_tasks), tags)
    return all_tasks.filter(matches).map((task) => task.id)
  }

  test('a condition saved without a holder reads the task and the tasks above it', () => {
    expect(matching({ kind: 'tagged', is_tagged: false })).toEqual(['loner'])
    expect(matching({ kind: 'tag', tag_id: 'work', has_tag: true })).toEqual(['parent', 'child', 'tagged_child'])
  })

  test('held by the task reads only its own tags', () => {
    expect(matching({ kind: 'tagged', is_tagged: false, held_by: 'task' })).toEqual(['child', 'loner'])
    expect(matching({ kind: 'group', group_id: 'area', has_tag: true, held_by: 'task' })).toEqual(['parent', 'tagged_child'])
  })

  test('held above reads only the tasks above it', () => {
    expect(matching({ kind: 'tag', tag_id: 'work', has_tag: true, held_by: 'above' })).toEqual(['child', 'tagged_child'])
  })

  test('the two combine into an untagged task under a tagged parent', () => {
    expect(matching({ kind: 'tagged', is_tagged: false, held_by: 'task' }, { kind: 'tagged', is_tagged: true, held_by: 'above' })).toEqual(['child'])
  })
})

// ============================================================================
// Nested groups
// ============================================================================

describe('nested condition groups', () => {
  const tags = [make_tag({ id: 'work', group_id: 'area' }), make_tag({ id: 'home', group_id: 'area' })]
  const work = make_task({ id: 'work', tag_ids: ['work'] })
  const home = make_task({ id: 'home', tag_ids: ['home'] })
  const done_work = make_task({ id: 'done_work', tag_ids: ['work'], is_done: true })
  const repeating = make_task({ id: 'repeating', recurrence: 'FREQ=DAILY' })
  const all_tasks = [work, home, done_work, repeating]

  const is_open: RuleCondition = { kind: 'status', is_done: false }
  const has_work: RuleCondition = { kind: 'tag', tag_id: 'work', has_tag: true }
  const has_home: RuleCondition = { kind: 'tag', tag_id: 'home', has_tag: true }
  const repeats: RuleCondition = { kind: 'recurring', is_recurring: true }

  function matching(rule: TagRule): string[] {
    return all_tasks.filter((task) => rule_matches(rule, task, all_tasks, chain_tag_ids_of(task, all_tasks), tags)).map((task) => task.id)
  }

  test('an any group inside an all rule', () => {
    expect(matching({ match: 'all', conditions: [is_open, { kind: 'nested', match: 'any', conditions: [has_work, has_home] }] })).toEqual(['work', 'home'])
  })

  test('an all group inside an any rule', () => {
    expect(matching({ match: 'any', conditions: [repeats, { kind: 'nested', match: 'all', conditions: [has_work, is_open] }] })).toEqual(['work', 'repeating'])
  })

  test('groups nest to any depth', () => {
    const innermost: RuleCondition = { kind: 'nested', match: 'any', conditions: [has_home, repeats] }
    const middle: RuleCondition = { kind: 'nested', match: 'all', conditions: [is_open, innermost] }
    expect(matching({ match: 'any', conditions: [{ kind: 'nested', match: 'all', conditions: [middle] }, { kind: 'status', is_done: true }] })).toEqual(['home', 'done_work', 'repeating'])
  })

  test('an empty group matches every task', () => {
    expect(matching({ match: 'all', conditions: [{ kind: 'nested', match: 'any', conditions: [] }] })).toEqual(['work', 'home', 'done_work', 'repeating'])
  })
})
