import { describe, expect, it } from 'vitest'

import type { TimeEntry } from '../src/shared/time_tracking'
import { day_totals, timesheet_csv, week_days, week_label, worklog_rows } from '../src/web/worklog'
import { make_task } from './fixtures'

// ============================================================================
// Helpers
// ============================================================================

function worked(task_id: string, day: number, hour: number, minutes: number): TimeEntry {
  const started_at = new Date(2026, 10, day, hour)
  return { id: `${task_id}@${day}:${hour}`, task_id, started_at: started_at.toISOString(), ended_at: new Date(started_at.getTime() + minutes * 60_000).toISOString() }
}

const now = new Date(2026, 10, 25, 12)
const project = make_task({ id: 'project', title: 'Launch the site' })
const copy = make_task({ id: 'copy', title: 'Write the copy, "short"', parent_id: 'project' })
const review = make_task({ id: 'review', title: 'Prepare the review' })
const tasks = [project, copy, review]
const days = week_days('2026-11-16')

// ============================================================================
// Weeks
// ============================================================================

describe('weeks', () => {
  it('lists the seven days from the first', () => {
    expect(days).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
  })

  it('names a week by its first and last days, with the month again when it changes', () => {
    expect(week_label('2026-11-16')).toMatch(/Nov 16 – 22, 2026/)
    expect(week_label('2026-11-30')).toMatch(/Nov 30 – Dec 6, 2026/)
  })
})

// ============================================================================
// Rows
// ============================================================================

describe('worklog rows', () => {
  const entries = [worked('copy', 16, 9, 90), worked('copy', 18, 9, 30), worked('review', 17, 14, 45), worked('review', 24, 9, 60)]

  it('puts each task with time in the week in a row, most time first, leaving out other weeks', () => {
    const rows = worklog_rows(tasks, entries, days, now)

    expect(rows.map((row) => [row.task.id, row.parent_path, row.total / 60])).toEqual([['copy', 'Launch the site', 120], ['review', '', 45]])
    expect(rows[0]!.seconds.map((seconds) => seconds / 60)).toEqual([90, 0, 30, 0, 0, 0, 0])
  })

  it('totals each day across the rows', () => {
    expect(day_totals(worklog_rows(tasks, entries, days, now), 7).map((seconds) => seconds / 60)).toEqual([90, 45, 30, 0, 0, 0, 0])
  })

  it('writes a timesheet line per task and day worked, quoting fields that need it', () => {
    const csv = timesheet_csv(worklog_rows(tasks, entries, days, now), days, (task) => (task.id === 'review' ? ['Career', 'Work › Meetings'] : []))

    expect(csv.split('\r\n')).toEqual([
      'Date,Task,Parent,Tags,Minutes,Hours',
      '2026-11-16,"Write the copy, ""short""",Launch the site,,90,1.50',
      '2026-11-17,Prepare the review,,Career; Work › Meetings,45,0.75',
      '2026-11-18,"Write the copy, ""short""",Launch the site,,30,0.50',
      ''
    ])
  })
})
