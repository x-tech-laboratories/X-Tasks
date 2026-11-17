import { useState } from 'react'

import { parse_local, shift_day } from '@x-tech-laboratories/x-libs/dates'
import { PageHeading } from '@x-tech-laboratories/x-libs/web/react/layout'
import { toast } from '@x-tech-laboratories/x-libs/web/react/toasts'
import type { Task } from '@shared/tasks'
import { short_time_label, type TimeEntry } from '@shared/time_tracking'
import { week_start_of } from './reports'
import { day_totals, timesheet_csv, week_days, week_label, worklog_rows } from './worklog'

// ============================================================================
// Worklog page
// ============================================================================

interface WorklogPageProps {
  tasks: Task[]
  time_entries: TimeEntry[]
  today: string
  now: Date
  // The names of the plain tags a task has or takes from the tasks above it, for the timesheet.
  tag_names_of: (task: Task) => string[]
  // A phone saves no files, so it only offers a copy.
  can_save_files: boolean
  on_select_task: (task: Task) => void
}

// The time on each task for each day of a week, with each day's and the week's total, saved or copied as a timesheet.
export function WorklogPage({ tasks, time_entries, today, now, tag_names_of, can_save_files, on_select_task }: WorklogPageProps) {
  const this_week = week_start_of(today)
  const [week_start, set_week_start] = useState(this_week)
  const days = week_days(week_start)
  const rows = worklog_rows(tasks, time_entries, days, now)
  const totals = day_totals(rows, days.length)
  const week_total = totals.reduce((sum, each) => sum + each, 0)
  const csv = () => timesheet_csv(rows, days, tag_names_of)

  function copy_csv(): void {
    void navigator.clipboard?.writeText(csv()).then(() => toast('Timesheet copied'))
  }

  return (
    <>
      <PageHeading
        title="Worklog"
        subtitle={<span className="time_total">{short_time_label(week_total)} this week</span>}
        actions={
          <>
            {can_save_files && (
              <button onClick={() => void window.x_settings.save_text_file(`timesheet-${week_start}.csv`, csv())} disabled={rows.length === 0}>
                Export CSV
              </button>
            )}
            <button onClick={copy_csv} disabled={rows.length === 0}>
              Copy CSV
            </button>
          </>
        }
      />

      <div className="stepper worklog_stepper" role="group" aria-label="Week">
        <button type="button" aria-label="Previous week" onClick={() => set_week_start(shift_day(week_start, -7))}>‹</button>
        <span className="worklog_week">{week_label(week_start)}</span>
        <button type="button" aria-label="Next week" onClick={() => set_week_start(shift_day(week_start, 7))}>›</button>
        <button type="button" disabled={week_start === this_week} onClick={() => set_week_start(this_week)}>This week</button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No time tracked this week.</p>
      ) : (
        <div className="table-wrap worklog_table">
          <table>
            <thead>
              <tr>
                <th scope="col">Task</th>
                {days.map((day) => (
                  <th key={day} scope="col" className="time_cell">
                    {parse_local(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
                <th scope="col" className="time_cell">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.task.id}>
                  <td>
                    <button className="link worklog_task" onClick={() => on_select_task(row.task)}>{row.task.title}</button>
                    {row.parent_path && <span className="muted small"> · {row.parent_path}</span>}
                  </td>
                  {row.seconds.map((seconds, index) => (
                    <td key={days[index]} className="time_cell">{seconds >= 60 ? short_time_label(seconds) : ''}</td>
                  ))}
                  <td className="time_cell">{short_time_label(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {totals.map((seconds, index) => (
                  <td key={days[index]} className="time_cell">{seconds >= 60 ? short_time_label(seconds) : ''}</td>
                ))}
                <td className="time_cell">{short_time_label(week_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}
