import { useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'
import { BUILT_IN_VIEWS, child_lists, is_same_view, task_is_in_view, type View } from './views'

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  task_lists: TaskList[]
  selected_view: View
  on_select_view: (view: View) => void
  on_add_list: (name: string, parent_id: string | null) => void
  on_remove_list: (task_list: TaskList) => void
}

export function Sidebar({ tasks, task_lists, selected_view, on_select_view, on_add_list, on_remove_list }: SidebarProps) {
  const [new_list_name, set_new_list_name] = useState('')
  const [collapsed_ids, set_collapsed_ids] = useState<Set<string>>(new Set())
  const [sub_list_parent_id, set_sub_list_parent_id] = useState<string | null>(null)
  const [new_sub_list_name, set_new_sub_list_name] = useState('')

  function open_count(view: View): number {
    return tasks.filter((task) => !task.is_done && task_is_in_view(task, view, task_lists)).length
  }

  function submit_new_list(event: Event): void {
    event.preventDefault()
    const name = new_list_name.trim()
    if (!name) return

    on_add_list(name, null)
    set_new_list_name('')
  }

  // ==========================================================================
  // Sub-lists
  // ==========================================================================

  function toggle_collapsed(list_id: string): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      if (!next_ids.delete(list_id)) next_ids.add(list_id)
      return next_ids
    })
  }

  function start_sub_list(parent_id: string): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      next_ids.delete(parent_id)
      return next_ids
    })
    set_sub_list_parent_id(parent_id)
    set_new_sub_list_name('')
  }

  function stop_sub_list(): void {
    set_sub_list_parent_id(null)
    set_new_sub_list_name('')
  }

  function submit_new_sub_list(event: Event): void {
    event.preventDefault()
    const name = new_sub_list_name.trim()
    if (name && sub_list_parent_id) on_add_list(name, sub_list_parent_id)
    stop_sub_list()
  }

  // ==========================================================================
  // Rows
  // ==========================================================================

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

  function list_branch(task_list: TaskList, depth: number) {
    const children = child_lists(task_list.id, task_lists)
    const is_collapsed = collapsed_ids.has(task_list.id)

    return (
      <div key={task_list.id}>
        <div class="sidebar_list_row" style={{ paddingLeft: `${depth * 16}px` }}>
          {children.length > 0 ? (
            <button
              class="collapse_button"
              onClick={() => toggle_collapsed(task_list.id)}
              aria-label={is_collapsed ? `Expand ${task_list.name}` : `Collapse ${task_list.name}`}
            >
              {is_collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span class="collapse_spacer" />
          )}
          {view_button({ kind: 'list', list_id: task_list.id }, task_list.name)}
          <button class="row_button" onClick={() => start_sub_list(task_list.id)} aria-label={`Add a list inside ${task_list.name}`}>
            +
          </button>
          <button class="remove_button" onClick={() => on_remove_list(task_list)} aria-label={`Remove ${task_list.name}`}>
            ×
          </button>
        </div>

        {!is_collapsed && children.map((child) => list_branch(child, depth + 1))}

        {sub_list_parent_id === task_list.id && (
          <form class="new_list_form" style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} onSubmit={submit_new_sub_list}>
            <input
              value={new_sub_list_name}
              onInput={(event) => set_new_sub_list_name(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Escape' && stop_sub_list()}
              onBlur={stop_sub_list}
              placeholder={`New list in ${task_list.name}`}
              autofocus
            />
          </form>
        )}
      </div>
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

        {child_lists(null, task_lists).map((task_list) => list_branch(task_list, 0))}

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
