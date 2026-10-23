import { useState } from 'preact/hooks'

import type { Tag, TagGroup, Task } from '@shared/tasks'
import type { OpenContextMenu } from './ContextMenu'
import {
  BUILT_IN_VIEWS, children_of, drop_placement, drop_side, is_same_view, is_tag_selected, subtree_ids, task_is_in_view, type DropPlacement,
  type SidePlacement, type View
} from './views'

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  tag_groups: TagGroup[]
  tags: Tag[]
  // The earliest day whose My Day tasks still count.
  my_day_since: string
  selected_view: View | null
  is_settings_open: boolean
  dragged_task: Task | null
  on_select_view: (view: View) => void
  on_toggle_tag: (tag: Tag) => void
  on_open_settings: () => void
  on_remove_tag_group: (group: TagGroup) => void
  on_set_tag_group_single_choice: (group: TagGroup, is_single_choice: boolean) => void
  on_move_tag_group: (dragged: TagGroup, target: TagGroup, placement: SidePlacement) => void
  on_add_tag: (name: string, group_id: string, parent_id: string | null) => void
  on_remove_tag: (tag: Tag) => void
  on_move_tag: (dragged: Tag, target: Tag, placement: DropPlacement) => void
  on_tag_task: (task: Task, tag: Tag) => void
  on_context_menu: OpenContextMenu
}

// Points right when closed and turns down when open.
function Chevron({ is_open }: { is_open: boolean }) {
  return (
    <svg class={is_open ? 'chevron is_open' : 'chevron'} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  )
}

// Where the inline new-tag field is open: at the top of a group, or inside a tag.
interface NewTagSpot {
  group_id: string
  parent_id: string | null
}

