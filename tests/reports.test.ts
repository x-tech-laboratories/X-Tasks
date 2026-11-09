import { describe, expect, test } from 'vitest'

import { DEFAULT_SETTINGS, type ReportWidget } from '../src/shared/settings.ts'
import { task_map } from '../src/web/reports.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Task map
// ============================================================================

describe('task_map', () => {
  const widget: ReportWidget = { id: 'map', kind: 'task_map', title: 'Task map', tag_ids: [], days: 30, group_id: '' }
  const relationships = DEFAULT_SETTINGS.task_relationships
  const project = make_task({ id: 'project', title: 'Project' })
  const step = make_task({ id: 'step', title: 'Step', parent_id: 'project' })
  const report = make_task({ id: 'report', title: 'Report', links: [{ other_id: 'data', relationship_id: 'waits_on' }] })
  const data = make_task({ id: 'data', title: 'Data', links: [{ other_id: 'report', relationship_id: 'related_to' }] })
  const finished = make_task({ id: 'finished', title: 'Finished', parent_id: 'project', is_done: true })
  const loner = make_task({ id: 'loner' })
  const all_tasks = [project, step, report, data, finished, loner]

  test('only tasks with a subtask, parent or link show, done ones left out', () => {
    const { nodes } = task_map(widget, all_tasks, relationships)
    expect(nodes.map((node) => node.id).sort()).toEqual(['data', 'project', 'report', 'step'])
    expect(nodes.find((node) => node.id === 'report')!.degree).toBe(2)
  })

  test('lines read as subtasks and relationships, with arrows only one way', () => {
    const { links } = task_map(widget, all_tasks, relationships)
    expect(links).toEqual([
      { source: 'project', target: 'step', kind: 'subtask', description: 'Step is a subtask of Project', is_directed: false },
      { source: 'report', target: 'data', kind: 'relationship', description: 'Report waits on Data', is_directed: true },
      { source: 'data', target: 'report', kind: 'relationship', description: 'Data related to Report', is_directed: false }
    ])
  })

  test('done tasks show when the card asks for them', () => {
    const { nodes } = task_map({ ...widget, show_done: true }, all_tasks, relationships)
    expect(nodes.some((node) => node.id === 'finished')).toBe(true)
  })
})
