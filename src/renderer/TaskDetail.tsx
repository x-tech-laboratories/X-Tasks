import { useEffect, useState } from 'preact/hooks'

import type { Tag, TagGroup, Task, TaskSchedule } from '@shared/tasks'
import { RecurrencePicker } from './RecurrencePicker'
import { describe_recurrence, recurrence_anchor } from './schedule'
import { tag_path } from './views'

// ============================================================================
// Task detail
// ============================================================================

interface TaskDetailProps {
  task: Task
  tag_groups: TagGroup[]
  tags: Tag[]
  subtask_count: number
  on_toggle: (task: Task) => void
  on_rename: (task: Task, title: string) => void
  on_set_notes: (task: Task, notes: string) => void
  on_tag: (task: Task, tag: Tag) => void
  on_untag: (task: Task, tag: Tag) => void
  on_set_schedule: (task: Task, schedule: TaskSchedule) => void
  on_reschedule: (task: Task) => void
  is_in_my_day: boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_remove: (task: Task) => void
  on_close: () => void
}

export function TaskDetail({
  task, tag_groups, tags, subtask_count, on_toggle, on_rename, on_set_notes, on_set_schedule, on_tag, on_untag, on_reschedule,
  is_in_my_day, on_set_my_day, on_remove, on_close
}: TaskDetailProps) {
  const [title_draft, set_title_draft] = useState(task.title)
  const [notes_draft, set_notes_draft] = useState(task.notes)
  const [is_picking_recurrence, set_is_picking_recurrence] = useState(false)
  const schedule: TaskSchedule = { start_at: task.start_at, due_at: task.due_at, recurrence: task.recurrence }

  // Each field saves on blur, which happens before this closes the panel.
  useEffect(() => {
    function close_on_escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') on_close()
    }
    window.addEventListener('keydown', close_on_escape)
    return () => window.removeEventListener('keydown', close_on_escape)
  }, [on_close])

  // An emptied title puts the old one back rather than saving a blank task.
  function commit_title(): void {
    const title = title_draft.trim()
    if (!title) set_title_draft(task.title)
    else if (title !== task.title) on_rename(task, title)
  }

  function commit_notes(): void {
    if (notes_draft !== task.notes) on_set_notes(task, notes_draft)
  }

  function add_tag(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement
    const tag = tags.find((each) => each.id === select.value)
    if (tag) on_tag(task, tag)
    select.value = ''
  }

  return (
    <aside class="task_detail">
      <header class="task_detail_header">
        <input
          type="checkbox"
          checked={task.is_done}
          onChange={() => on_toggle(task)}
          aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'}
        />
        <input
          class="task_detail_title"
          value={title_draft}
          onInput={(event) => set_title_draft(event.currentTarget.value)}
          onBlur={commit_title}
          onKeyDown={(event) => (event.key === 'Enter' || event.key === 'Escape') && event.currentTarget.blur()}
          aria-label="Title"
        />
        <button class="remove_button" onClick={on_close} aria-label="Close details">
          ×
        </button>
      </header>

      <button class={is_in_my_day ? 'my_day_button is_selected' : 'my_day_button'} onClick={() => on_set_my_day(task, !is_in_my_day)}>
        {is_in_my_day ? '☀ Added to My Day' : '☀ Add to My Day'}
      </button>

      {tag_groups.map((group) => {
        const group_tags = tags.filter((tag) => tag.group_id === group.id)
        const task_tags = group_tags.filter((tag) => task.tag_ids.includes(tag.id))
        const other_tags = group_tags.filter((tag) => !task.tag_ids.includes(tag.id))

        // A one-tag-per-task group is a single choice, with None to clear it.
        if (group.is_single_choice && task_tags.length <= 1) {
          const current_tag = task_tags[0]

          function choose(event: Event): void {
            const chosen_tag = group_tags.find((tag) => tag.id === (event.currentTarget as HTMLSelectElement).value)
            if (chosen_tag) on_tag(task, chosen_tag)
            else if (current_tag) on_untag(task, current_tag)
          }

          return (
            <label key={group.id} class="task_detail_field">
              <span class="sidebar_heading">{group.name}</span>
              <select value={current_tag?.id ?? ''} onChange={choose}>
                <option value="">None</option>
                {group_tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag_path(tag, tags)}
                  </option>
                ))}
              </select>
            </label>
          )
        }

        return (
          <div key={group.id} class="task_detail_field">
            <span class="sidebar_heading">{group.name}</span>
            {task_tags.length > 0 && (
              <div class="tag_chips">
                {task_tags.map((tag) => (
                  <span key={tag.id} class="tag_chip">
                    {tag_path(tag, tags)}
                    <button onClick={() => on_untag(task, tag)} aria-label={`Remove tag ${tag.name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {other_tags.length > 0 && (
              <select value="" onChange={add_tag} aria-label={`Add ${group.name} tag`}>
                <option value="">Add {group.name.toLowerCase()} tag…</option>
                {other_tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag_path(tag, tags)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )
      })}

      <DateField label="Start" value={task.start_at} on_change={(start_at) => on_set_schedule(task, { ...schedule, start_at })} />
      <DateField label="Due" value={task.due_at} on_change={(due_at) => on_set_schedule(task, { ...schedule, due_at })} />
      <button class="reschedule_button" onClick={() => on_reschedule(task)}>
        Reschedule…
      </button>

      <div class="task_detail_field">
        <span class="sidebar_heading">Repeat</span>
        <button class="recurrence_button" onClick={() => set_is_picking_recurrence(true)}>
          {describe_recurrence(schedule)}
        </button>
      </div>

      {is_picking_recurrence && (
        <RecurrencePicker
          recurrence={task.recurrence}
          anchor={recurrence_anchor(schedule)}
          on_save={(recurrence) => on_set_schedule(task, { ...schedule, recurrence })}
          on_close={() => set_is_picking_recurrence(false)}
        />
      )}

      <label class="task_detail_field task_detail_notes">
        <span class="sidebar_heading">Notes</span>
        <textarea
          value={notes_draft}
          onInput={(event) => set_notes_draft(event.currentTarget.value)}
          onBlur={commit_notes}
          onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
          placeholder="Add notes"
        />
      </label>

      <footer class="task_detail_footer">
        <span>
          Created {new Date(task.created_at).toLocaleDateString()}
          {task.is_done && task.done_at && ` · Done ${new Date(task.done_at).toLocaleDateString()}`}
          {subtask_count > 0 && ` · ${subtask_count} ${subtask_count === 1 ? 'subtask' : 'subtasks'}`}
        </span>
        <button class="danger_button" onClick={() => on_remove(task)}>
          Delete
        </button>
      </footer>
    </aside>
  )
}

// ============================================================================
// Date field
// ============================================================================

interface DateFieldProps {
  label: string
  value: string | null
  on_change: (value: string | null) => void
}

// The time is optional, and clearing the date clears the time with it.
function DateField({ label, value, on_change }: DateFieldProps) {
  const [day = '', time = ''] = value?.split('T') ?? []

  function change(new_day: string, new_time: string): void {
    if (!new_day) on_change(null)
    else on_change(new_time ? `${new_day}T${new_time}` : new_day)
  }

  return (
    <div class="task_detail_field">
      <span class="sidebar_heading">{label}</span>
      <div class="date_field">
        <input
          type="date"
          value={day}
          onChange={(event) => change(event.currentTarget.value, time)}
          aria-label={`${label} date`}
        />
        {day && (
          <input
            type="time"
            value={time}
            onChange={(event) => change(day, event.currentTarget.value)}
            aria-label={`${label} time`}
          />
        )}
        {day && (
          <button class="remove_button" onClick={() => on_change(null)} aria-label={`Clear ${label.toLowerCase()} date`}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
