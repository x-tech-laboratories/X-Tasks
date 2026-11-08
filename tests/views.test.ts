import { describe, expect, test } from 'vitest'

import { nest_tasks } from '../src/web/views.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Nesting
// ============================================================================

describe('nest_tasks', () => {
  const grandparent = make_task({ id: 'g' })
  const parent = make_task({ id: 'p', parent_id: 'g' })
  const child = make_task({ id: 'c', parent_id: 'p' })
  const loner = make_task({ id: 'l' })
  const all_tasks = [grandparent, parent, child, loner]

  test('each shown task sits under its parent', () => {
    const nodes = nest_tasks(all_tasks, all_tasks)
    expect(nodes.map((node) => node.task.id)).toEqual(['g', 'l'])
    expect(nodes[0]!.children[0]!.task.id).toBe('p')
    expect(nodes[0]!.children[0]!.children[0]!.task.id).toBe('c')
  })

  test('a task whose parent is hidden moves up to its nearest shown ancestor', () => {
    const nodes = nest_tasks([grandparent, child], all_tasks)
    expect(nodes.map((node) => node.task.id)).toEqual(['g'])
    expect(nodes[0]!.children.map((node) => node.task.id)).toEqual(['c'])
  })

  test('a task with no shown ancestor goes to the top, in the order given', () => {
    expect(nest_tasks([child, loner], all_tasks).map((node) => node.task.id)).toEqual(['c', 'l'])
  })
})
