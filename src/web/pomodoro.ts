import type { Settings } from '@shared/settings'

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
