import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

import type { TableSortKey, TaskDateField } from '@shared/settings'
import type { HistoryMark, RoutineStreak } from '@shared/streaks'
import { task_link, type Tag, type TagGroup, type Task } from '@shared/tasks'
import type { OpenContextMenu } from './ContextMenu'
import { StreakStrip } from './StreakStrip'
import { ResizeHandle } from './ResizeHandle'
import { is_overdue, task_date_label } from '@shared/schedule'
import {
  COLUMN_WIDTH_RANGE, EMPTY_TABLE_FILTERS, NO_TAG_FILTER, STREAK_FILTER_CHOICES, column_date, column_width, date_filter_choices, default_column_width, group_column,
  has_table_filters, is_column_filtered, is_date_column, tags_in_sidebar_order, type DateColumn, type LastDoneOf, type TableColumn, type TableFilters
} from './table'
import type { RepeatOccurrence } from './dates'
import { drop_placement, tag_color_style, tag_path, with_icon, type DropPlacement, type TaskNode } from './views'

// A row's strip shows about a week of a daily routine.
const ROW_STRIP_LENGTH = 7

// ============================================================================
// Table header
// ============================================================================

interface TaskTableHeaderProps {
  tag_groups: TagGroup[]
  tags: Tag[]
  // Every column after the title in its order, and the ones of them shown.
  column_order: TableColumn[]
  shown_columns: TableColumn[]
  on_move_column: (column: TableColumn, target: TableColumn, is_after: boolean) => void
  on_show_column: (column: TableColumn, is_shown: boolean) => void
  column_widths: Record<string, number>
  // Called as a column's edge is dragged, then once with the width it was let go at.
  on_resize_column: (column: TableColumn, width: number) => void
  on_resize_column_end: (column: TableColumn, width: number) => void
  sort: TableSortKey[]
  on_sort: (column: TableColumn, is_adding: boolean) => void
  filters: TableFilters
  on_filter: (filters: TableFilters) => void
}

// Where a popover hangs from, in window coordinates.
interface PopoverPoint {
  x: number
  y: number
}

// The open filter popover: the column it belongs to and the corner of its icon it hangs from.
interface OpenFilter extends PopoverPoint {
  column: TableColumn
}

