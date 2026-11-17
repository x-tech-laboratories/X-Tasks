import { format_clock } from '@x-tech-laboratories/x-libs/durations'

// ============================================================================
// Tray menu
// ============================================================================

// A running timer as the tray shows it.
export interface TrayTimer {
  task_id: string
  title: string
  seconds: number
}

// One row of the tray's menu: a running timer that opens its task, a command, or a line between groups.
export type TrayItem =
  | { kind: 'timer'; label: string; task_id: string }
  | { kind: 'command'; label: string; command: 'stop_timers' | 'show' | 'quit' }
  | { kind: 'separator' }

// Each running timer with its time, Stop when any runs, then showing the window and quitting.
export function tray_items(timers: TrayTimer[]): TrayItem[] {
  const timer_items = timers.map((timer): TrayItem => ({ kind: 'timer', label: `${timer.title} — ${format_clock(timer.seconds * 1000)}`, task_id: timer.task_id }))
  const stop_items: TrayItem[] = timers.length === 0 ? [] : [{ kind: 'command', label: timers.length === 1 ? 'Stop timer' : 'Stop every timer', command: 'stop_timers' }, { kind: 'separator' }]
  return [
    ...timer_items,
    ...stop_items,
    { kind: 'command', label: 'Show X-Tasks', command: 'show' },
    { kind: 'command', label: 'Quit', command: 'quit' }
  ]
}

// The tooltip names the timed tasks and their times, or the app alone when none runs.
export function tray_tooltip(timers: TrayTimer[]): string {
  if (timers.length === 0) return 'X-Tasks'
  return ['X-Tasks', ...timers.map((timer) => `${timer.title} — ${format_clock(timer.seconds * 1000)}`)].join('\n')
}
