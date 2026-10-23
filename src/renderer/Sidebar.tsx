import { useState } from 'preact/hooks'

import type { Tag, Task } from '@shared/tasks'
import {
  BUILT_IN_VIEWS, children_of, drop_placement, is_same_view, subtree_ids, task_is_in_view, type DropPlacement, type View
} from './views'

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  tags: Tag[]
  selected_view: View | null
  is_settings_open: boolean
  dragged_task: Task | null
  on_select_view: (view: View) => void
  on_open_settings: () => void
  on_add_tag: (name: string, parent_id: string | null) => void
  on_remove_tag: (tag: Tag) => void
  on_move_tag: (dragged: Tag, target: Tag, placement: DropPlacement) => void
  on_tag_task: (task: Task, tag: Tag) => void
}

export function Sidebar({
  tasks, tags, selected_view, is_settings_open, dragged_task, on_select_view, on_open_settings, on_add_tag, on_remove_tag,
  on_move_tag, on_tag_task
}: SidebarProps) {
  const [new_tag_name, set_new_tag_name] = useState('')
  const [collapsed_ids, set_collapsed_ids] = useState<Set<string>>(new Set())
  const [sub_tag_parent_id, set_sub_tag_parent_id] = useState<string | null>(null)
  const [new_sub_tag_name, set_new_sub_tag_name] = useState('')
  const [dragged_tag, set_dragged_tag] = useState<Tag | null>(null)
  const [drop_target, set_drop_target] = useState<{ tag_id: string; placement: DropPlacement } | null>(null)

  function open_count(view: View): number {
    return tasks.filter((task) => !task.is_done && task_is_in_view(task, view, tasks, tags)).length
  }

  function submit_new_tag(event: Event): void {
    event.preventDefault()
    const name = new_tag_name.trim()
    if (!name) return

    on_add_tag(name, null)
    set_new_tag_name('')
  }

  // ==========================================================================
  // Sub-tags
  // ==========================================================================

  function toggle_collapsed(tag_id: string): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      if (!next_ids.delete(tag_id)) next_ids.add(tag_id)
      return next_ids
    })
  }

  function start_sub_tag(parent_id: string): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      next_ids.delete(parent_id)
      return next_ids
    })
    set_sub_tag_parent_id(parent_id)
    set_new_sub_tag_name('')
  }

  function stop_sub_tag(): void {
    set_sub_tag_parent_id(null)
    set_new_sub_tag_name('')
  }

  function submit_new_sub_tag(event: Event): void {
    event.preventDefault()
    const name = new_sub_tag_name.trim()
    if (name && sub_tag_parent_id) on_add_tag(name, sub_tag_parent_id)
    stop_sub_tag()
  }

  // ==========================================================================
  // Dragging
  // ==========================================================================

  // A dragged task always drops into the tag; a dragged tag can also land beside it.
  function placement_over(event: DragEvent, tag: Tag): DropPlacement | null {
    if (dragged_task) return 'inside'
    if (!dragged_tag || subtree_ids(dragged_tag.id, tags).has(tag.id)) return null
    return drop_placement(event, true)
  }

  function tag_drag_over(event: DragEvent, tag: Tag): void {
    const placement = placement_over(event, tag)
    if (!placement) return
    event.preventDefault()
    set_drop_target({ tag_id: tag.id, placement })
  }

  function tag_drop(event: DragEvent, tag: Tag): void {
    event.preventDefault()
    const placement = placement_over(event, tag)
    if (dragged_task) on_tag_task(dragged_task, tag)
    else if (dragged_tag && placement) on_move_tag(dragged_tag, tag, placement)
    set_drop_target(null)
  }

  function end_tag_drag(): void {
    set_dragged_tag(null)
    set_drop_target(null)
  }

  // ==========================================================================
  // Rows
  // ==========================================================================

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

  function tag_branch(tag: Tag, depth: number) {
    const children = children_of(tag.id, tags)
    const is_collapsed = collapsed_ids.has(tag.id)
    const row_class = drop_target?.tag_id === tag.id ? `sidebar_tag_row drop_${drop_target.placement}` : 'sidebar_tag_row'

    return (
      <div key={tag.id}>
        <div
          class={row_class}
          style={{ paddingLeft: `${depth * 16}px` }}
          draggable
          onDragStart={(event) => {
            event.stopPropagation()
            event.dataTransfer?.setData('text/plain', tag.id)
            set_dragged_tag(tag)
          }}
          onDragEnd={end_tag_drag}
          onDragOver={(event) => tag_drag_over(event, tag)}
          onDragLeave={() => set_drop_target(null)}
          onDrop={(event) => tag_drop(event, tag)}
        >
          {children.length > 0 ? (
            <button
              class="collapse_button"
              onClick={() => toggle_collapsed(tag.id)}
              aria-label={is_collapsed ? `Expand ${tag.name}` : `Collapse ${tag.name}`}
            >
              {is_collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span class="collapse_spacer" />
          )}
          {view_button({ kind: 'tag', tag_id: tag.id }, tag.name)}
          <button class="row_button" onClick={() => start_sub_tag(tag.id)} aria-label={`Add a tag inside ${tag.name}`}>
            +
          </button>
          <button class="remove_button" onClick={() => on_remove_tag(tag)} aria-label={`Remove ${tag.name}`}>
            ×
          </button>
        </div>

        {!is_collapsed && children.map((child) => tag_branch(child, depth + 1))}

        {sub_tag_parent_id === tag.id && (
          <form class="new_tag_form" style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} onSubmit={submit_new_sub_tag}>
            <input
              value={new_sub_tag_name}
              onInput={(event) => set_new_sub_tag_name(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Escape' && stop_sub_tag()}
              onBlur={stop_sub_tag}
              placeholder={`New tag in ${tag.name}`}
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
        <h2 class="sidebar_heading">Tags</h2>

        {children_of(null, tags).map((tag) => tag_branch(tag, 0))}

        <form class="new_tag_form" onSubmit={submit_new_tag}>
          <input value={new_tag_name} onInput={(event) => set_new_tag_name(event.currentTarget.value)} placeholder="New tag" />
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
