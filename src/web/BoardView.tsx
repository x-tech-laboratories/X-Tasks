import type { CSSProperties } from 'react'

import type { TaskDateField } from '@shared/settings'
import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { is_overdue, relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { Board, type BoardColumn as WidgetColumn } from '@x-tech-laboratories/x-libs/web/react/board'
import { task_date_of } from '@shared/schedule'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { group_by_date, type ShownRange } from './dates'
import { in_tree_order } from '@x-tech-laboratories/x-libs/web/tree'
import { TagChip } from './TagChip'
import { click_task, open_task_menu, type TaskActions } from './TaskItem'
import { tag_color_style, tag_path, with_icon, type TaskNode } from './views'

// ============================================================================
// Columns
// ============================================================================

// A column of cards: a tag of the grouped filter group, a date, or open and done; drops land only where they mean one clear change.
export interface BoardColumn extends WidgetColumn {
  nodes: TaskNode[]
  accepts_drop: boolean
}

export const OPEN_COLUMN = 'open'
export const DONE_COLUMN = 'done'
export const NO_TAG_COLUMN = 'none'
export const OVERDUE_COLUMN = 'overdue'

// Every tag of the group gets a column, even an empty one to drop into, with tasks holding none of them last.
export function tag_columns(nodes: TaskNode[], tag_group: TagGroup, tags: Tag[], tags_of: (task: Task) => Tag[]): BoardColumn[] {
  const group_tags = in_tree_order(tags.filter((tag) => tag.group_id === tag_group.id))
  const columns = group_tags.map((tag): BoardColumn => ({ id: tag.id, label: with_icon(tag, tag_path(tag, tags)), nodes: [], accepts_drop: !tag_group.is_rule }))
  const untagged: BoardColumn = { id: NO_TAG_COLUMN, label: `No ${tag_group.name}`, nodes: [], accepts_drop: !tag_group.is_rule }

  for (const node of nodes) {
    const tag_ids = new Set(tags_of(node.task).map((tag) => tag.id))
    const held = columns.filter((column) => tag_ids.has(column.id))
    for (const column of held.length > 0 ? held : [untagged]) column.nodes.push(node)
  }
  return [...columns, untagged]
}

// A card dropped on a column for one whole day moves there, so such a column is keyed by that day; the others take no drops.
export function date_columns(nodes: TaskNode[], date_field: TaskDateField, now: string, keep_order: boolean, ranges: ShownRange[]): BoardColumn[] {
  return group_by_date(nodes, [], date_field, now, keep_order, ranges).map((group) => ({ ...group, id: group.drop_day ?? group.key, accepts_drop: group.drop_day !== null }))
}

export function status_columns(nodes: TaskNode[]): BoardColumn[] {
  return [
    { id: OPEN_COLUMN, label: 'To do', nodes: nodes.filter((node) => !node.task.is_done), accepts_drop: true },
    { id: DONE_COLUMN, label: 'Done', nodes: nodes.filter((node) => node.task.is_done), accepts_drop: true }
  ]
}

// ============================================================================
// Board
// ============================================================================

interface BoardViewProps {
  columns: BoardColumn[]
  actions: TaskActions
  // The tag group the columns stand for, whose chips the cards leave out.
  column_group_id: string | null
  // How many unfinished tasks a task still waits on.
  open_dependency_count: (task: Task) => number
  // Moves the dragged cards from one column to another.
  on_move: (task: Task, from_key: string, to_key: string) => void
}

export function BoardView({ columns, actions, column_group_id, open_dependency_count, on_move }: BoardViewProps) {
  const shown_columns = columns.map((column): BoardColumn => ({ ...column, count: column.nodes.length, class_name: column.id === OVERDUE_COLUMN ? 'tone-bad' : undefined }))

  return (
    <Board<TaskNode, BoardColumn>
      label="Board"
      columns={shown_columns}
      cards={{
        of: (_, column) => column.nodes,
        id: (node) => node.task.id,
        render: (node) => <CardContent node={node} actions={actions} column_group_id={column_group_id} waiting_count={open_dependency_count(node.task)} />,
        class_name: (node) => cx(node.task.is_done && 'is_done', actions.selected_task_id === node.task.id && 'selected', actions.is_picked(node.task) && 'picked', tint_tag_of(node.task, actions, column_group_id) && 'has-tint') || undefined,
        style: (node) => {
          const tint_tag = tint_tag_of(node.task, actions, column_group_id)
          return tint_tag ? (tag_color_style(tint_tag) as CSSProperties) : undefined
        },
        on_open: (node, event) => click_task(node.task, actions, event),
        on_context_menu: (node, event) => open_task_menu(node.task, actions, event),
        on_drag_start: (node, event) => {
          event.dataTransfer?.setData('text/plain', node.task.title)
          actions.on_drag_start(node.task)
        },
        on_drag_end: () => actions.on_drag_end()
      }}
      on_move={(node, move) => on_move(node.task, move.from.id, move.to.id)}
    />
  )
}

// ============================================================================
// Card
// ============================================================================

// The chips a card shows: the task's own tags and matching rule tags, leaving out the ones its column stands for.
function card_tags_of(task: Task, actions: TaskActions, column_group_id: string | null): Tag[] {
  return [...actions.tags.filter((tag) => task.tag_ids.includes(tag.id)), ...actions.rule_tags_of(task)]
    .filter((tag) => tag.shows_on_rows && tag.group_id !== column_group_id)
}

function tint_tag_of(task: Task, actions: TaskActions, column_group_id: string | null): Tag | undefined {
  return actions.tint_rows ? card_tags_of(task, actions, column_group_id).find((tag) => tag.color) : undefined
}

interface CardContentProps {
  node: TaskNode
  actions: TaskActions
  column_group_id: string | null
  waiting_count: number
}

function CardContent({ node, actions, column_group_id, waiting_count }: CardContentProps) {
  const { task, children } = node
  const task_tags = card_tags_of(task, actions, column_group_id)
  const date = task_date_of(task, actions.date_field)
  const done_children = children.filter((child) => child.task.is_done).length

  return (
    <>
      <div className="board-card-title task_card_title">
        <input type="checkbox" checked={task.is_done} onChange={() => actions.on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title">{task.title}</span>
      </div>
      <div className="board-card-meta">
        {date && <span className={cx('due_label', !task.is_done && is_overdue(date) && 'is_overdue')}>{relative_day_label(date)}</span>}
        {task.recurrence && <span className="task_mark" title="Repeats">↻</span>}
        {task.notes && <span className="task_mark" title="Has notes">≡</span>}
        {children.length > 0 && <span className="subtask_count" title="Subtasks done">{done_children}/{children.length}</span>}
        {waiting_count > 0 && <span className="task_mark" title={`Waits on ${waiting_count} ${waiting_count === 1 ? 'task' : 'tasks'}`}>⧗ {waiting_count}</span>}
        {task_tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} title={tag_path(tag, actions.tags)} />
        ))}
      </div>
    </>
  )
}
