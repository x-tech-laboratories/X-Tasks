import { parse_local, shift_day } from '@x-tech-laboratories/x-libs/dates'
import { task_and_ancestors, type Task } from '@shared/tasks'
import { seconds_by_day, task_entries, type TimeEntry } from '@shared/time_tracking'

// ============================================================================
// Weeks
// ============================================================================

// The seven days of the week that starts on the given day, as YYYY-MM-DD.
export function week_days(week_start: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shift_day(week_start, offset))
}

// A week named by its first and last days, such as "Nov 16 – 22, 2026" or "Nov 30 – Dec 6, 2026".
export function week_label(week_start: string): string {
  const first = parse_local(week_start)
  const last = parse_local(shift_day(week_start, 6))
  const same_month = first.getMonth() === last.getMonth()
  const start_text = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const end_text = last.toLocaleDateString(undefined, same_month ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${start_text} – ${end_text}, ${last.getFullYear()}`
}

// ============================================================================
// Rows
// ============================================================================

// One task's time on each of the shown days, with the tasks above it named from the top down.
export interface WorklogRow {
  task: Task
  parent_path: string
  seconds: number[]
  total: number
}

// Every task with time on the days, most time first; time on other days is left out.
export function worklog_rows(tasks: Task[], entries: TimeEntry[], days: string[], now: Date): WorklogRow[] {
  const rows = tasks.flatMap((task): WorklogRow[] => {
    const by_day = seconds_by_day(task_entries(entries, task.id), now)
    const seconds = days.map((day) => by_day.get(day) ?? 0)
    const total = seconds.reduce((sum, each) => sum + each, 0)
    if (total < 1) return []
    const parent_path = task_and_ancestors(task, tasks).slice(1).reverse().map((each) => each.title).join(' › ')
    return [{ task, parent_path, seconds, total }]
  })
  return rows.sort((first, second) => second.total - first.total || first.task.title.localeCompare(second.task.title))
}

// The time on each day across every row.
export function day_totals(rows: WorklogRow[], day_count: number): number[] {
  return Array.from({ length: day_count }, (_, index) => rows.reduce((sum, row) => sum + row.seconds[index]!, 0))
}

// ============================================================================
// Timesheet
// ============================================================================

// A field quoted as RFC 4180 asks when it holds a comma, quote or line break.
function csv_field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

// One line per task and day worked, with the minutes and the hours to two places, as timesheet tools import.
export function timesheet_csv(rows: WorklogRow[], days: string[], tag_names_of: (task: Task) => string[]): string {
  const lines = [['Date', 'Task', 'Parent', 'Tags', 'Minutes', 'Hours']]
  days.forEach((day, index) => {
    for (const row of rows) {
      const seconds = row.seconds[index]!
      if (seconds < 1) continue
      lines.push([day, row.task.title, row.parent_path, tag_names_of(row.task).join('; '), String(Math.round(seconds / 60)), (seconds / 3600).toFixed(2)])
    }
  })
  return lines.map((line) => line.map(csv_field).join(',')).join('\r\n') + '\r\n'
}
