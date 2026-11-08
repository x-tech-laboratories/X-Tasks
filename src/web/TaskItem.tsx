import { useState, type CSSProperties, type DragEvent, type FormEvent, type MouseEvent } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { set_drag_badge } from '@x-tech-laboratories/x-libs/web/drag'
import { open_context_menu, type MenuItem } from '@x-tech-laboratories/x-libs/web/react/menus'
import type { TaskDateField } from '@shared/settings'
import type { HistoryMark, RoutineStreak } from '@shared/streaks'
import { task_link, type Tag, type TagGroup, type Task } from '@shared/tasks'
import { StreakStrip } from './StreakStrip'
import { TagChip } from './TagChip'
import { is_overdue, relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { column_date, task_duration_label, task_duration_minutes, type DateColumn, type LastDoneOf } from './table'
import type { RepeatOccurrence } from './dates'
import { placement_at, type DropPlacement } from '@x-tech-laboratories/x-libs/web/tree'
import { tag_color_style, tag_path, type TaskNode } from './views'

// A row's strip shows about a week of a daily routine.
export const ROW_STRIP_LENGTH = 7

// ============================================================================
// Task actions
// ============================================================================

export interface TaskActions {
  tags: Tag[]
  tag_groups: TagGroup[]
  // Whether rows take a shade of their first coloured tag.
  tint_rows: boolean
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
  // How many tasks a drag from this row moves: all the picked ones from a picked row, otherwise one.
  drag_count_of: (task: Task) => number
  // Set while picked tasks are being dragged together, so every one of them shows as on the move.
  is_dragging_picked: boolean
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

// The tags a row shows: the task's own, then the rule tags that match it, leaving out tags hidden from rows.
export function row_tags_of(task: Task, actions: TaskActions): Tag[] {
  return [...actions.tags.filter((tag) => task.tag_ids.includes(tag.id)), ...actions.rule_tags_of(task)].filter((tag) => tag.shows_on_rows)
}

// The shade of the task's first coloured tag, when rows are tinted.
export function row_tint_style(task: Task, actions: TaskActions): CSSProperties | undefined {
  const tint_tag = actions.tint_rows ? row_tags_of(task, actions).find((tag) => tag.color) : undefined
  return tint_tag && (tag_color_style(tint_tag) as CSSProperties)
}

// A click on a row opens its details, or picks it with Ctrl, Shift or a bulk selection under way; its checkbox and buttons do their own thing.
export function click_task(task: Task, actions: TaskActions, event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('input, button, a')) return
  if (event.shiftKey) actions.on_pick_range(task)
  else if (event.ctrlKey || event.metaKey) actions.on_pick(task, true)
  else if (actions.is_picking) actions.on_pick(task)
  else actions.on_select(task)
}

// A right-click on a picked row offers the bulk actions, and on any other row that task's own.
export function open_task_menu(task: Task, actions: TaskActions, event: MouseEvent, on_add_subtask?: () => void): void {
  if (actions.is_picked(task)) return actions.on_bulk_menu(event)
  const items: MenuItem[] = [
    { label: 'Open details', run: () => actions.on_select(task) },
    { label: 'Select', run: () => actions.on_pick(task) },
    ...(on_add_subtask && actions.can_add_subtasks ? [{ label: 'Add subtask', run: on_add_subtask }] : []),
    { label: task.is_done ? 'Mark as not done' : 'Mark as done', run: () => actions.on_toggle(task) },
    { label: 'Reschedule…', run: () => actions.on_reschedule(task) },
    actions.is_in_my_day(task)
      ? { label: 'Remove from My Day', run: () => actions.on_set_my_day(task, false) }
      : { label: 'Add to My Day', run: () => actions.on_set_my_day(task, true) },
    { label: 'Copy link', run: () => void navigator.clipboard?.writeText(task_link(task.id)) },
    { label: 'Delete', run: () => actions.on_remove(task), danger: true, separator_before: true }
  ]
  open_context_menu(event, items)
}

// Starts dragging a task, with a badge naming how many move when several picked tasks go together.
export function start_task_drag(task: Task, actions: TaskActions, event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', task.id)
  const drag_count = actions.drag_count_of(task)
  if (drag_count > 1) set_drag_badge(event, `${drag_count} tasks`)
  actions.on_drag_start(task)
}

// ============================================================================
// Cells
// ============================================================================

// The marks after a task's title: My Day, notes, repeats, the streak and the latest occurrences.
export function TitleMarks({ task, actions, show_streak }: { task: Task; actions: TaskActions; show_streak: boolean }) {
  const row_history = actions.history_of(task)
  return (
    <>
      {actions.is_in_my_day(task) && <span className="task_mark" title="In My Day">☀</span>}
      {task.notes && <span className="task_mark" title="Has notes">≡</span>}
      {task.recurrence && <span className="task_mark" title="Repeats">↻</span>}
      {show_streak && <StreakBadge task={task} streak={actions.streak_of(task)} show_broken={false} />}
      {row_history.length > 0 && <StreakStrip history={row_history} limit={ROW_STRIP_LENGTH} />}
    </>
  )
}

// A broken streak shows a muted zero where asked, so it reads apart from a task that is not tracked at all.
export function StreakBadge({ task, streak, show_broken }: { task: Task; streak: RoutineStreak | null; show_broken: boolean }) {
  if (!streak) return null
  if (streak.current > 0) {
    return (
      <span className="streak_badge" title={`${streak.current} in a row ${task.recurrence ? 'on time' : 'done with its routine'} · best ${streak.best}`}>
        🔥 {streak.current}
      </span>
    )
  }
  return show_broken ? <span className="streak_badge is_broken" title={`No streak · best ${streak.best}`}>0</span> : null
}

// The smart date says "Done" before a done date, since it shows other dates too; only it and the due date can be overdue.
export function DateLabel({ task, column, actions }: { task: Task; column: DateColumn; actions: TaskActions }) {
  const date = column_date(task, column, actions.date_field, actions.last_done_of)
  if (!date) return null
  const is_late = (column === 'date' || column === 'due') && !task.is_done && is_overdue(date)
  return (
    <span className={cx('due_label', is_late && 'is_overdue')}>
      {column === 'date' && task.is_done && task.done_at ? 'Done ' : ''}
      {relative_day_label(date)}
    </span>
  )
}

export function DurationLabel({ task }: { task: Task }) {
  const minutes = task_duration_minutes(task)
  return minutes === null ? null : <span className="due_label">{task_duration_label(minutes)}</span>
}

// ============================================================================
// Subtask form
// ============================================================================

// A field for a new subtask's title; it closes when emptied and left, or on Escape.
export function SubtaskForm({ on_add, on_close }: { on_add: (title: string) => void; on_close: () => void }) {
  const [title, set_title] = useState('')

  function submit(event: FormEvent): void {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    on_add(trimmed)
    set_title('')
  }

  return (
    <form className="subtask_form" onSubmit={submit}>
      <input
        value={title}
        onChange={(event) => set_title(event.currentTarget.value)}
        onKeyDown={(event) => event.key === 'Escape' && on_close()}
        onBlur={() => !title.trim() && on_close()}
        placeholder="Subtask"
        aria-label="New subtask"
        autoFocus
      />
    </form>
  )
}

// ============================================================================
// Task item
// ============================================================================

interface TaskItemProps {
  node: TaskNode
  actions: TaskActions
}

// One task in the list layout, with its subtasks nested under it.
export function TaskItem({ node, actions }: TaskItemProps) {
  const { task, children } = node
  const is_collapsed = actions.is_collapsed(task)
  const [is_adding_subtask, set_is_adding_subtask] = useState(false)
  const [shown_placement, set_shown_placement] = useState<DropPlacement | null>(null)

  function add_subtask(title: string): void {
    actions.on_add_subtask(task, title)
    if (is_collapsed) actions.on_set_collapsed(task, false)
  }

  function placement_of(event: DragEvent): DropPlacement {
    if (!actions.can_drop_beside) return 'inside'
    const box = event.currentTarget.getBoundingClientRect()
    return placement_at(box.height > 0 ? (event.clientY - box.top) / box.height : 0.5, true)
  }

  function drag_over(event: DragEvent): void {
    if (!actions.can_drop_on(task)) return
    event.preventDefault()
    set_shown_placement(placement_of(event))
  }

  function drop(event: DragEvent): void {
    event.preventDefault()
    set_shown_placement(null)
    actions.on_drop(task, placement_of(event))
  }

  const is_picked = actions.is_picked(task)
  const row_class = cx(
    'task', task.is_done && 'is_done', actions.selected_task_id === task.id && 'is_selected', is_picked && 'is_picked',
    is_picked && actions.is_dragging_picked && 'is_dragged', actions.tint_rows && row_tint_style(task, actions) && 'has_tint', shown_placement && `drop-${shown_placement}`
  )

  return (
    <li className="task_item">
      <div
        className={row_class}
        style={row_tint_style(task, actions)}
        draggable
        onMouseDown={(event) => event.shiftKey && event.preventDefault()}
        onClick={(event) => click_task(task, actions, event)}
        onContextMenu={(event) => open_task_menu(task, actions, event, () => set_is_adding_subtask(true))}
        onDragStart={(event) => start_task_drag(task, actions, event)}
        onDragEnd={actions.on_drag_end}
        onDragOver={drag_over}
        onDragLeave={() => set_shown_placement(null)}
        onDrop={drop}
      >
        {children.length > 0 ? (
          <button className="icon tree-toggle" onClick={() => actions.on_set_collapsed(task, !is_collapsed)} aria-label={is_collapsed ? 'Expand' : 'Collapse'}>
            {is_collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="tree-spacer" />
        )}

        <input type="checkbox" checked={task.is_done} onChange={() => actions.on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title_cell">
          <span className="task_title">{task.title}</span>
          <TitleMarks task={task} actions={actions} show_streak />
        </span>
        <DateLabel task={task} column="date" actions={actions} />
        {row_tags_of(task, actions).map((tag) => (
          <TagChip key={tag.id} tag={tag} title={tag_path(tag, actions.tags)} on_remove={() => actions.on_untag(task, tag)} />
        ))}

        <span className="task_row_end">
          {is_collapsed && <span className="tree-count">{children.length}</span>}
          {actions.can_add_subtasks && (
            <button className="icon row_button" onClick={() => set_is_adding_subtask(true)} aria-label="Add subtask">
              +
            </button>
          )}
        </span>
      </div>

      {!is_collapsed && (children.length > 0 || is_adding_subtask) && (
        <ul className="subtask_list">
          {children.map((child) => (
            <TaskItem key={child.task.id} node={child} actions={actions} />
          ))}
          {is_adding_subtask && <SubtaskForm on_add={add_subtask} on_close={() => set_is_adding_subtask(false)} />}
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
    <li className="task_item">
      <div className="task is_repeat" onClick={() => actions.on_select(task)} title="A later date of this repeating task">
        <span className="tree-spacer" />
        <span className="repeat_marker" aria-hidden="true">↻</span>
        <span className="task_title_cell">
          <span className="task_title">{task.title}</span>
        </span>
        <span className="due_label">{relative_day_label(task_date)}</span>
      </div>
    </li>
  )
}
