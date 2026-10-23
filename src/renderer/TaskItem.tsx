import { useState } from 'preact/hooks'

import type { Tag, Task } from '@shared/tasks'
import type { OpenContextMenu } from './ContextMenu'
import { is_overdue, task_date_label } from './schedule'
import { drop_placement, is_priority_tag, tag_path, type DropPlacement, type TaskNode } from './views'

// ============================================================================
// Task item
// ============================================================================

export interface TaskActions {
  tags: Tag[]
  can_add_subtasks: boolean
  selected_task_id: string | null
  on_select: (task: Task) => void
  on_context_menu: OpenContextMenu
  on_toggle: (task: Task) => void
  on_reschedule: (task: Task) => void
  on_remove: (task: Task) => void
  on_add_subtask: (parent: Task, title: string) => void
  on_untag: (task: Task, tag: Tag) => void
  on_drag_start: (task: Task) => void
  on_drag_end: () => void
  can_drop_on: (target: Task) => boolean
  on_drop: (target: Task, placement: DropPlacement) => void
}

interface TaskItemProps {
  node: TaskNode
  actions: TaskActions
}

export function TaskItem({ node, actions }: TaskItemProps) {
  const { task, children } = node
  const [is_collapsed, set_is_collapsed] = useState(false)
  const [is_adding_subtask, set_is_adding_subtask] = useState(false)
  const [subtask_title, set_subtask_title] = useState('')
  const [shown_placement, set_shown_placement] = useState<DropPlacement | null>(null)

  // The priority gets its own label, apart from the tag chips.
  const task_tags = actions.tags.filter((tag) => task.tag_ids.includes(tag.id))
  const priority_tag = task_tags.find(is_priority_tag)
  const chip_tags = task_tags.filter((tag) => !is_priority_tag(tag))

  function submit_subtask(event: Event): void {
    event.preventDefault()
    const title = subtask_title.trim()
    if (!title) return

    actions.on_add_subtask(task, title)
    set_subtask_title('')
    set_is_collapsed(false)
  }

  function close_subtask_form(): void {
    set_is_adding_subtask(false)
    set_subtask_title('')
  }

  // ==========================================================================
  // Dragging
  // ==========================================================================

  function start_drag(event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', task.id)
    actions.on_drag_start(task)
  }

  function drag_over(event: DragEvent): void {
    if (!actions.can_drop_on(task)) return
    event.preventDefault()
    set_shown_placement(drop_placement(event, true))
  }

  function drop(event: DragEvent): void {
    event.preventDefault()
    set_shown_placement(null)
    actions.on_drop(task, drop_placement(event, true))
  }

  // A click on the row opens its details, except on the checkbox and buttons, which do their own thing.
  function click_row(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('input, button')) actions.on_select(task)
  }

  function open_menu(event: MouseEvent): void {
    actions.on_context_menu(event, [
      { label: 'Open details', on_select: () => actions.on_select(task) },
      ...(actions.can_add_subtasks ? [{ label: 'Add subtask', on_select: () => set_is_adding_subtask(true) }] : []),
      { label: task.is_done ? 'Mark as not done' : 'Mark as done', on_select: () => actions.on_toggle(task) },
      { label: 'Reschedule…', on_select: () => actions.on_reschedule(task) },
      { label: 'Delete', on_select: () => actions.on_remove(task), is_danger: true }
    ])
  }

  const is_selected = actions.selected_task_id === task.id
  const row_class = ['task', task.is_done && 'is_done', is_selected && 'is_selected', shown_placement && `drop_${shown_placement}`].filter(Boolean).join(' ')

  return (
    <li class="task_item">
      <div
        class={row_class}
        draggable
        onClick={click_row}
        onContextMenu={open_menu}
        onDragStart={start_drag}
        onDragEnd={actions.on_drag_end}
        onDragOver={drag_over}
        onDragLeave={() => set_shown_placement(null)}
        onDrop={drop}
      >
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

        <input
          type="checkbox"
          checked={task.is_done}
          onChange={() => actions.on_toggle(task)}
          aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'}
        />
        <span class="task_title">{task.title}</span>
        {task.notes && <span class="notes_marker" title="Has notes">≡</span>}
        {task.recurrence && <span class="notes_marker" title="Repeats">↻</span>}
        {task.due_at && (
          <span class={!task.is_done && is_overdue(task.due_at) ? 'due_label is_overdue' : 'due_label'}>
            {task_date_label(task.due_at)}
          </span>
        )}

        {priority_tag && (
          <span class="priority_label" title={`Priority: ${tag_path(priority_tag, actions.tags)}`}>
            {priority_tag.name}
          </span>
        )}

        {chip_tags.map((tag) => (
          <span key={tag.id} class="tag_chip" title={tag_path(tag, actions.tags)}>
            {tag.name}
            <button onClick={() => actions.on_untag(task, tag)} aria-label={`Remove tag ${tag.name}`}>
              ×
            </button>
          </span>
        ))}

        {is_collapsed && <span class="subtask_count">{children.length}</span>}

        {actions.can_add_subtasks && (
          <button class="row_button" onClick={() => set_is_adding_subtask(true)} aria-label="Add subtask">
            +
          </button>
        )}
      </div>

      {!is_collapsed && (children.length > 0 || is_adding_subtask) && (
        <ul class="subtask_list">
          {children.map((child) => (
            <TaskItem key={child.task.id} node={child} actions={actions} />
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
