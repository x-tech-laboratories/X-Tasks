import { format_local } from '@x-tech-laboratories/x-libs/dates'
import { format_clock } from '@x-tech-laboratories/x-libs/durations'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { Markdown } from '@x-tech-laboratories/x-libs/web/react/markdown'
import { ProgressBar } from '@x-tech-laboratories/x-libs/web/react/progress'
import { use_now, type Countdown } from '@x-tech-laboratories/x-libs/web/react/time'
import type { Task } from '@shared/tasks'
import { entry_seconds, seconds_by_day, short_time_label, type TimeEntry } from '@shared/time_tracking'
import { pomodoro_label, type Pomodoro } from './pomodoro'

// ============================================================================
// Focus view
// ============================================================================

interface FocusViewProps {
  task: Task
  // The task's open subtasks, ticked off from here.
  subtasks: Task[]
  // This task's time entries, oldest first.
  entries: TimeEntry[]
  is_timing: boolean
  // The Pomodoro running on this task, if any, and the time left in its phase.
  pomodoro: Pomodoro | null
  countdown: Countdown | null
  on_toggle: (task: Task) => void
  on_start_timer: (task: Task) => void
  on_stop_timer: (task: Task) => void
  on_start_pomodoro: (task: Task) => void
  on_next_round: () => void
  on_skip_break: () => void
  on_stop_pomodoro: () => void
  on_close: () => void
}

// The one task worked on, filling the window: a large clock, the Pomodoro or timer controls, its open subtasks and its notes.
export function FocusView(props: FocusViewProps) {
  const { task, subtasks, entries, is_timing, pomodoro, countdown } = props
  const now = use_now(1000)
  const running = entries.find((entry) => entry.ended_at === null)
  const today_seconds = seconds_by_day(entries, now).get(format_local(now, false)) ?? 0

  const clock = pomodoro && countdown
    ? { time: format_clock(countdown.remaining * 1000), label: pomodoro_label(pomodoro) }
    : pomodoro
      ? { time: '', label: pomodoro_label(pomodoro) }
      : running
        ? { time: format_clock(entry_seconds(running, now) * 1000), label: 'Timing' }
        : { time: short_time_label(today_seconds), label: 'Today' }

  return (
    <Dialog
      title={task.title}
      full
      class_name="focus_view"
      on_close={props.on_close}
      buttons={<button className="accent solid" onClick={props.on_close}>Done focusing</button>}
    >
      <div className="focus_body">
        <section className="focus_clock" aria-label="Clock">
          <span className="focus_clock_label muted">{clock.label}</span>
          {clock.time && <span className="focus_clock_time">{clock.time}</span>}
          {pomodoro && countdown && (
            <ProgressBar value={countdown.total - countdown.remaining} max={countdown.total} label={`${pomodoro_label(pomodoro)} so far`} />
          )}
        </section>

        <div className="focus_controls">
          {!pomodoro && <button className="accent solid" onClick={() => props.on_start_pomodoro(task)}>Start Pomodoro</button>}
          {pomodoro?.phase === 'ready' && <button className="accent solid" onClick={props.on_next_round}>Start round {pomodoro.round + 1}</button>}
          {(pomodoro?.phase === 'break' || pomodoro?.phase === 'long_break') && <button onClick={props.on_skip_break}>Skip break</button>}
          {pomodoro && <button onClick={props.on_stop_pomodoro}>Stop Pomodoro</button>}
          {!pomodoro && (is_timing ? <button onClick={() => props.on_stop_timer(task)}>■ Stop timer</button> : <button onClick={() => props.on_start_timer(task)}>▶ Start timer</button>)}
          <button onClick={() => props.on_toggle(task)}>{task.is_done ? 'Mark as not done' : 'Mark as done'}</button>
        </div>

        {subtasks.length > 0 && (
          <section className="focus_subtasks" aria-label="Subtasks">
            <h2 className="group_heading">Subtasks</h2>
            <ul>
              {subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <label>
                    <input type="checkbox" checked={subtask.is_done} onChange={() => props.on_toggle(subtask)} />
                    {subtask.title}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {task.notes && (
          <section className="focus_notes" aria-label="Notes">
            <Markdown text={task.notes} />
          </section>
        )}
      </div>
    </Dialog>
  )
}
