import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { MenuList } from '@x-tech-laboratories/x-libs/web/react/menus'
import { in_tree_order } from '@x-tech-laboratories/x-libs/web/tree'
import { SearchBox } from '@x-tech-laboratories/x-libs/web/react/controls'
import { DataTable, type RowGroup, type Sorting, type TableColumn as DataColumn } from '@x-tech-laboratories/x-libs/web/react/table'
import type { TableSortKey } from '@shared/settings'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import type { RepeatOccurrence, TaskGroup } from './dates'
import {
  COLUMN_WIDTH_RANGE, DURATION_FILTER_CHOICES, EMPTY_TABLE_FILTERS, NO_TAG_FILTER, STREAK_FILTER_CHOICES, date_filter_choices, default_column_width, group_column,
  has_table_filters, is_column_filtered, is_column_shown, is_date_column, is_mark_column, table_sort_value, tag_ranks, type SortContext, type TableColumn,
  type TableFilters
} from './table'
import {
  DateLabel, DurationLabel, ROW_STRIP_LENGTH, StreakBadge, SubtaskForm, click_task, open_task_menu, row_tags_of, row_tint_style, start_task_drag, type TaskActions
} from './TaskItem'
import { StreakStrip } from './StreakStrip'
import { TagChip } from './TagChip'
import { tag_path, type TaskNode } from './views'

// ============================================================================
// Rows
// ============================================================================

// A table row is a task with its subtasks, or a later date of a repeating task.
type TableRow = { kind: 'task'; node: TaskNode } | { kind: 'repeat'; repeat: RepeatOccurrence }

function task_row(node: TaskNode): TableRow {
  return { kind: 'task', node }
}

function repeat_row(repeat: RepeatOccurrence): TableRow {
  return { kind: 'repeat', repeat }
}

function row_key(row: TableRow): string {
  return row.kind === 'task' ? row.node.task.id : `${row.repeat.task.id}@${row.repeat.task_date}`
}

function task_of(row: TableRow): Task {
  return row.kind === 'task' ? row.node.task : row.repeat.task
}

// The ids of every task in the tree that has children, at any depth.
function parent_ids_of(nodes: TaskNode[]): string[] {
  return nodes.flatMap((node) => (node.children.length > 0 ? [node.task.id, ...parent_ids_of(node.children)] : []))
}

// ============================================================================
// Table
// ============================================================================

interface TaskTableProps {
  // The tasks as a tree, or under headings when grouped.
  tree: TaskNode[]
  groups: TaskGroup[] | null
  is_grouped_by_date: boolean
  actions: TaskActions
  tags: Tag[]
  tag_groups: TagGroup[]
  tags_of: (task: Task) => Tag[]
  // Every column after the title in its saved order, and the saved choices of which show.
  column_order: TableColumn[]
  hidden_columns: string[]
  shown_columns: string[]
  column_widths: Record<string, number>
  sort: TableSortKey[]
  filters: TableFilters
  collapsed_ids: string[]
  on_column_order_change: (order: TableColumn[]) => void
  on_show_column: (column: TableColumn, is_shown: boolean) => void
  on_column_widths_change: (widths: Record<string, number>, done: boolean) => void
  on_sort_change: (sort: TableSortKey[]) => void
  on_filters_change: (filters: TableFilters) => void
  on_collapsed_change: (collapsed_ids: string[]) => void
}

// The table layout: each column sorts, filters from its funnel, moves, resizes and hides, and subtasks nest under their tasks.
// The room the task column keeps before the other columns shrink, and the narrowest a shrunk column gets.
const TITLE_ROOM = 280
const MIN_SCALED_WIDTH = 40

