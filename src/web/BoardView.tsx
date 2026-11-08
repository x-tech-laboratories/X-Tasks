import { useState, type CSSProperties } from 'react'

import type { TaskDateField } from '@shared/settings'
import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { is_overdue, relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { task_date_of } from '@shared/schedule'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { group_by_date } from './dates'
import { in_tree_order } from '@x-tech-laboratories/x-libs/web/tree'
import { TagChip } from './TagChip'
import { click_task, open_task_menu, type TaskActions } from './TaskItem'
import { tag_color_style, tag_path, with_icon, type TaskNode } from './views'

// ============================================================================
// Columns
// ============================================================================

// A column of cards: a tag of the grouped filter group, a date, or open and done; drops land only where they mean one clear change.
export interface BoardColumn {
  key: string
  label: string
  nodes: TaskNode[]
  accepts_drop: boolean
}

export const OPEN_COLUMN = 'open'
export const DONE_COLUMN = 'done'
export const NO_TAG_COLUMN = 'none'

// Every tag of the group gets a column, even an empty one to drop into, with tasks holding none of them last.
export function tag_columns(nodes: TaskNode[], tag_group: TagGroup, tags: Tag[], tags_of: (task: Task) => Tag[]): BoardColumn[] {
  const group_tags = in_tree_order(tags.filter((tag) => tag.group_id === tag_group.id))
  const columns = group_tags.map((tag): BoardColumn => ({ key: tag.id, label: with_icon(tag, tag_path(tag, tags)), nodes: [], accepts_drop: !tag_group.is_rule }))
  const untagged: BoardColumn = { key: NO_TAG_COLUMN, label: `No ${tag_group.name}`, nodes: [], accepts_drop: !tag_group.is_rule }

  for (const node of nodes) {
    const tag_ids = new Set(tags_of(node.task).map((tag) => tag.id))
    const held = columns.filter((column) => tag_ids.has(column.key))
    for (const column of held.length > 0 ? held : [untagged]) column.nodes.push(node)
  }
  return [...columns, untagged]
}

// A card dropped on a single day moves there; overdue, month and undated columns take no drops.
export function date_columns(nodes: TaskNode[], date_field: TaskDateField, now: string, keep_order: boolean): BoardColumn[] {
  return group_by_date(nodes, [], date_field, now, keep_order).map((group) => ({ ...group, accepts_drop: /^\d{4}-\d{2}-\d{2}$/.test(group.key) }))
}

export function status_columns(nodes: TaskNode[]): BoardColumn[] {
  return [
    { key: OPEN_COLUMN, label: 'To do', nodes: nodes.filter((node) => !node.task.is_done), accepts_drop: true },
    { key: DONE_COLUMN, label: 'Done', nodes: nodes.filter((node) => node.task.is_done), accepts_drop: true }
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
  const [dragged, set_dragged] = useState<{ task: Task; from_key: string } | null>(null)
  const [drop_key, set_drop_key] = useState<string | null>(null)

  function drop(column: BoardColumn): void {
    set_drop_key(null)
    if (!dragged || !column.accepts_drop || column.key === dragged.from_key) return
    on_move(dragged.task, dragged.from_key, column.key)
  }

  return (
    <div className="board_view">
      {columns.map((column) => (
        <section
          key={column.key}
          className={cx('board_column', drop_key === column.key && 'is_drop_target')}
          onDragOver={(event) => {
            if (!dragged || !column.accepts_drop || column.key === dragged.from_key) return
            event.preventDefault()
            set_drop_key(column.key)
          }}
          onDragLeave={(event) => {
            if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) set_drop_key(null)
          }}
          onDrop={() => drop(column)}
        >
          <h2 className={cx('board_column_heading', column.key === 'overdue' && 'is_overdue')}>
            {column.label}
            <span className="group-count">{column.nodes.length}</span>
          </h2>
          <ul className="board_cards">
            {column.nodes.map((node) => (
              <BoardCard
                key={node.task.id}
                node={node}
                actions={actions}
                column_group_id={column_group_id}
                waiting_count={open_dependency_count(node.task)}
                on_drag_start={() => set_dragged({ task: node.task, from_key: column.key })}
                on_drag_end={() => {
                  set_dragged(null)
                  set_drop_key(null)
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ============================================================================
// Card
// ============================================================================

interface BoardCardProps {
  node: TaskNode
  actions: TaskActions
  column_group_id: string | null
  waiting_count: number
  on_drag_start: () => void
  on_drag_end: () => void
}

function BoardCard({ node, actions, column_group_id, waiting_count, on_drag_start, on_drag_end }: BoardCardProps) {
  const { task, children } = node
  const task_tags = [...actions.tags.filter((tag) => task.tag_ids.includes(tag.id)), ...actions.rule_tags_of(task)]
    .filter((tag) => tag.shows_on_rows && tag.group_id !== column_group_id)
  const tint_tag = actions.tint_rows ? task_tags.find((tag) => tag.color) : undefined
  const date = task_date_of(task, actions.date_field)
  const done_children = children.filter((child) => child.task.is_done).length

  const card_class = cx('board_card', task.is_done && 'is_done', actions.selected_task_id === task.id && 'selected', actions.is_picked(task) && 'picked', tint_tag && 'has-tint')

  return (
    <li
      className={card_class}
      style={tint_tag ? (tag_color_style(tint_tag) as CSSProperties) : undefined}
      draggable
      onMouseDown={(event) => event.shiftKey && event.preventDefault()}
      onClick={(event) => click_task(task, actions, event)}
      onContextMenu={(event) => open_task_menu(task, actions, event)}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', task.title)
        actions.on_drag_start(task)
        on_drag_start()
      }}
      onDragEnd={() => {
        actions.on_drag_end()
        on_drag_end()
      }}
    >
      <div className="board_card_title">
        <input type="checkbox" checked={task.is_done} onChange={() => actions.on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title">{task.title}</span>
      </div>
      <div className="board_card_details">
        {date && <span className={cx('due_label', !task.is_done && is_overdue(date) && 'is_overdue')}>{relative_day_label(date)}</span>}
        {task.recurrence && <span className="task_mark" title="Repeats">↻</span>}
        {task.notes && <span className="task_mark" title="Has notes">≡</span>}
        {children.length > 0 && <span className="subtask_count" title="Subtasks done">{done_children}/{children.length}</span>}
        {waiting_count > 0 && <span className="task_mark" title={`Waits on ${waiting_count} ${waiting_count === 1 ? 'task' : 'tasks'}`}>⧗ {waiting_count}</span>}
        {task_tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} title={tag_path(tag, actions.tags)} />
        ))}
      </div>
    </li>
  )
}
