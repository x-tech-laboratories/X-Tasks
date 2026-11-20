import { describe, expect, it, vi } from 'vitest'

import { tray_view, type TrayActions, type TrayTimer } from '../src/main/tray_menu'

// ============================================================================
// Tray menu
// ============================================================================

const actions = (): TrayActions => ({ open_task: vi.fn(), stop_timers: vi.fn(), show: vi.fn(), quit: vi.fn(), quit_completely: vi.fn() })
const labels = (timers: TrayTimer[]) => tray_view(timers, actions()).rows.map((row) => (row.kind === 'separator' ? '—' : row.label))

describe('the tray menu', () => {
  it('offers only the window and quitting while no timer runs', () => {
    expect(labels([])).toEqual(['Show X-Tasks', 'Quit', 'Quit completely'])
    expect(tray_view([], actions()).tooltip).toBe('X-Tasks')
  })

  it('lists each running timer with its time, opening its task, then stops them', () => {
    const timers = [{ task_id: 'report', title: 'Write report', seconds: 754 }, { task_id: 'mail', title: 'Answer mail', seconds: 3725 }]
    const done = actions()

    const view = tray_view(timers, done)
    const first = view.rows[0]!
    if (first.kind === 'item') first.run()

    expect(labels(timers)).toEqual(['Write report — 12:34', 'Answer mail — 1:02:05', 'Stop every timer', '—', 'Show X-Tasks', 'Quit', 'Quit completely'])
    expect(done.open_task).toHaveBeenCalledWith('report')
    expect(view.tooltip).toBe('X-Tasks\nWrite report — 12:34\nAnswer mail — 1:02:05')
  })

  it('says Stop timer for a single timer', () => {
    expect(labels([{ task_id: 'report', title: 'Write report', seconds: 5 }])).toContain('Stop timer')
  })
})
