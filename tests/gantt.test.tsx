// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import { GanttView } from '../src/web/GanttView.tsx'
import { make_task } from './fixtures.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom lays nothing out, and the chart measures its labels on a later frame.
;(SVGElement.prototype as unknown as { getBBox: () => object }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })

function render_chart(rows: string[]): HTMLElement {
  const tasks = [
    make_task({ id: 'design', start_at: '2026-03-02', due_at: '2026-03-04' }),
    make_task({ id: 'build', start_at: '2026-03-05', due_at: '2026-03-09' }),
    make_task({ id: 'ship', start_at: '2026-03-10', due_at: '2026-03-11' }),
    make_task({ id: 'undated' })
  ]
  const waits_on = new Map([
    ['build', ['design', 'undated']],
    ['ship', ['build']]
  ])
  const element = document.createElement('div')
  document.body.append(element)
  act(() =>
    createRoot(element).render(
      <GanttView
        rows={tasks.filter((task) => rows.includes(task.id))}
        tasks={tasks}
        waits_on={waits_on}
        scale="day"
        selected_task_id={null}
        on_change_scale={() => {}}
        on_select={() => {}}
        on_set_schedule={() => {}}
      />
    )
  )
  return element
}

describe('GanttView', () => {
  it('charts the dated tasks outside the view that a row waits on or that wait on a row, with their arrows', () => {
    const chart = render_chart(['build'])
    const bars = [...chart.querySelectorAll('.bar-wrapper')].map((bar) => [bar.getAttribute('data-id'), bar.classList.contains('is_outside')])
    expect(bars).toEqual([
      ['build', false],
      ['design', true],
      ['ship', true]
    ])
    const arrows = [...chart.querySelectorAll('.arrow path')].map((arrow) => `${arrow.getAttribute('data-from')}>${arrow.getAttribute('data-to')}`)
    expect(arrows.sort()).toEqual(['build>ship', 'design>build'])
  })
})
