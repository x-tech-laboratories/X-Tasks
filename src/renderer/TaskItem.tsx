import { useState } from 'preact/hooks'

import type { Task } from '@shared/tasks'
import type { TaskNode } from './views'

// ============================================================================
// Task item
// ============================================================================

interface TaskItemProps {
  node: TaskNode
  can_add_subtasks: boolean
  on_toggle: (task: Task) => void
  on_remove: (task: Task) => void
  on_add_subtask: (parent: Task, title: string) => void
}

export function TaskItem({ node, can_add_subtasks, on_toggle, on_remove, on_add_subtask }: TaskItemProps) {
  const { task, children } = node
  const [is_collapsed, set_is_collapsed] = useState(false)
  const [is_adding_subtask, set_is_adding_subtask] = useState(false)
  const [subtask_title, set_subtask_title] = useState('')

  function submit_subtask(event: Event): void {
    event.preventDefault()
    const title = subtask_title.trim()
    if (!title) return

    on_add_subtask(task, title)
    set_subtask_title('')
    set_is_collapsed(false)
  }

  function close_subtask_form(): void {
    set_is_adding_subtask(false)
    set_subtask_title('')
  }

  return (
    <li class="task_item">
      <div class={task.is_done ? 'task is_done' : 'task'}>
        {children.length > 0 ? (
          <button
            class="collapse_button"
            onClick={() => set_is_collapsed(!is_collapsed)}
            aria-label={is_collapsed ? 'Expand' : 'Collapse'}
          >
            {is_collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span class="collapse_spacer" />
        )}

        <label>
          <input type="checkbox" checked={task.is_done} onChange={() => on_toggle(task)} />
          <span>{task.title}</span>
        </label>

        {is_collapsed && <span class="subtask_count">{children.length}</span>}

        {can_add_subtasks && (
          <button class="row_button" onClick={() => set_is_adding_subtask(true)} aria-label="Add subtask">
            +
          </button>
        )}
        <button class="remove_button" onClick={() => on_remove(task)} aria-label="Remove">
          ×
        </button>
      </div>

      {!is_collapsed && (children.length > 0 || is_adding_subtask) && (
        <ul class="subtask_list">
          {children.map((child) => (
            <TaskItem
              key={child.task.id}
              node={child}
              can_add_subtasks={can_add_subtasks}
              on_toggle={on_toggle}
              on_remove={on_remove}
              on_add_subtask={on_add_subtask}
            />
          ))}

          {is_adding_subtask && (
            <form class="subtask_form" onSubmit={submit_subtask}>
              <input
                value={subtask_title}
                onInput={(event) => set_subtask_title(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Escape' && close_subtask_form()}
                onBlur={() => !subtask_title.trim() && close_subtask_form()}
                placeholder="Subtask"
                autofocus
              />
            </form>
          )}
        </ul>
      )}
    </li>
  )
}
