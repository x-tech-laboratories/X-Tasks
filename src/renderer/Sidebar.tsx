import { useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'
import { BUILT_IN_VIEWS, is_same_view, task_is_in_view, type View } from './views'

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  task_lists: TaskList[]
  selected_view: View
  on_select_view: (view: View) => void
  on_add_list: (name: string) => void
  on_remove_list: (task_list: TaskList) => void
}

export function Sidebar({ tasks, task_lists, selected_view, on_select_view, on_add_list, on_remove_list }: SidebarProps) {
  const [new_list_name, set_new_list_name] = useState('')

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

  function view_button(view: View, label: string) {
    const count = view.kind === 'completed' ? null : open_count(view)

    return (
      <button
        class={is_same_view(view, selected_view) ? 'sidebar_item is_selected' : 'sidebar_item'}
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
          <div key={task_list.id} class="sidebar_list_row">
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
    </nav>
  )
}
