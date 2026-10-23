import { useEffect, useState } from 'preact/hooks'

import type { Tag, Task } from '@shared/tasks'
import { tag_path } from './views'

// ============================================================================
// Task detail
// ============================================================================

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  subtask_count: number
  on_toggle: (task: Task) => void
  on_rename: (task: Task, title: string) => void
  on_set_notes: (task: Task, notes: string) => void
  on_tag: (task: Task, tag: Tag) => void
  on_untag: (task: Task, tag: Tag) => void
  on_remove: (task: Task) => void
  on_close: () => void
}

export function TaskDetail({
  task, tags, subtask_count, on_toggle, on_rename, on_set_notes, on_tag, on_untag, on_remove, on_close
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

  const task_tags = tags.filter((tag) => task.tag_ids.includes(tag.id))
  const other_tags = tags.filter((tag) => !task.tag_ids.includes(tag.id))

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

      <div class="task_detail_field">
        <span class="sidebar_heading">Tags</span>
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
          <select value="" onChange={add_tag} aria-label="Add tag">
            <option value="">Add tag…</option>
            {other_tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag_path(tag, tags)}
              </option>
            ))}
          </select>
        )}
        {tags.length === 0 && <span class="setting_hint">Make a tag in the sidebar to tag this task.</span>}
      </div>

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
