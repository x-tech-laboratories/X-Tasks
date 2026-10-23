import { useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'
import { BUILT_IN_VIEWS, drop_placement, is_same_view, task_is_in_view, type View } from './views'

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  task_lists: TaskList[]
  selected_view: View | null
  is_settings_open: boolean
  on_select_view: (view: View) => void
  on_open_settings: () => void
  on_add_list: (name: string) => void
  on_remove_list: (task_list: TaskList) => void
  on_move_list: (dragged: TaskList, target: TaskList, placement: 'before' | 'after') => void
}

export function Sidebar({
  tasks, task_lists, selected_view, is_settings_open, on_select_view, on_open_settings, on_add_list, on_remove_list,
  on_move_list
}: SidebarProps) {
  const [new_list_name, set_new_list_name] = useState('')
  const [dragged_list, set_dragged_list] = useState<TaskList | null>(null)
  const [drop_target, set_drop_target] = useState<{ list_id: string; placement: 'before' | 'after' } | null>(null)

  function open_count(view: View): number {
    return tasks.filter((task) => !task.is_done && task_is_in_view(task, view)).length
  }

  function submit_new_list(event: Event): void {
    event.preventDefault()
    const name = new_list_name.trim()
    if (!name) return

    on_add_list(name)
    set_new_list_name('')
  }

  function list_drag_over(event: DragEvent, task_list: TaskList): void {
    if (!dragged_list || dragged_list.id === task_list.id) return
    event.preventDefault()
    set_drop_target({ list_id: task_list.id, placement: drop_placement(event, false) as 'before' | 'after' })
  }

  function list_drop(event: DragEvent, task_list: TaskList): void {
    event.preventDefault()
    if (dragged_list && dragged_list.id !== task_list.id) {
      on_move_list(dragged_list, task_list, drop_placement(event, false) as 'before' | 'after')
    }
    set_drop_target(null)
  }

  function end_list_drag(): void {
    set_dragged_list(null)
    set_drop_target(null)
  }

  function view_button(view: View, label: string) {
    const count = view.kind === 'completed' ? null : open_count(view)

    return (
      <button
        class={selected_view && is_same_view(view, selected_view) ? 'sidebar_item is_selected' : 'sidebar_item'}
        onClick={() => on_select_view(view)}
      >
        <span class="sidebar_label">{label}</span>
        {count ? <span class="sidebar_count">{count}</span> : null}
      </button>
    )
  }

  return (
    <nav class="sidebar">
      <div class="sidebar_brand">X-Tasks</div>

      <section class="sidebar_section">
        {BUILT_IN_VIEWS.map(({ view, label }) => <div key={view.kind}>{view_button(view, label)}</div>)}
      </section>

      <section class="sidebar_section">
        <h2 class="sidebar_heading">Lists</h2>

        {task_lists.map((task_list) => (
          <div
            key={task_list.id}
            class={drop_target?.list_id === task_list.id ? `sidebar_list_row drop_${drop_target.placement}` : 'sidebar_list_row'}
            draggable
            onDragStart={(event) => {
              event.dataTransfer?.setData('text/plain', task_list.id)
              set_dragged_list(task_list)
            }}
            onDragEnd={end_list_drag}
            onDragOver={(event) => list_drag_over(event, task_list)}
            onDragLeave={() => set_drop_target(null)}
            onDrop={(event) => list_drop(event, task_list)}
          >
            {view_button({ kind: 'list', list_id: task_list.id }, task_list.name)}
            <button class="remove_button" onClick={() => on_remove_list(task_list)} aria-label={`Remove ${task_list.name}`}>
              ×
            </button>
          </div>
        ))}

        <form class="new_list_form" onSubmit={submit_new_list}>
          <input
            value={new_list_name}
            onInput={(event) => set_new_list_name(event.currentTarget.value)}
            placeholder="New list"
          />
        </form>
      </section>

      <section class="sidebar_section sidebar_footer">
        <button class={is_settings_open ? 'sidebar_item is_selected' : 'sidebar_item'} onClick={on_open_settings}>
          <span class="sidebar_label">Settings</span>
        </button>
      </section>
    </nav>
  )
}