export function Sidebar({
  tasks, tag_groups, tags, my_day_since, selected_view, is_settings_open, dragged_task, on_select_view, on_toggle_tag, on_open_settings,
  on_remove_tag_group, on_set_tag_group_single_choice, on_move_tag_group, on_add_tag, on_remove_tag, on_move_tag, on_tag_task, on_context_menu
}: SidebarProps) {
  const [collapsed_ids, set_collapsed_ids] = useState<Set<string>>(new Set())
  const [new_tag_spot, set_new_tag_spot] = useState<NewTagSpot | null>(null)
  const [new_tag_name, set_new_tag_name] = useState('')
  const [dragged_tag, set_dragged_tag] = useState<Tag | null>(null)
  const [drop_target, set_drop_target] = useState<{ tag_id: string; placement: DropPlacement } | null>(null)
  const [dragged_group, set_dragged_group] = useState<TagGroup | null>(null)
  const [group_drop_target, set_group_drop_target] = useState<{ group_id: string; placement: SidePlacement } | null>(null)

  function open_count(view: View): number {
    return tasks.filter((task) => !task.is_done && task_is_in_view(task, view, tasks, tags, my_day_since)).length
  }

  // ==========================================================================
  // New tags
  // ==========================================================================

  function toggle_collapsed(id: string): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      if (!next_ids.delete(id)) next_ids.add(id)
      return next_ids
    })
  }

  // The group or tag being added to opens up so the new tag shows.
  function start_new_tag(spot: NewTagSpot): void {
    set_collapsed_ids((current_ids) => {
      const next_ids = new Set(current_ids)
      next_ids.delete(spot.parent_id ?? spot.group_id)
      return next_ids
    })
    set_new_tag_spot(spot)
    set_new_tag_name('')
  }

  function stop_new_tag(): void {
    set_new_tag_spot(null)
    set_new_tag_name('')
  }

  function submit_new_tag(event: Event): void {
    event.preventDefault()
    const name = new_tag_name.trim()
    if (name && new_tag_spot) on_add_tag(name, new_tag_spot.group_id, new_tag_spot.parent_id)
    stop_new_tag()
  }

  function new_tag_form(spot: NewTagSpot, depth: number, placeholder: string) {
    if (new_tag_spot?.group_id !== spot.group_id || new_tag_spot.parent_id !== spot.parent_id) return null

    return (
      <form class="new_tag_form" style={{ paddingLeft: `${depth * 16 + 24}px` }} onSubmit={submit_new_tag}>
        <input
          value={new_tag_name}
          onInput={(event) => set_new_tag_name(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Escape' && stop_new_tag()}
          onBlur={stop_new_tag}
          placeholder={placeholder}
          autofocus
        />
      </form>
    )
  }

  // ==========================================================================
  // Dragging
  // ==========================================================================

  // A dragged task always drops into the tag; a dragged tag can land beside or inside one of its own group.
  function placement_over(event: DragEvent, tag: Tag): DropPlacement | null {
    if (dragged_task) return 'inside'
    if (!dragged_tag || dragged_tag.group_id !== tag.group_id || subtree_ids(dragged_tag.id, tags).has(tag.id)) return null
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

  // A dragged group lands above or below another whole group, tags and all.
  function group_drag_over(event: DragEvent, group: TagGroup): void {
    if (!dragged_group || dragged_group.id === group.id) return
    event.preventDefault()
    set_group_drop_target({ group_id: group.id, placement: drop_side(event) })
  }

  function group_drop(event: DragEvent, group: TagGroup): void {
    if (!dragged_group) return
    event.preventDefault()
    if (dragged_group.id !== group.id) on_move_tag_group(dragged_group, group, drop_side(event))
    set_group_drop_target(null)
  }

  function end_group_drag(): void {
    set_dragged_group(null)
    set_group_drop_target(null)
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

  function tag_branch(tag: Tag, depth: number, group_tags: Tag[]) {
    const children = children_of(tag.id, group_tags)
    const is_collapsed = collapsed_ids.has(tag.id)
    const view: View = { kind: 'tag', tag_ids: [tag.id] }
    const count = open_count(view)
    const row_class = [
      'sidebar_item sidebar_tag_row',
      is_tag_selected(selected_view, tag.id) && 'is_selected',
      drop_target?.tag_id === tag.id && `drop_${drop_target.placement}`
    ].filter(Boolean).join(' ')

    return (
      <div key={tag.id}>
        <div
          class={row_class}
          style={{ marginLeft: `${depth * 16}px` }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer?.setData('text/plain', tag.id)
            set_dragged_tag(tag)
          }}
          onDragEnd={end_tag_drag}
          onDragOver={(event) => tag_drag_over(event, tag)}
          onDragLeave={() => set_drop_target(null)}
          onDrop={(event) => tag_drop(event, tag)}
          onContextMenu={(event) =>
            on_context_menu(event, [
              { label: 'Add tag inside', on_select: () => start_new_tag({ group_id: tag.group_id, parent_id: tag.id }) },
              { label: 'Delete tag', on_select: () => on_remove_tag(tag), is_danger: true }
            ])
          }
        >
          {children.length > 0 ? (
            <button
              class="collapse_button"
              onClick={() => toggle_collapsed(tag.id)}
              aria-label={is_collapsed ? `Expand ${tag.name}` : `Collapse ${tag.name}`}
            >
              <Chevron is_open={!is_collapsed} />
            </button>
          ) : (
            <span class="collapse_spacer" />
          )}
          <button class="sidebar_tag_select" onClick={() => on_toggle_tag(tag)}>
            <span class="sidebar_label">{tag.name}</span>
            {count ? <span class="sidebar_count">{count}</span> : null}
          </button>
          <button
            class="row_button"
            onClick={() => start_new_tag({ group_id: tag.group_id, parent_id: tag.id })}
            aria-label={`Add a tag inside ${tag.name}`}
          >
            +
          </button>
        </div>

        {!is_collapsed && children.map((child) => tag_branch(child, depth + 1, group_tags))}
        {new_tag_form({ group_id: tag.group_id, parent_id: tag.id }, depth + 1, `New tag in ${tag.name}`)}
      </div>
    )
  }

  function group_section(group: TagGroup) {
    const group_tags = tags.filter((tag) => tag.group_id === group.id)
    const is_collapsed = collapsed_ids.has(group.id)
    const index = tag_groups.findIndex((each) => each.id === group.id)
    const group_above = tag_groups[index - 1]
    const group_below = tag_groups[index + 1]
    const section_class = [
      'sidebar_section',
      group_drop_target?.group_id === group.id && `drop_${group_drop_target.placement}`
    ].filter(Boolean).join(' ')

    return (
      <section
        key={group.id}
        class={section_class}
        onDragOver={(event) => group_drag_over(event, group)}
        onDragLeave={() => set_group_drop_target(null)}
        onDrop={(event) => group_drop(event, group)}
      >
        <div
          class="sidebar_group_header"
          draggable
          onDragStart={(event) => {
            event.dataTransfer?.setData('text/plain', group.id)
            set_dragged_group(group)
          }}
          onDragEnd={end_group_drag}
          onContextMenu={(event) =>
            on_context_menu(event, [
              { label: 'Add tag', on_select: () => start_new_tag({ group_id: group.id, parent_id: null }) },
              ...(group_above ? [{ label: 'Move up', on_select: () => on_move_tag_group(group, group_above, 'before') }] : []),
              ...(group_below ? [{ label: 'Move down', on_select: () => on_move_tag_group(group, group_below, 'after') }] : []),
              {
                label: group.is_single_choice ? 'Allow several tags per task' : 'Allow one tag per task',
                on_select: () => on_set_tag_group_single_choice(group, !group.is_single_choice)
              },
              { label: 'Delete group', on_select: () => on_remove_tag_group(group), is_danger: true }
            ])
          }
        >
          <button
            class="sidebar_heading sidebar_group_toggle"
            onClick={() => toggle_collapsed(group.id)}
            aria-expanded={!is_collapsed}
          >
            <Chevron is_open={!is_collapsed} />
            {group.name}
          </button>
          <button
            class="row_button"
            onClick={() => start_new_tag({ group_id: group.id, parent_id: null })}
            aria-label={`Add a tag to ${group.name}`}
          >
            +
          </button>
        </div>

        {!is_collapsed && children_of(null, group_tags).map((tag) => tag_branch(tag, 0, group_tags))}
        {new_tag_form({ group_id: group.id, parent_id: null }, 0, `New tag in ${group.name}`)}
      </section>
    )
  }

  return (
    <nav class="sidebar">
      <div class="sidebar_brand">X-Tasks</div>

      <section class="sidebar_section">
        {BUILT_IN_VIEWS.map(({ view, label }) => <div key={view.kind}>{view_button(view, label)}</div>)}
      </section>

      {tag_groups.map(group_section)}

      <section class="sidebar_section sidebar_footer">
        <button class={is_settings_open ? 'sidebar_item is_selected' : 'sidebar_item'} onClick={on_open_settings}>
          <span class="sidebar_label">Settings</span>
        </button>
      </section>
    </nav>
  )
}
