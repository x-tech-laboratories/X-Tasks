import { describe, expect, test } from 'vitest'

import { by_position, children_of, nest_tasks, position_for_drop, subtree_ids } from '../src/renderer/views.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Setup
// ============================================================================

const items = [
  { id: 'root', parent_id: null, position: 1 },
  { id: 'child', parent_id: 'root', position: 1 },
  { id: 'grandchild', parent_id: 'child', position: 1 },
  { id: 'sibling', parent_id: null, position: 2 },
  { id: 'other_child', parent_id: 'root', position: 2 }
]

// ============================================================================
// Trees
// ============================================================================

describe('trees', () => {
  test('children_of lists the direct children in their given order', () => {
    expect(children_of('root', items).map((item) => item.id)).toEqual(['child', 'other_child'])
    expect(children_of(null, items).map((item) => item.id)).toEqual(['root', 'sibling'])
    expect(children_of('grandchild', items)).toEqual([])
  })

  test('subtree_ids holds the item and everything below it', () => {
    expect([...subtree_ids('root', items)].sort()).toEqual(['child', 'grandchild', 'other_child', 'root'])
    expect([...subtree_ids('sibling', items)]).toEqual(['sibling'])
    expect([...subtree_ids('missing', items)]).toEqual(['missing'])
  })

  test('by_position sorts by position, ascending', () => {
    expect([{ position: 3 }, { position: -1 }, { position: 1.5 }].sort(by_position)).toEqual([{ position: -1 }, { position: 1.5 }, { position: 3 }])
  })
})

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

// ============================================================================
// Dragging
// ============================================================================

describe('position_for_drop', () => {
  const groups = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 4 }
  ]

  test('dropping between two items takes the midpoint', () => {
    expect(position_for_drop(groups[0]!, groups[2]!, 'before', groups)).toBe(3)
    expect(position_for_drop(groups[2]!, groups[0]!, 'after', groups)).toBe(1.5)
  })

  test('dropping at either end steps one past the target', () => {
    expect(position_for_drop(groups[1]!, groups[0]!, 'before', groups)).toBe(0)
    expect(position_for_drop(groups[0]!, groups[2]!, 'after', groups)).toBe(5)
  })

  test('the neighbour is taken from the list order, not sorted by position', () => {
    const shuffled = [groups[2]!, groups[0]!, groups[1]!]
    expect(position_for_drop(groups[1]!, groups[0]!, 'before', shuffled)).toBe(2.5)
  })
})
