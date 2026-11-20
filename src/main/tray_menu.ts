import { format_clock } from '@x-tech-laboratories/x-libs/durations'
import { app_rows, tray_groups, type TrayRow, type TrayView } from '@x-tech-laboratories/x-libs/electron/tray'

// ============================================================================
// Tray menu
// ============================================================================

// A running timer as the tray shows it.
export interface TrayTimer {
  task_id: string
  title: string
  seconds: number
}

// What the tray's rows do.
export interface TrayActions {
  open_task: (task_id: string) => void
  stop_timers: () => unknown
  show: () => void
  quit: () => void
  quit_completely: () => void
}

function timer_label(timer: TrayTimer): string {
  return `${timer.title} — ${format_clock(timer.seconds * 1000)}`
}

// Each running timer with its time, Stop when any runs, then showing the window, quitting the window and tray, and quitting the daemon too.
// The tooltip names the timed tasks and their times, or the app alone when none runs.
export function tray_view(timers: TrayTimer[], actions: TrayActions): TrayView {
  const timer_rows = timers.map((timer): TrayRow => ({ kind: 'item', label: timer_label(timer), run: () => actions.open_task(timer.task_id) }))
  const stop_rows: TrayRow[] = timers.length === 0 ? [] : [{ kind: 'item', label: timers.length === 1 ? 'Stop timer' : 'Stop every timer', run: actions.stop_timers }]
  return {
    tooltip: ['X-Tasks', ...timers.map(timer_label)].join('\n'),
    rows: tray_groups([...timer_rows, ...stop_rows], app_rows({ app_name: 'X-Tasks', show: actions.show, quit: actions.quit, quit_completely: actions.quit_completely }))
  }
}
