import { useEffect, useRef, useState } from 'preact/hooks'

import type { RescheduleOption, TaskDateField } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'
import { format_task_date, next_schedule, parse_task_date, reschedule_day, rescheduled, task_date_label } from '@shared/schedule'

// ============================================================================
// Reschedule popup
// ============================================================================

interface ReschedulePopupProps {
  // One task, or several picked together, which all move to the chosen day.
  tasks: Task[]
  options: RescheduleOption[]
  date_field: TaskDateField
  on_reschedule: (task: Task, schedule: TaskSchedule) => void
  on_close: () => void
}

// Each option shows the day it would move the task to, or is greyed out when its rule is empty or yields no day.
// Recurring tasks also get a Next recurrence choice that skips each to its next occurrence without completing it.
export function ReschedulePopup({ tasks, options, date_field, on_reschedule, on_close }: ReschedulePopupProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [picked_day, set_picked_day] = useState('')

  useEffect(() => dialog_ref.current?.showModal(), [])

  const choices = options.map((option) => ({ option, day: reschedule_day(option) }))
  // The Next recurrence choice shows only when every task repeats, and its day only when there is one task.
  const repeats = tasks.every((task) => task.recurrence)
  const next_recurrences = repeats ? tasks.map((task) => ({ task, next: next_schedule(task) })) : []
  const has_next_recurrence = next_recurrences.some(({ next }) => next)
  const only_next = tasks.length === 1 ? next_recurrences[0]?.next : null
  const next_recurrence_date =
    only_next && (date_field === 'start' ? only_next.start_at ?? only_next.due_at : only_next.due_at ?? only_next.start_at)

  function choose(day: Date): void {
    for (const task of tasks) on_reschedule(task, rescheduled(task, day, date_field))
    on_close()
  }

  function skip_to_next_recurrence(): void {
    for (const { task, next } of next_recurrences) if (next) on_reschedule(task, next)
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
      <h2 class="recurrence_dialog_heading">{tasks.length === 1 ? 'Reschedule' : `Reschedule ${tasks.length} tasks`}</h2>

      <div class="reschedule_choices">
        {repeats && (
          <button class="reschedule_choice" disabled={!has_next_recurrence} onClick={skip_to_next_recurrence}>
            <span>Next recurrence</span>
            <span class="reschedule_day">
              {!has_next_recurrence ? 'No date ahead' : next_recurrence_date ? task_date_label(next_recurrence_date) : 'Each to its own'}
            </span>
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
        {choices.length === 0 && !repeats && <p class="empty_message">No reschedule options. Add some in Settings.</p>}
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
