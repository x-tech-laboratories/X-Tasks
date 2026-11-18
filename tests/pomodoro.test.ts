import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { advance_pomodoro, next_pomodoro, pomodoro_ended_message, pomodoro_in_phase, pomodoro_label, pomodoro_seconds, type Pomodoro } from '../src/shared/pomodoro'
import {
  add_task, attach_task_database, close_task_database, get_pomodoro, list_time_entries, next_pomodoro_round, skip_pomodoro_break, start_pomodoro, stop_pomodoro, tick_pomodoro
} from '../src/shared/task_database'

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

// ============================================================================
// Running Pomodoro
// ============================================================================

describe('a running pomodoro', () => {
  const settings = { ...DEFAULT_SETTINGS, pomodoro_work_minutes: 25, pomodoro_break_minutes: 5, pomodoro_rounds: 4 }
  const start = new Date('2026-11-18T09:00:00Z')

  it('gives each phase its end, and none while waiting', () => {
    expect(pomodoro_in_phase({ task_id: 'task', phase: 'work', round: 1 }, start, settings).phase_ends_at).toBe('2026-11-18T09:25:00.000Z')
    expect(pomodoro_in_phase({ task_id: 'task', phase: 'ready', round: 1 }, start, settings).phase_ends_at).toBeNull()
  })

  it('moves past every phase that ended, each starting where the last ended', () => {
    const state = pomodoro_in_phase({ task_id: 'task', phase: 'work', round: 1 }, start, settings)

    expect(advance_pomodoro(state, new Date('2026-11-18T09:20:00Z'), settings)).toEqual({ state, ended: [] })

    const later = advance_pomodoro(state, new Date('2026-11-18T10:00:00Z'), settings)
    expect(later.ended.map((each) => each.phase)).toEqual(['work', 'break'])
    expect(later.state).toEqual({ task_id: 'task', phase: 'ready', round: 1, phase_ends_at: null })
  })

  it('says what comes after each phase', () => {
    const work = pomodoro_in_phase({ task_id: 'task', phase: 'work', round: 2 }, start, settings)
    expect(pomodoro_ended_message(work, settings)).toEqual({ title: 'Time for a break', message: 'Round 2 done. Take 5m away from it.' })
    expect(pomodoro_ended_message({ ...work, phase: 'break' }, settings)).toEqual({ title: 'Break over', message: 'Start round 3 when you are ready.' })
  })
})

describe('the stored pomodoro', () => {
  beforeEach(() => attach_task_database(new DatabaseSync(':memory:'), ':memory:'))
  afterEach(() => close_task_database())

  it('times its task, stops the timer where the round ended, and outlasts being read again', () => {
    const task = add_task('Write report', null, [], null)
    start_pomodoro(task.id, '2026-11-18T09:00:00.000Z')
    expect(list_time_entries()).toMatchObject([{ task_id: task.id, ended_at: null }])

    expect(tick_pomodoro('2026-11-18T09:10:00.000Z')).toEqual([])
    const ended = tick_pomodoro('2026-11-18T09:27:00.000Z')
    expect(ended.map((each) => each.phase)).toEqual(['work'])
    expect(list_time_entries()).toMatchObject([{ task_id: task.id, ended_at: '2026-11-18T09:25:00.000Z' }])
    expect(get_pomodoro()).toMatchObject({ phase: 'break', phase_ends_at: '2026-11-18T09:30:00.000Z' })

    expect(skip_pomodoro_break()).toMatchObject({ phase: 'ready', phase_ends_at: null })
    expect(next_pomodoro_round('2026-11-18T09:28:00.000Z')).toMatchObject({ phase: 'work', round: 2 })
    expect(list_time_entries().filter((each) => each.ended_at === null)).toHaveLength(1)

    stop_pomodoro()
    expect(get_pomodoro()).toBeNull()
    expect(list_time_entries().filter((each) => each.ended_at === null)).toHaveLength(1)
  })
})
