import type { Settings } from './settings'
import { short_time_label } from './time_tracking'

// ============================================================================
// Pomodoro
// ============================================================================

// A round of work, a break after it, a longer break after every few rounds, or waiting for the next round to be started.
export type PomodoroPhase = 'work' | 'break' | 'long_break' | 'ready'

export interface Pomodoro {
  task_id: string
  phase: PomodoroPhase
  // Which round of work this is or was, counting from one.
  round: number
}

type PomodoroSettings = Pick<Settings, 'pomodoro_work_minutes' | 'pomodoro_break_minutes' | 'pomodoro_long_break_minutes' | 'pomodoro_rounds'>

// Work is followed by a break, a long one after every set number of rounds; a break ends waiting for the next round.
export function next_pomodoro(pomodoro: Pomodoro, settings: PomodoroSettings): Pomodoro {
  switch (pomodoro.phase) {
    case 'work': return { ...pomodoro, phase: pomodoro.round % settings.pomodoro_rounds === 0 ? 'long_break' : 'break' }
    case 'break':
    case 'long_break': return { ...pomodoro, phase: 'ready' }
    case 'ready': return { ...pomodoro, phase: 'work', round: pomodoro.round + 1 }
  }
}

// How long a phase lasts in seconds; waiting for the next round has no end.
export function pomodoro_seconds(phase: PomodoroPhase, settings: PomodoroSettings): number {
  switch (phase) {
    case 'work': return settings.pomodoro_work_minutes * 60
    case 'break': return settings.pomodoro_break_minutes * 60
    case 'long_break': return settings.pomodoro_long_break_minutes * 60
    case 'ready': return 0
  }
}

export function pomodoro_label(pomodoro: Pomodoro): string {
  switch (pomodoro.phase) {
    case 'work': return `Round ${pomodoro.round}`
    case 'break': return 'Break'
    case 'long_break': return 'Long break'
    case 'ready': return `Round ${pomodoro.round} done`
  }
}

// ============================================================================
// Running Pomodoro
// ============================================================================

// The Pomodoro as the store keeps it, with when its phase ends, so it carries on through a reload or a restart; null while waiting for the next round.
export interface PomodoroState extends Pomodoro {
  phase_ends_at: string | null
}

// The Pomodoro in a phase that starts at the time given.
export function pomodoro_in_phase(pomodoro: Pomodoro, started_at: Date, settings: PomodoroSettings): PomodoroState {
  const seconds = pomodoro_seconds(pomodoro.phase, settings)
  return { ...pomodoro, phase_ends_at: seconds ? new Date(started_at.getTime() + seconds * 1000).toISOString() : null }
}

// Moves past every phase that has ended by now, each next one starting where the last ended, and lists the ones that ended.
export function advance_pomodoro(state: PomodoroState, now: Date, settings: PomodoroSettings): { state: PomodoroState; ended: PomodoroState[] } {
  let current = state
  const ended: PomodoroState[] = []
  while (current.phase_ends_at !== null && Date.parse(current.phase_ends_at) <= now.getTime()) {
    ended.push(current)
    current = pomodoro_in_phase(next_pomodoro(current, settings), new Date(current.phase_ends_at), settings)
  }
  return { state: current, ended }
}

// What to tell the user when a phase ends: its title and message.
export function pomodoro_ended_message(ended: PomodoroState, settings: PomodoroSettings): { title: string; message: string } {
  if (ended.phase === 'work') {
    const next = next_pomodoro(ended, settings)
    return { title: 'Time for a break', message: `Round ${ended.round} done. Take ${short_time_label(pomodoro_seconds(next.phase, settings))} away from it.` }
  }
  return { title: 'Break over', message: `Start round ${ended.round + 1} when you are ready.` }
}