export function TaskTable(props: TaskTableProps) {
  const { tree, groups, actions, tags, tag_groups, filters } = props
  const [adding_subtask_to, set_adding_subtask_to] = useState<string | null>(null)

  const sort_context: SortContext = useMemo(
    () => ({
      tags_of: props.tags_of, streak_of: actions.streak_of, is_in_my_day: actions.is_in_my_day, date_field: actions.date_field, last_done_of: actions.last_done_of,
      tag_rank: tag_ranks(tags, false), reversed_tag_rank: tag_ranks(tags, true)
    }),
    [tags, props.tags_of, actions]
  )

  function column_label(column: TableColumn): string {
    if (column === 'title') return 'Task'
    if (column === 'date') return 'Date'
    if (column === 'start') return 'Start'
    if (column === 'due') return 'Due'
    if (column === 'done') return 'Done'
    if (column === 'duration') return 'Duration'
    if (column === 'my_day') return 'My Day'
    if (column === 'notes') return 'Notes'
    if (column === 'repeats') return 'Repeats'
    if (column === 'streak') return 'Streak'
    if (column === 'history') return 'History'
    return tag_groups.find((group) => group_column(group) === column)?.name ?? ''
  }

  // ==========================================================================
  // Filters
  // ==========================================================================

  // One choice of a column's filter, ticked when it is the one set.
  function choices<Value extends string>(entries: { value: Value; label: string }[], chosen: Value, choose: (value: Value) => void) {
    return (close: () => void) => (
      <MenuList on_close={close} items={entries.map(({ value, label }) => ({ label, checked: chosen === value, radio: true, run: () => choose(value) }))} />
    )
  }

  // The title filters by typed text; the dates, duration, streak and each group pick one choice from a list; the marks and history do not filter.
  function filter_of(column: TableColumn): ((close: () => void) => ReactNode) | undefined {
    const set = (change: Partial<TableFilters>) => props.on_filters_change({ ...filters, ...change })
    if (column === 'title') {
      return (close) => (
        <SearchBox label="Filter by title" value={filters.title} on_input={(title) => set({ title })} on_submit={close} auto_focus />
      )
    }
    if (is_date_column(column)) return choices(date_filter_choices(column), filters.dates[column] ?? 'any', (value) => set({ dates: { ...filters.dates, [column]: value } }))
    if (column === 'duration') return choices(DURATION_FILTER_CHOICES, filters.duration, (duration) => set({ duration }))
    if (column === 'streak') return choices(STREAK_FILTER_CHOICES, filters.streak, (streak) => set({ streak }))
    if (is_mark_column(column) || column === 'history') return undefined

    const group_id = column.slice('group:'.length)
    const tag_choices = [
      { value: '', label: 'Any' },
      { value: NO_TAG_FILTER, label: 'None' },
      ...in_tree_order(tags.filter((tag) => tag.group_id === group_id)).map((tag) => ({ value: tag.id, label: tag_path(tag, tags) }))
    ]
    return choices(tag_choices, filters.group_tag_ids[group_id] ?? '', (tag_id) => set({ group_tag_ids: { ...filters.group_tag_ids, [group_id]: tag_id } }))
  }

  // ==========================================================================
  // Cells
  // ==========================================================================

  function title_cell(row: TableRow): ReactNode {
    if (row.kind === 'repeat') {
      return (
        <span className="task_title_cell" title="A later date of this repeating task">
          <span className="repeat_marker" aria-hidden="true">↻</span>
          <span className="task_title">{row.repeat.task.title}</span>
        </span>
      )
    }
    const task = row.node.task
    return (
      <span className="task_title_cell">
        <input type="checkbox" checked={task.is_done} onChange={() => actions.on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title">{task.title}</span>
        {actions.can_add_subtasks && (
          <button className="icon row_button" onClick={() => set_adding_subtask_to(task.id)} aria-label="Add subtask">
            +
          </button>
        )}
      </span>
    )
  }

  function cell(row: TableRow, column: TableColumn): ReactNode {
    if (row.kind === 'repeat') {
      const shows_date = column === 'date' || column === actions.date_field
      return shows_date ? <span className="due_label">{relative_day_label(row.repeat.task_date)}</span> : null
    }
    const task = row.node.task
    if (is_date_column(column)) return <DateLabel task={task} column={column} actions={actions} />
    if (column === 'duration') return <DurationLabel task={task} />
    if (column === 'my_day') return actions.is_in_my_day(task) && <span className="task_mark" title="In My Day">☀</span>
    if (column === 'notes') return task.notes && <span className="task_mark" title="Has notes">≡</span>
    if (column === 'repeats') return task.recurrence && <span className="task_mark" title="Repeats">↻</span>
    if (column === 'streak') return <StreakBadge task={task} streak={actions.streak_of(task)} show_broken />
    if (column === 'history') {
      const history = actions.history_of(task)
      return history.length > 0 && <StreakStrip history={history} limit={ROW_STRIP_LENGTH} />
    }
    return row_tags_of(task, actions)
      .filter((tag) => `group:${tag.group_id}` === column)
      .map((tag) => <TagChip key={tag.id} tag={tag} label={tag_path(tag, tags)} title={tag_path(tag, tags)} on_remove={() => actions.on_untag(task, tag)} />)
  }

  const sorting: Sorting[] = props.sort.map((key) => ({ key: key.column, descending: key.is_descending }))
  const is_descending = (column: TableColumn) => sorting.some((key) => key.key === column && key.descending)

  const all_columns: TableColumn[] = ['title', ...props.column_order]
  const columns: DataColumn<TableRow>[] = all_columns.map((column) => ({
    id: column,
    label: column_label(column),
    cell: column === 'title' ? title_cell : (row) => cell(row, column),
    sort: column === 'history' ? undefined : (row) => (row.kind === 'task' ? table_sort_value(row.node.task, column, sort_context, is_descending(column)) : null),
    class: column === 'title' ? 'title_column' : is_date_column(column) || column === 'duration' ? 'date_column' : undefined,
    width: column === 'title' ? undefined : default_column_width(column),
    min_width: Math.min(COLUMN_WIDTH_RANGE.min, MIN_SCALED_WIDTH),
    max_width: COLUMN_WIDTH_RANGE.max,
    hideable: column !== 'title',
    movable: column !== 'title',
    filter: filter_of(column),
    filter_active: is_column_filtered(filters, column)
  }))

  // ==========================================================================
  // Showing and hiding
  // ==========================================================================

  const hidden = props.column_order.filter((column) => !is_column_shown(column, props.hidden_columns, props.shown_columns))

  // The set widths shrink together when they would not leave the task its room, so the table fits the pane; widths dragged then are scaled back up to keep.
  const [pane, set_pane] = useState<HTMLElement | null>(null)
  const [pane_width, set_pane_width] = useState(0)
  useEffect(() => {
    if (!pane) return
    const observer = new ResizeObserver(() => set_pane_width(pane.clientWidth))
    observer.observe(pane)
    return () => observer.disconnect()
  }, [pane])
  const set_widths = Object.fromEntries(props.column_order.filter((column) => !hidden.includes(column)).map((column) => [column, props.column_widths[column] ?? default_column_width(column)]))
  const set_total = Object.values(set_widths).reduce((sum, width) => sum + width, 0)
  const scale = pane_width > 0 && set_total > 0 ? Math.min(1, Math.max(0, pane_width - TITLE_ROOM) / set_total) : 1
  const shown_widths = scale === 1 ? props.column_widths : Object.fromEntries(Object.entries(set_widths).map(([column, width]) => [column, Math.max(MIN_SCALED_WIDTH, Math.round(width * scale))]))
  function change_widths(widths: Record<string, number>, done: boolean): void {
    props.on_column_widths_change(scale === 1 ? widths : Object.fromEntries(Object.entries(widths).map(([column, width]) => [column, Math.round(width / scale)])), done)
  }

  function change_hidden(next_hidden: string[]): void {
    for (const column of props.column_order) {
      const was_hidden = hidden.includes(column)
      const is_hidden = next_hidden.includes(column)
      if (was_hidden !== is_hidden) props.on_show_column(column, !is_hidden)
    }
  }

  // ==========================================================================
  // Folding
  // ==========================================================================

  const parent_ids = parent_ids_of(tree)
  const expanded = parent_ids.filter((id) => !props.collapsed_ids.includes(id))

  // Folds kept for tasks not on screen stay as they were.
  function change_expanded(next: string[]): void {
    const off_screen = props.collapsed_ids.filter((id) => !parent_ids.includes(id))
    props.on_collapsed_change([...off_screen, ...parent_ids.filter((id) => !next.includes(id))])
  }

  // ==========================================================================
  // Rows and groups
  // ==========================================================================

  const rows = tree.map(task_row)
  const row_groups: RowGroup<TableRow>[] | undefined = groups?.map((group) => ({
    key: group.key,
    label: (
      <>
        {group.label}
        <span className="group_count">{group.nodes.length + group.repeats.length}</span>
      </>
    ),
    rows: [...group.nodes.map(task_row), ...group.repeats.map(repeat_row)],
    class_name: props.is_grouped_by_date && group.key === 'overdue' ? 'is_overdue' : undefined
  }))

  function row_class(row: TableRow): string | undefined {
    if (row.kind === 'repeat') return 'task_row is_repeat'
    const task = row.node.task
    const is_picked = actions.is_picked(task)
    return cx('task_row', task.is_done && 'is_done', is_picked && 'is_picked', is_picked && actions.is_dragging_picked && 'is_dragged', row_tint_style(task, actions) && 'has_tint')
  }

  return (
    <>
      <span ref={(probe) => set_pane(probe?.parentElement ?? null)} hidden />
      <DataTable<TableRow>
        columns={columns}
        rows={rows}
        groups={row_groups}
        row_key={row_key}
        row_selected={(row) => row.kind === 'task' && actions.selected_task_id === row.node.task.id}
        caption="Tasks"
        wrap_class="scroll"
        sorting={sorting}
        on_sorting_change={(next) => props.on_sort_change(next.map((key) => ({ column: key.key as TableColumn, is_descending: key.descending })))}
        column_order={all_columns}
        on_column_order_change={(order) => props.on_column_order_change(order.filter((column) => column !== 'title') as TableColumn[])}
        column_widths={shown_widths}
        on_column_widths_change={change_widths}
        hidden_columns={hidden}
        on_hidden_columns_change={change_hidden}
        on_clear_filters={has_table_filters(filters) ? () => props.on_filters_change(EMPTY_TABLE_FILTERS) : undefined}
        get_children={(row) => (row.kind === 'task' ? row.node.children.map(task_row) : undefined)}
        expanded={expanded}
        on_expanded_change={change_expanded}
        on_row_click={(row, event) => (row.kind === 'task' ? click_task(row.node.task, actions, event) : actions.on_select(row.repeat.task))}
        on_row_context_menu={(row, event) => row.kind === 'task' && open_task_menu(row.node.task, actions, event, () => set_adding_subtask_to(row.node.task.id))}
        row_class={row_class}
        row_style={(row) => (row.kind === 'task' ? row_tint_style(row.node.task, actions) : undefined)}
        render_after_row={(row) =>
          row.kind === 'task' && adding_subtask_to === row.node.task.id ? (
            <SubtaskForm
              on_add={(title) => {
                actions.on_add_subtask(row.node.task, title)
                if (actions.is_collapsed(row.node.task)) actions.on_set_collapsed(row.node.task, false)
              }}
              on_close={() => set_adding_subtask_to(null)}
            />
          ) : null
        }
        on_row_drag_start={(row, event) => (row.kind === 'task' ? start_task_drag(row.node.task, actions, event) : event.preventDefault())}
        on_row_drag_end={actions.on_drag_end}
        can_drop_on_row={(row, placement) => row.kind === 'task' && actions.can_drop_on(task_of(row)) && (placement === 'inside' || actions.can_drop_beside)}
        on_row_drop={(row, placement) => row.kind === 'task' && actions.on_drop(row.node.task, placement)}
      />
    </>
  )
}
