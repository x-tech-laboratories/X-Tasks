import { useEffect, useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'

// ============================================================================
// Task detail
// ============================================================================

interface TaskDetailProps {
  task: Task
  task_lists: TaskList[]
  subtask_count: number
  on_toggle: (task: Task) => void
  on_rename: (task: Task, title: string) => void
  on_set_notes: (task: Task, notes: string) => void
  on_move_to_list: (task: Task, list_id: string | null) => void
  on_remove: (task: Task) => void
  on_close: () => void
}

const INBOX_OPTION = ''

export function TaskDetail({
  task, task_lists, subtask_count, on_toggle, on_rename, on_set_notes, on_move_to_list, on_remove, on_close
}: TaskDetailProps) {
  const [title_draft, set_title_draft] = useState(task.title)
  const [notes_draft, set_notes_draft] = useState(task.notes)

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

  function change_list(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value
    on_move_to_list(task, value === INBOX_OPTION ? null : value)
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

      <label class="task_detail_field">
        <span class="sidebar_heading">List</span>
        <select value={task.list_id ?? INBOX_OPTION} onChange={change_list}>
          <option value={INBOX_OPTION}>Inbox</option>
          {task_lists.map((task_list) => (
            <option key={task_list.id} value={task_list.id}>
              {task_list.name}
            </option>
          ))}
        </select>
      </label>

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
          {subtask_count > 0 && ` · ${subtask_count} ${subtask_count === 1 ? 'subtask' : 'subtasks'}`}
        </span>
        <button class="danger_button" onClick={() => on_remove(task)}>
          Delete
        </button>
      </footer>
    </aside>
  )
}
