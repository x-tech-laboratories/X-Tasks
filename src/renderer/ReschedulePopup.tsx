import { useEffect, useRef, useState } from 'preact/hooks'

import type { RescheduleOption } from '@shared/settings'
import type { Task, TaskSchedule } from '@shared/tasks'
import { format_task_date, parse_task_date, reschedule_day, rescheduled, task_date_label } from '@shared/schedule'

// ============================================================================
// Reschedule popup
// ============================================================================

interface ReschedulePopupProps {
  task: Task
  options: RescheduleOption[]
  on_reschedule: (task: Task, schedule: TaskSchedule) => void
  on_close: () => void
}

// Each option shows the day it would move the task to; options whose rule yields no day are left out.
export function ReschedulePopup({ task, options, on_reschedule, on_close }: ReschedulePopupProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [picked_day, set_picked_day] = useState('')

  useEffect(() => dialog_ref.current?.showModal(), [])

  const choices = options.flatMap((option) => {
    const day = reschedule_day(option)
    return day ? [{ option, day }] : []
  })

  function choose(day: Date): void {
    on_reschedule(task, rescheduled(task, day))
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
        {choices.map(({ option, day }) => (
          <button key={option.id} class="reschedule_choice" onClick={() => choose(day)}>
            <span>{option.name}</span>
            <span class="reschedule_day">{task_date_label(format_task_date(day, false))}</span>
          </button>
        ))}
        {choices.length === 0 && <p class="empty_message">No reschedule options. Add some in Settings.</p>}
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
