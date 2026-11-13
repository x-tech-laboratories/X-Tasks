import { describe, expect, test } from 'vitest'

import type { RuleCondition, Task } from '../src/shared/tasks.ts'
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