// The column names above the rows in the table layout; each sorts the table, its funnel icon filters it, and dragging it moves the column.
export function TaskTableHeader({
  tag_groups, tags, column_order, shown_columns, on_move_column, on_show_column, column_widths, on_resize_column, on_resize_column_end,
  sort, on_sort, filters, on_filter
}: TaskTableHeaderProps) {
  const [open_filter, set_open_filter] = useState<OpenFilter | null>(null)
  const close_filter = useCallback(() => set_open_filter(null), [])
  const [columns_menu, set_columns_menu] = useState<PopoverPoint | null>(null)
  const close_columns_menu = useCallback(() => set_columns_menu(null), [])
  const [dragged_column, set_dragged_column] = useState<TableColumn | null>(null)
  const [drop_target, set_drop_target] = useState<{ column: TableColumn; is_after: boolean } | null>(null)

  function column_label(column: TableColumn): string {
    if (column === 'title') return 'Task'
    if (column === 'date') return 'Date'
    if (column === 'start') return 'Start'
    if (column === 'due') return 'Due'
    if (column === 'done') return 'Done'
    if (column === 'streak') return 'Streak'
    return tag_groups.find((group) => group_column(group) === column)?.name ?? ''
  }

  function open_columns_menu(event: MouseEvent): void {
    event.preventDefault()
    if (event.type === 'click') {
      const button = (event.currentTarget as HTMLElement).getBoundingClientRect()
      set_columns_menu({ x: button.right, y: button.bottom + 4 })
    } else {
      set_columns_menu({ x: event.clientX, y: event.clientY })
    }
  }

  // ==========================================================================
  // Moving columns
  // ==========================================================================

  // A column dropped on the left half of another goes before it, and on the right half after it.
  function drag_over_column(column: TableColumn, event: DragEvent): void {
    if (!dragged_column || column === 'title') return
    event.preventDefault()
    const cell = (event.currentTarget as HTMLElement).getBoundingClientRect()
    set_drop_target({ column, is_after: event.clientX > cell.left + cell.width / 2 })
  }

  function drop_column(event: DragEvent): void {
    event.preventDefault()
    if (dragged_column && drop_target && dragged_column !== drop_target.column) {
      on_move_column(dragged_column, drop_target.column, drop_target.is_after)
    }
    end_column_drag()
  }

  function end_column_drag(): void {
    set_dragged_column(null)
    set_drop_target(null)
  }

  function toggle_filter(column: TableColumn, event: MouseEvent): void {
    if (open_filter?.column === column) return set_open_filter(null)
    const icon = (event.currentTarget as HTMLElement).getBoundingClientRect()
    set_open_filter({ column, x: icon.left, y: icon.bottom + 4 })
  }

  // A sorted column shows its direction, and its place in the sort once more than one column is sorted.
  function header_cell(column: TableColumn, class_name = '') {
    const label = column_label(column)
    const index = sort.findIndex((key) => key.column === column)
    const key = sort[index]
    const is_filtered = is_column_filtered(filters, column)
    const is_movable = column !== 'title'
    const cell_class = [
      'header_cell', class_name, is_filtered && 'is_filtered', open_filter?.column === column && 'is_filter_open',
      dragged_column === column && 'is_dragged', drop_target?.column === column && (drop_target.is_after ? 'drop_after' : 'drop_before')
    ].filter(Boolean).join(' ')
    return (
      <span
        key={column}
        class={cell_class}
        draggable={is_movable}
        onDragStart={(event) => {
          event.dataTransfer?.setData('text/plain', column)
          set_dragged_column(column)
        }}
        onDragEnd={end_column_drag}
        onDragOver={(event) => drag_over_column(column, event)}
        onDragLeave={() => set_drop_target(null)}
        onDrop={drop_column}
        title={is_movable ? 'Drag to move this column' : undefined}
      >
        <button
          class={key ? 'sort_button is_sorted' : 'sort_button'}
          onClick={(event) => on_sort(column, event.shiftKey)}
          title="Click to sort by this column, Shift+click to add it to the sort"
          aria-sort={key ? (key.is_descending ? 'descending' : 'ascending') : undefined}
        >
          <span class="sort_label">{label}</span>
          {key && <span class="sort_marker">{key.is_descending ? '▼' : '▲'}{sort.length > 1 && <sup>{index + 1}</sup>}</span>}
        </button>
        <button
          class="filter_button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => toggle_filter(column, event)}
          aria-label={`Filter by ${label}`}
          title={is_filtered ? `Filtered by ${label}` : `Filter by ${label}`}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6z" />
          </svg>
        </button>
        {is_movable && (
          <ResizeHandle
            side="left"
            width={column_width(column_widths, column)}
            min_width={COLUMN_WIDTH_RANGE.min}
            max_width={COLUMN_WIDTH_RANGE.max}
            default_width={default_column_width(column)}
            on_resize={(width) => on_resize_column(column, width)}
            on_resize_end={(width) => on_resize_column_end(column, width)}
            label={`Resize the ${label} column`}
            class_name="column_resizer"
          />
        )}
      </span>
    )
  }

  // The title filters by typed text; the date and each group pick one choice from a list.
  function filter_popover(open: OpenFilter) {
    if (open.column === 'title') {
      return (
        <FilterPopover open={open} on_close={close_filter}>
          <input
            value={filters.title}
            onInput={(event) => on_filter({ ...filters, title: event.currentTarget.value })}
            onKeyDown={(event) => event.key === 'Enter' && close_filter()}
            placeholder="Title contains"
            aria-label="Filter by title"
          />
        </FilterPopover>
      )
    }

    if (is_date_column(open.column)) {
      const column = open.column
      const chosen = filters.dates[column] ?? 'any'
      return (
        <FilterPopover open={open} on_close={close_filter}>
          {date_filter_choices(column).map(({ value, label }) =>
            filter_choice(label, chosen === value, () => on_filter({ ...filters, dates: { ...filters.dates, [column]: value } }))
          )}
        </FilterPopover>
      )
    }

    if (open.column === 'streak') {
      return (
        <FilterPopover open={open} on_close={close_filter}>
          {STREAK_FILTER_CHOICES.map(({ value, label }) => filter_choice(label, filters.streak === value, () => on_filter({ ...filters, streak: value })))}
        </FilterPopover>
      )
    }

    const group_id = open.column.slice('group:'.length)
    const chosen_id = filters.group_tag_ids[group_id] ?? ''
    const choose = (tag_id: string) => on_filter({ ...filters, group_tag_ids: { ...filters.group_tag_ids, [group_id]: tag_id } })
    return (
      <FilterPopover open={open} on_close={close_filter}>
        {filter_choice('Any', chosen_id === '', () => choose(''))}
        {filter_choice('None', chosen_id === NO_TAG_FILTER, () => choose(NO_TAG_FILTER))}
        {tags_in_sidebar_order(tags.filter((tag) => tag.group_id === group_id)).map((tag) =>
          filter_choice(tag_path(tag, tags), chosen_id === tag.id, () => choose(tag.id))
        )}
      </FilterPopover>
    )
  }

  function filter_choice(label: string, is_chosen: boolean, on_choose: () => void) {
    return (
      <button
        key={label}
        class={is_chosen ? 'context_menu_item is_chosen' : 'context_menu_item'}
        role="menuitemradio"
        aria-checked={is_chosen}
        onClick={() => {
          on_choose()
          close_filter()
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <li class="task_table_header" onContextMenu={open_columns_menu}>
      {header_cell('title', 'title_cell')}
      {shown_columns.map((column) => header_cell(column))}
      <span class="actions_cell">
        {has_table_filters(filters) && (
          <button class="clear_filters_button" onClick={() => on_filter(EMPTY_TABLE_FILTERS)} title="Clear filters">
            Clear
          </button>
        )}
        <button
          class="filter_button columns_button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => (columns_menu ? close_columns_menu() : open_columns_menu(event))}
          aria-label="Show or hide columns"
          title="Show or hide columns"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M2 2h3v12H2zm4.5 0h3v12h-3zM11 2h3v12h-3z" />
          </svg>
        </button>
      </span>
      {open_filter && filter_popover(open_filter)}
      {columns_menu && (
        <FilterPopover open={columns_menu} on_close={close_columns_menu}>
          <label class="context_menu_item columns_choice is_fixed">
            <input type="checkbox" checked disabled />
            Task
          </label>
          {column_order.map((column) => (
            <label key={column} class="context_menu_item columns_choice">
              <input
                type="checkbox"
                checked={shown_columns.includes(column)}
                onChange={(event) => on_show_column(column, event.currentTarget.checked)}
              />
              {column_label(column)}
            </label>
          ))}
        </FilterPopover>
      )}
    </li>
  )
}

interface FilterPopoverProps {
  open: PopoverPoint
  on_close: () => void
  children: ComponentChildren
}

// Hangs below a column's funnel icon, or wherever it was opened, and closes on any click outside it, Escape, scrolling or the window losing focus.
function FilterPopover({ open, on_close, children }: FilterPopoverProps) {
  const popover_element = useRef<HTMLDivElement>(null)
  const [position, set_position] = useState({ left: open.x, top: open.y })

  // Shifts the popover back on screen when it would spill past the right or bottom edge.
  useLayoutEffect(() => {
    const size = popover_element.current!.getBoundingClientRect()
    set_position({
      left: Math.min(open.x, window.innerWidth - size.width - 4),
      top: Math.min(open.y, window.innerHeight - size.height - 4)
    })
  }, [open])

  // A text filter is ready to type into as soon as it opens.
  useEffect(() => popover_element.current?.querySelector('input')?.focus(), [])

  useEffect(() => {
    function close_on_outside_press(event: MouseEvent): void {
      if (!popover_element.current?.contains(event.target as Node)) on_close()
    }
    function close_on_escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') on_close()
    }

    window.addEventListener('mousedown', close_on_outside_press)
    window.addEventListener('keydown', close_on_escape)
    window.addEventListener('blur', on_close)
    window.addEventListener('scroll', on_close, true)
    return () => {
      window.removeEventListener('mousedown', close_on_outside_press)
      window.removeEventListener('keydown', close_on_escape)
      window.removeEventListener('blur', on_close)
      window.removeEventListener('scroll', on_close, true)
    }
  }, [on_close])

  return (
    <div ref={popover_element} class="context_menu filter_popover" role="menu" style={{ left: `${position.left}px`, top: `${position.top}px` }}>
      {children}
    </div>
  )
}

// ============================================================================
// Task item
// ============================================================================

export interface TaskActions {
  tags: Tag[]
  tag_groups: TagGroup[]
  is_table: boolean
  // Whether rows take a shade of their first coloured tag.
  tint_rows: boolean
  // The table columns shown after the title, in order.
  table_columns: TableColumn[]
  date_field: TaskDateField
  can_add_subtasks: boolean
  selected_task_id: string | null
  on_select: (task: Task) => void
  // While any task is picked for a bulk action, a plain click on a row picks or unpicks it instead of opening it.
  is_picking: boolean
  is_picked: (task: Task) => boolean
  // Picks or unpicks a row; a Ctrl+click also picks the task whose details are open, so they become a selection of two.
  on_pick: (task: Task, with_open_task?: boolean) => void
  // Picks every row from the last one picked or opened down or up to this one.
  on_pick_range: (task: Task) => void
  // The menu of bulk actions for every picked task, opened from any picked row.
  on_bulk_menu: (event: MouseEvent) => void
  on_context_menu: OpenContextMenu
  on_toggle: (task: Task) => void
  on_reschedule: (task: Task) => void
  is_in_my_day: (task: Task) => boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_remove: (task: Task) => void
  on_add_subtask: (parent: Task, title: string) => void
  is_collapsed: (task: Task) => boolean
  on_set_collapsed: (task: Task, is_collapsed: boolean) => void
  on_untag: (task: Task, tag: Tag) => void
  rule_tags_of: (task: Task) => Tag[]
  // The run of on-time ticks of a repeating task; empty for one that does not repeat.
  streak_of: (task: Task) => RoutineStreak | null
  // The latest occurrences or rounds a row shows as dots; empty when the row shows none.
  history_of: (task: Task) => HistoryMark[]
  last_done_of: LastDoneOf
  on_drag_start: (task: Task) => void
  on_drag_end: () => void
  can_drop_on: (target: Task) => boolean
  // False in a sorted table, where a drop on a row can only nest the task inside it.
  can_drop_beside: boolean
  on_drop: (target: Task, placement: DropPlacement) => void
}

interface TaskItemProps {
  node: TaskNode
  actions: TaskActions
}

export function TaskItem({ node, actions }: TaskItemProps) {
  const { task, children } = node
  const streak = actions.streak_of(task)
  const row_history = actions.history_of(task)
  const is_collapsed = actions.is_collapsed(task)
  const [is_adding_subtask, set_is_adding_subtask] = useState(false)
  const [subtask_title, set_subtask_title] = useState('')
  const [shown_placement, set_shown_placement] = useState<DropPlacement | null>(null)

  // Rule tags that match join the task's own tags.
  const task_tags = [...actions.tags.filter((tag) => task.tag_ids.includes(tag.id)), ...actions.rule_tags_of(task)]
  const tint_tag = actions.tint_rows ? task_tags.find((tag) => tag.color) : undefined

  // A rule tag shows as a fixed chip, and any other tag as a chip that can be removed from the task.
  function render_tag(tag: Tag, label: string = tag.name) {
    if (tag.rule) {
      return (
        <span key={tag.id} class={tag.color ? 'tag_chip is_rule has_color' : 'tag_chip is_rule'} style={tag_color_style(tag)} title={`${tag_path(tag, actions.tags)} (rule)`}>
          {with_icon(tag, label)}
        </span>
      )
    }

    return (
      <span key={tag.id} class={tag.color ? 'tag_chip has_color' : 'tag_chip'} style={tag_color_style(tag)} title={tag_path(tag, actions.tags)}>
        {with_icon(tag, label)}
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
    if (is_collapsed) actions.on_set_collapsed(task, false)
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

  function placement_at(event: DragEvent): DropPlacement {
    return actions.can_drop_beside ? drop_placement(event, true) : 'inside'
  }

  function drag_over(event: DragEvent): void {
    if (!actions.can_drop_on(task)) return
    event.preventDefault()
    set_shown_placement(placement_at(event))
  }

  function drop(event: DragEvent): void {
    event.preventDefault()
    set_shown_placement(null)
    actions.on_drop(task, placement_at(event))
  }

  // A click on the row opens its details, or picks it with Ctrl, Shift or a bulk selection under way; the checkbox and buttons do their own thing.
  function click_row(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('input, button')) return
    if (event.shiftKey) actions.on_pick_range(task)
    else if (event.ctrlKey || event.metaKey) actions.on_pick(task, true)
    else if (actions.is_picking) actions.on_pick(task)
    else actions.on_select(task)
  }

  // Shift+click picks a range of rows, so it must not also highlight the text between them.
  function press_row(event: MouseEvent): void {
    if (event.shiftKey) event.preventDefault()
  }

  function open_menu(event: MouseEvent): void {
    if (actions.is_picked(task)) return actions.on_bulk_menu(event)
    actions.on_context_menu(event, [
      { label: 'Open details', on_select: () => actions.on_select(task) },
      { label: 'Select', on_select: () => actions.on_pick(task) },
      ...(actions.can_add_subtasks ? [{ label: 'Add subtask', on_select: () => set_is_adding_subtask(true) }] : []),
      { label: task.is_done ? 'Mark as not done' : 'Mark as done', on_select: () => actions.on_toggle(task) },
      { label: 'Reschedule…', on_select: () => actions.on_reschedule(task) },
      actions.is_in_my_day(task)
        ? { label: 'Remove from My Day', on_select: () => actions.on_set_my_day(task, false) }
        : { label: 'Add to My Day', on_select: () => actions.on_set_my_day(task, true) },
      { label: 'Copy link', on_select: () => void navigator.clipboard?.writeText(task_link(task.id)) },
      { label: 'Delete', on_select: () => actions.on_remove(task), is_danger: true }
    ])
  }

  const is_selected = actions.selected_task_id === task.id
  const is_picked = actions.is_picked(task)
  // A broken streak shows a muted zero in the table, so it reads apart from a task that is not tracked at all.
  const streak_badge = streak && streak.current > 0 && (
    <span class="streak_badge" title={`${streak.current} in a row ${task.recurrence ? 'on time' : 'done with its routine'} · best ${streak.best}`}>
      🔥 {streak.current}
    </span>
  )
  const streak_cell = (
    <span key="streak" class="task_cell streak_cell">
      {streak_badge || (streak && <span class="streak_badge is_broken" title={`No streak · best ${streak.best}`}>0</span>)}
    </span>
  )

  // The smart date says "Done" before a done date, since it shows other dates too; only it and the due date can be overdue.
  function date_cell(column: DateColumn) {
    const date = column_date(task, column, actions.date_field, actions.last_done_of)
    const is_late = (column === 'date' || column === 'due') && !task.is_done && date !== null && is_overdue(date)
    return (
      <span key={column} class="task_cell date_cell">
        {date && (
          <span class={is_late ? 'due_label is_overdue' : 'due_label'}>
            {column === 'date' && task.is_done && task.done_at ? 'Done ' : ''}{task_date_label(date)}
          </span>
        )}
      </span>
    )
  }
  const row_class = [
    'task', task.is_done && 'is_done', is_selected && 'is_selected', is_picked && 'is_picked', tint_tag && 'has_tint', shown_placement && `drop_${shown_placement}`
  ].filter(Boolean).join(' ')

  return (
    <li class="task_item">
      <div
        class={row_class}
        style={tint_tag && tag_color_style(tint_tag)}
        draggable
        onMouseDown={press_row}
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
            onClick={() => actions.on_set_collapsed(task, !is_collapsed)}
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
          {!actions.is_table && streak_badge}
          {row_history.length > 0 && <StreakStrip history={row_history} limit={ROW_STRIP_LENGTH} />}
        </span>

        {actions.is_table ? (
          actions.table_columns.map((column) =>
            is_date_column(column) ? date_cell(column) : column === 'streak' ? streak_cell : (
              <span key={column} class="task_cell">
                {task_tags.filter((tag) => `group:${tag.group_id}` === column).map((tag) => render_tag(tag, tag_path(tag, actions.tags)))}
              </span>
            )
          )
        ) : (
          <>
            {date_cell('date')}
            {task_tags.map((tag) => render_tag(tag))}
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

// ============================================================================
// Repeat row
// ============================================================================

interface RepeatItemProps {
  repeat: RepeatOccurrence
  actions: TaskActions
}

// A later date of a repeating task: it cannot be ticked or dragged, and clicking it opens the task itself.
export function RepeatItem({ repeat, actions }: RepeatItemProps) {
  const { task, task_date } = repeat

  return (
    <li class="task_item">
      <div class="task is_repeat" onClick={() => actions.on_select(task)} title="A later date of this repeating task">
        <span class="collapse_spacer" />
        <span class="repeat_marker" aria-hidden="true">↻</span>
        <span class="task_cell title_cell">
          <span class="task_title">{task.title}</span>
          {!actions.is_table && <span class="due_label">{task_date_label(task_date)}</span>}
        </span>
        {actions.is_table &&
          actions.table_columns.map((column) => (
            <span key={column} class="task_cell date_cell">
              {(column === 'date' || column === actions.date_field) && <span class="due_label">{task_date_label(task_date)}</span>}
            </span>
          ))}
        <span class="task_cell actions_cell">
          <span class="row_spacer" />
        </span>
      </div>
    </li>
  )
}
