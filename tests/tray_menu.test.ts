import { describe, expect, it } from 'vitest'

import { tray_items, tray_tooltip } from '../src/main/tray_menu'

// ============================================================================
// Tray menu
// ============================================================================

describe('the tray menu', () => {
  it('offers only the window and quitting while no timer runs', () => {
    expect(tray_items([]).map((item) => (item.kind === 'separator' ? '—' : item.label))).toEqual(['Show X-Tasks', 'Quit'])
    expect(tray_tooltip([])).toBe('X-Tasks')
  })

  it('lists each running timer with its time, opening its task, then stops them', () => {
    const timers = [{ task_id: 'report', title: 'Write report', seconds: 754 }, { task_id: 'mail', title: 'Answer mail', seconds: 3725 }]

    const items = tray_items(timers)

    expect(items.map((item) => (item.kind === 'separator' ? '—' : item.label))).toEqual(['Write report — 12:34', 'Answer mail — 1:02:05', 'Stop every timer', '—', 'Show X-Tasks', 'Quit'])
    expect(items[0]).toEqual({ kind: 'timer', label: 'Write report — 12:34', task_id: 'report' })
    expect(tray_tooltip(timers)).toBe('X-Tasks\nWrite report — 12:34\nAnswer mail — 1:02:05')
  })

  it('says Stop timer for a single timer', () => {
    expect(tray_items([{ task_id: 'report', title: 'Write report', seconds: 5 }]).some((item) => item.kind === 'command' && item.label === 'Stop timer')).toBe(true)
  })
})
