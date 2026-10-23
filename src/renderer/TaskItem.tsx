import { useState } from 'preact/hooks'

import type { TableSortKey } from '@shared/settings'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import type { OpenContextMenu } from './ContextMenu'
import { format_task_date, is_overdue, task_date_label } from './schedule'
import {
  DATE_FILTER_CHOICES, EMPTY_TABLE_FILTERS, NO_TAG_FILTER, group_column, has_table_filters, tags_in_sidebar_order,
  type DateFilter, type TableColumn, type TableFilters
} from './table'
import { drop_placement, is_priority_tag, tag_path, type DropPlacement, type TaskNode } from './views'

// ============================================================================
// Table header
// ============================================================================

interface TaskTableHeaderProps {
  tag_groups: TagGroup[]
  tags: Tag[]
  sort: TableSortKey[]
  on_sort: (column: TableColumn, is_adding: boolean) => void
  filters: TableFilters
  on_filter: (filters: TableFilters) => void
}

// The column names above the rows in the table layout, one per filter group, each sorting the table, with a row of filters under them.
export function TaskTableHeader({ tag_groups, tags, sort, on_sort, filters, on_filter }: TaskTableHeaderProps) {
  // A sorted column shows its direction, and its place in the sort once more than one column is sorted.
  function sort_button(column: TableColumn, label: string, class_name = '') {
    const index = sort.findIndex((key) => key.column === column)
    const key = sort[index]
    return (
      <button
        class={['sort_button', class_name, key && 'is_sorted'].filter(Boolean).join(' ')}
        onClick={(event) => on_sort(column, event.shiftKey)}
        title="Click to sort by this column, Shift+click to add it to the sort"
        aria-sort={key ? (key.is_descending ? 'descending' : 'ascending') : undefined}
      >
        <span class="sort_label">{label}</span>
        {key && <span class="sort_marker">{key.is_descending ? '▼' : '▲'}{sort.length > 1 && <sup>{index + 1}</sup>}</span>}
      </button>
    )
  }

  function set_group_filter(group: TagGroup, tag_id: string): void {
    on_filter({ ...filters, group_tag_ids: { ...filters.group_tag_ids, [group.id]: tag_id } })
  }

  return (
    <>
      <li class="task_table_header">
        {sort_button('title', 'Task', 'title_cell')}
        {sort_button('date', 'Date')}
        {tag_groups.map((group) => <span key={group.id}>{sort_button(group_column(group), group.name)}</span>)}
        <span class="actions_cell" />
      </li>

      <li class="task_table_filters">
        <input
          class="title_cell"
          value={filters.title}
          onInput={(event) => on_filter({ ...filters, title: event.currentTarget.value })}
          onKeyDown={(event) => event.key === 'Escape' && on_filter({ ...filters, title: '' })}
          placeholder="Filter tasks"
          aria-label="Filter by title"
        />
        <select value={filters.date} onChange={(event) => on_filter({ ...filters, date: event.currentTarget.value as DateFilter })} aria-label="Filter by date">
          {DATE_FILTER_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        {tag_groups.map((group) => (
          <select
            key={group.id}
            value={filters.group_tag_ids[group.id] ?? ''}
            onChange={(event) => set_group_filter(group, event.currentTarget.value)}
            aria-label={`Filter by ${group.name}`}
          >
            <option value="">Any</option>
            <option value={NO_TAG_FILTER}>None</option>
            {tags_in_sidebar_order(tags.filter((tag) => tag.group_id === group.id)).map((tag) => (
              <option key={tag.id} value={tag.id}>{tag_path(tag, tags)}</option>
            ))}
          </select>
        ))}
        <span class="actions_cell">
          {has_table_filters(filters) && (
            <button class="row_button" onClick={() => on_filter(EMPTY_TABLE_FILTERS)} aria-label="Clear filters" title="Clear filters">
              ×
            </button>
          )}
        </span>
      </li>
    </>
  )
}

// ============================================================================
// Task item
// ============================================================================

export interface TaskActions {
  tags: Tag[]
  tag_groups: TagGroup[]
  is_table: boolean
  can_add_subtasks: boolean
  selected_task_id: string | null
  on_select: (task: Task) => void
  on_context_menu: OpenContextMenu
  on_toggle: (task: Task) => void
  on_reschedule: (task: Task) => void
  is_in_my_day: (task: Task) => boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_remove: (task: Task) => void
  on_add_subtask: (parent: Task, title: string) => void
  on_untag: (task: Task, tag: Tag) => void
  rule_tags_of: (task: Task) => Tag[]
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

  // The priority gets its own label, apart from the tag chips; rule tags that match join the task's own tags.
  const task_tags = [...actions.tags.filter((tag) => task.tag_ids.includes(tag.id)), ...actions.rule_tags_of(task)]
  const priority_tag = task_tags.find(is_priority_tag)
  const chip_tags = task_tags.filter((tag) => !is_priority_tag(tag))

  // A priority shows as a plain label, a rule tag as a fixed chip, and any other tag as a chip that can be removed from the task.
  function render_tag(tag: Tag) {
    if (tag.rule) {
      return (
        <span key={tag.id} class="tag_chip is_rule" title={`${tag_path(tag, actions.tags)} (rule)`}>
          {tag.name}
        </span>
      )
    }

    if (is_priority_tag(tag)) {
      return (
        <span key={tag.id} class="priority_label" title={`Priority: ${tag_path(tag, actions.tags)}`}>
          {tag.name}
        </span>
      )
    }

    return (
      <span key={tag.id} class="tag_chip" title={tag_path(tag, actions.tags)}>
        {tag.name}
        <button onClick={() => actions.on_untag(task, tag)} aria-label={`Remove tag ${tag.name}`}>
          ×
        </button>
      </span>
    )
  }

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
      actions.is_in_my_day(task)
        ? { label: 'Remove from My Day', on_select: () => actions.on_set_my_day(task, false) }
        : { label: 'Add to My Day', on_select: () => actions.on_set_my_day(task, true) },
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
        <span class="task_cell title_cell">
          <span class="task_title">{task.title}</span>
          {actions.is_in_my_day(task) && <span class="notes_marker" title="In My Day">☀</span>}
          {task.notes && <span class="notes_marker" title="Has notes">≡</span>}
          {task.recurrence && <span class="notes_marker" title="Repeats">↻</span>}
        </span>

        <span class="task_cell date_cell">
          {task.is_done && task.done_at ? (
            <span class="due_label">Done {task_date_label(format_task_date(new Date(task.done_at), false))}</span>
          ) : task.due_at && (
            <span class={!task.is_done && is_overdue(task.due_at) ? 'due_label is_overdue' : 'due_label'}>
              {task_date_label(task.due_at)}
            </span>
          )}
        </span>

        {actions.is_table ? (
          actions.tag_groups.map((group) => (
            <span key={group.id} class="task_cell">
              {task_tags.filter((tag) => tag.group_id === group.id).map(render_tag)}
            </span>
          ))
        ) : (
          <>
            {priority_tag && render_tag(priority_tag)}
            {chip_tags.map(render_tag)}
          </>
        )}

        <span class="task_cell actions_cell">
          {is_collapsed && <span class="subtask_count">{children.length}</span>}

          {actions.can_add_subtasks && (
            <button class="row_button" onClick={() => set_is_adding_subtask(true)} aria-label="Add subtask">
              +
            </button>
          )}
        </span>
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
