import { useEffect, useRef, useState } from 'preact/hooks'

import type { RescheduleOption, TaskDateField } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'
import { format_task_date, next_schedule, parse_task_date, reschedule_day, rescheduled, task_date_label } from '@shared/schedule'

// ============================================================================
// Reschedule popup
// ============================================================================

interface ReschedulePopupProps {
  task: Task
  options: RescheduleOption[]
  date_field: TaskDateField
  on_reschedule: (task: Task, schedule: TaskSchedule) => void
  on_close: () => void
}

// Each option shows the day it would move the task to, or is greyed out when its rule is empty or yields no day.
// A recurring task also gets a Next recurrence choice that skips to its next occurrence without completing it.
export function ReschedulePopup({ task, options, date_field, on_reschedule, on_close }: ReschedulePopupProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [picked_day, set_picked_day] = useState('')

  useEffect(() => dialog_ref.current?.showModal(), [])

  const choices = options.map((option) => ({ option, day: reschedule_day(option) }))
  const next_recurrence = task.recurrence ? next_schedule(task) : null
  const next_recurrence_date =
    next_recurrence && (date_field === 'start' ? next_recurrence.start_at ?? next_recurrence.due_at : next_recurrence.due_at ?? next_recurrence.start_at)

  function choose(day: Date): void {
    on_reschedule(task, rescheduled(task, day, date_field))
    on_close()
  }

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      class="recurrence_dialog reschedule_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <h2 class="recurrence_dialog_heading">Reschedule</h2>

      <div class="reschedule_choices">
        {task.recurrence && (
          <button
            class="reschedule_choice"
            disabled={!next_recurrence}
            onClick={() => {
              if (!next_recurrence) return
              on_reschedule(task, next_recurrence)
              on_close()
            }}
          >
            <span>Next recurrence</span>
            <span class="reschedule_day">{next_recurrence_date ? task_date_label(next_recurrence_date) : 'No date ahead'}</span>
          </button>
        )}
        {choices.map(({ option, day }) => (
          <button key={option.id} class="reschedule_choice" disabled={!day} onClick={() => day && choose(day)}>
            <span>{option.name}</span>
            <span class="reschedule_day">
              {day ? task_date_label(format_task_date(day, false)) : option.rule ? 'No date ahead' : 'No rule set'}
            </span>
          </button>
        ))}
        {choices.length === 0 && !task.recurrence && <p class="empty_message">No reschedule options. Add some in Settings.</p>}
      </div>

      <form
        class="task_detail_field"
        onSubmit={(event) => {
          event.preventDefault()
          if (picked_day) choose(parse_task_date(picked_day))
        }}
      >
        <span class="sidebar_heading">Pick a day</span>
        <div class="date_field">
          <input type="date" value={picked_day} onInput={(event) => set_picked_day(event.currentTarget.value)} aria-label="Day" />
          <button type="submit" disabled={!picked_day}>
            Move
          </button>
        </div>
      </form>

      <footer class="recurrence_dialog_footer">
        <button type="button" onClick={on_close}>
          Cancel
        </button>
      </footer>
    </dialog>
  )
}
