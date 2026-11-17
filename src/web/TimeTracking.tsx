import { useState } from 'react'

import { format_local, relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { format_clock } from '@x-tech-laboratories/x-libs/durations'
import { ProgressBar } from '@x-tech-laboratories/x-libs/web/react/progress'
import { use_now } from '@x-tech-laboratories/x-libs/web/react/time'
import type { Task } from '@shared/tasks'
import { entry_seconds, estimate_text, parse_estimate, seconds_by_day, short_time_label, time_spent_label, total_seconds, type TimeEntry } from '@shared/time_tracking'

// ============================================================================
// Clock
// ============================================================================

// A running timer ticks every second; otherwise a minute is close enough.
function use_timer_clock(is_running: boolean): Date {
  return use_now(is_running ? 1000 : 60_000)
}

function clock_time(iso_time: string): string {
  return new Date(iso_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ============================================================================
// Top bar
// ============================================================================

interface TimerBarProps {
  entry: TimeEntry
  task: Task | undefined
  on_open: (task: Task) => void
  on_stop: () => void
}

// The running timer beside the search bar: its task, opened by a click, the time so far and a stop button.
export function TimerBar({ entry, task, on_open, on_stop }: TimerBarProps) {
  const now = use_timer_clock(true)

  return (
    <div className="timer_bar" role="status" aria-label="Running timer">
      <button className="link timer_task" onClick={() => task && on_open(task)} title="Open this task">
        {task?.title ?? 'Removed task'}
      </button>
      <span className="timer_clock">{format_clock(entry_seconds(entry, now) * 1000)}</span>
      <button onClick={on_stop} aria-label="Stop timer">
        Stop
      </button>
    </div>
  )
}

// ============================================================================
// Row button
// ============================================================================

// Starts the timer on a row's task, or stops it on the task it runs on, which keeps the button in sight.
export function TimerButton({ task, is_timing, on_start, on_stop }: { task: Task; is_timing: boolean; on_start: (task: Task) => void; on_stop: (task: Task) => void }) {
  if (is_timing) {
    return (
      <button className="icon timer_button is_timing" onClick={() => on_stop(task)} aria-label="Stop timer" title="Stop timer">
        ■
      </button>
    )
  }
  return (
    <button className="icon timer_button hover-reveal" onClick={() => on_start(task)} aria-label="Start timer" title="Start timer">
      ▶
    </button>
  )
}

// ============================================================================
// Detail section
// ============================================================================

interface TimeSpentFieldProps {
  task: Task
  // This task's entries, oldest first.
  entries: TimeEntry[]
  is_timing: boolean
  on_start: (task: Task) => void
  on_stop: (task: Task) => void
  on_remove_entry: (entry: TimeEntry) => void
  on_set_estimate: (task: Task, estimate_minutes: number | null) => void
}

// The time spent on a task in all and today against its estimate, a button to time it, and each day's entries, newest first.
export function TimeSpentField({ task, entries, is_timing, on_start, on_stop, on_remove_entry, on_set_estimate }: TimeSpentFieldProps) {
  const now = use_timer_clock(is_timing)
  const [is_listing, set_is_listing] = useState(false)
  const [estimate_draft, set_estimate_draft] = useState(estimate_text(task.estimate_minutes))
  const typed_estimate = parse_estimate(estimate_draft)
  const by_day = seconds_by_day(entries, now)
  const today_seconds = by_day.get(format_local(now, false)) ?? 0
  const days = [...by_day.keys()].sort().reverse()
  const total = total_seconds(entries, now)
  const estimate_seconds = task.estimate_minutes === null ? null : task.estimate_minutes * 60

  // Text it cannot read goes back to the saved estimate.
  function commit_estimate(): void {
    if (typed_estimate === undefined) return set_estimate_draft(estimate_text(task.estimate_minutes))
    set_estimate_draft(estimate_text(typed_estimate))
    if (typed_estimate !== task.estimate_minutes) on_set_estimate(task, typed_estimate)
  }

  return (
    <div className="field time_spent">
      <span className="field-label">Time spent</span>
      <span>
        {entries.length === 0 ? 'None yet' : today_seconds > 0 ? `${time_spent_label(total)} · today ${time_spent_label(today_seconds)}` : time_spent_label(total)}
      </span>
      <label className="inline_fields estimate_field">
        <span>Estimate</span>
        <input
          value={estimate_draft}
          onChange={(event) => set_estimate_draft(event.currentTarget.value)}
          onBlur={commit_estimate}
          onKeyDown={(event) => (event.key === 'Enter' || event.key === 'Escape') && event.currentTarget.blur()}
          placeholder="Such as 1h 30m"
          aria-invalid={typed_estimate === undefined}
          aria-label="Estimate"
        />
      </label>
      {estimate_seconds !== null && (
        <ProgressBar
          value={Math.min(total, estimate_seconds)}
          max={estimate_seconds}
          label="Time spent against the estimate"
          detail={total > estimate_seconds ? `${short_time_label(total - estimate_seconds)} over` : `${short_time_label(estimate_seconds - total)} left`}
          class_name={total > estimate_seconds ? 'is_over' : undefined}
        />
      )}
      <span className="inline_fields">
        {is_timing ? <button onClick={() => on_stop(task)}>■ Stop timer</button> : <button onClick={() => on_start(task)}>▶ Start timer</button>}
        {entries.length > 0 && (
          <button aria-expanded={is_listing} onClick={() => set_is_listing(!is_listing)}>
            {is_listing ? 'Hide entries' : 'Show entries'}
          </button>
        )}
      </span>
      {is_listing && (
        <ul className="time_entries">
          {days.map((day) => (
            <li key={day}>
              <span className="muted small">
                {relative_day_label(day)} · {time_spent_label(by_day.get(day)!)}
              </span>
              <ul>
                {[...entries]
                  .reverse()
                  .filter((entry) => seconds_by_day([entry], now).has(day))
                  .map((entry) => (
                    <li key={entry.id} className="time_entry">
                      {clock_time(entry.started_at)} – {entry.ended_at === null ? 'now' : clock_time(entry.ended_at)}
                      <span className="muted small">{time_spent_label(entry_seconds(entry, now))}</span>
                      <button className="icon remove" onClick={() => on_remove_entry(entry)} aria-label={`Remove the entry from ${clock_time(entry.started_at)}`}>
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
