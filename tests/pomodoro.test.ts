import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { next_pomodoro, pomodoro_label, pomodoro_seconds, type Pomodoro } from '../src/web/pomodoro'

// ============================================================================
// Pomodoro
// ============================================================================

describe('pomodoro phases', () => {
  const settings = { ...DEFAULT_SETTINGS, pomodoro_rounds: 2 }
  const round_one: Pomodoro = { task_id: 'task', phase: 'work', round: 1 }

  it('follows a round with a break, then waits, then starts the next round', () => {
    const after_work = next_pomodoro(round_one, settings)
    const after_break = next_pomodoro(after_work, settings)

    expect([after_work.phase, after_break.phase]).toEqual(['break', 'ready'])
    expect(next_pomodoro(after_break, settings)).toEqual({ task_id: 'task', phase: 'work', round: 2 })
  })

  it('gives a long break after the set number of rounds', () => {
    expect(next_pomodoro({ ...round_one, round: 2 }, settings).phase).toBe('long_break')
    expect(next_pomodoro({ ...round_one, round: 3 }, settings).phase).toBe('break')
  })

  it('times each phase from the settings, and waiting not at all', () => {
    expect(['work', 'break', 'long_break', 'ready'].map((phase) => pomodoro_seconds(phase as Pomodoro['phase'], settings))).toEqual([1500, 300, 900, 0])
  })

  it('names the phase', () => {
    expect(pomodoro_label(round_one)).toBe('Round 1')
    expect(pomodoro_label({ ...round_one, phase: 'ready' })).toBe('Round 1 done')
  })
})
