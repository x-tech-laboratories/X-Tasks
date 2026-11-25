import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { SearchBox, Select } from '@x-tech-laboratories/x-libs/web/react/controls'
import { Toasts } from '@x-tech-laboratories/x-libs/web/react/toasts'
import { ChevronDownIcon, ChevronRightIcon, DragIcon, Icon, SunIcon } from '@x-tech-laboratories/x-libs/web/react/icons'
import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { parse_local } from '@x-tech-laboratories/x-libs/dates'
import { placement_at, type DropPlacement } from '@x-tech-laboratories/x-libs/web/tree'
import type { Tag, Task } from '@shared/tasks'
import { AddTaskRow } from './SyntaxHelp'
import type { QuickAdd } from './syntax'
import type { TaskNode } from './views'

// ============================================================================
// Checklist page
// ============================================================================

// The page opened with ?checklist, for a narrow strip such as the Linux sidebar: one bar that searches and adds, and a view picked in the heading as checkboxes.
// The rows edit like a checklist in a note: titles are typed into in place, Enter adds a row below, Tab and Shift+Tab nest and unnest, Backspace on an empty row deletes it, and the grip drags a row.
export interface ChecklistPageProps {
  text: string
  on_text: (text: string) => void
  on_submit: () => void
  // The task the typed text would add, and the open tasks it found with their open subtasks; both null while nothing is typed.
  quick_add: QuickAdd | null
  found: TaskNode[] | null
  listed: TaskNode[]
  // The picked view as a key, the plain views and the tags offered for it as key and name, and the picked view's name.
  view_key: string
  view_choices: [string, string][]
  tag_choices: [string, string][]
  current_title: string
  on_select_view: (key: string) => void
  today: string
  tags: Tag[]
  collapsed_ids: string[]
  is_in_my_day: (task: Task) => boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_set_collapsed: (task: Task, is_collapsed: boolean) => void
  on_toggle: (task: Task) => void
  on_add: () => void
  on_rename: (task: Task, title: string) => void
  // Adds an empty task right below this one, beside it, and hands it back; is_top says the row sits at the top of the list.
  on_add_after: (task: Task, is_top: boolean) => Promise<Task>
  on_indent: (task: Task, above: Task) => void
  // lands_on_top says the task comes out to the top of the list.
  on_outdent: (task: Task, parent: Task, lands_on_top: boolean) => void
  // Drops a dragged task before, inside or after another.
  on_move: (task: Task, target: Task, placement: DropPlacement) => void
  on_remove: (task: Task) => void
}

// Where a row sits on screen: the row whose subtask it is, the rows beside it, and the open rows in screen order.
interface Place {
  parent: TaskNode | null
  siblings: TaskNode[]
}

interface Editor {
  place_of: Map<string, Place>
  open_ids: string[]
  inputs: Map<string, HTMLTextAreaElement>
  focus: (target: FocusTarget) => void
  dragged: TaskNode | null
  set_dragged: (node: TaskNode | null) => void
}

// The row to type in next, with the caret at a character or at the end.
interface FocusTarget {
  id: string
  caret: number | 'end'
}

export function ChecklistPage(props: ChecklistPageProps) {
  const { text, on_text, on_submit, quick_add, found, listed, today, tags, on_add, view_key } = props
  const left_count = all_tasks_in(listed).filter((task) => !task.is_done).length
  const shown = found ?? listed
  const [focus_target, set_focus_target] = useState<FocusTarget | null>(null)
  const [dragged, set_dragged] = useState<TaskNode | null>(null)
  const inputs = useRef(new Map<string, HTMLTextAreaElement>())
  const place_of = new Map<string, Place>()
  const open_ids: string[] = []
  place_rows(shown, null, props.collapsed_ids, place_of, open_ids)
  const editor: Editor = { place_of, open_ids, inputs: inputs.current, focus: set_focus_target, dragged, set_dragged }

  // A row moved or added draws anew, so the caret goes into it once it is on screen, before a blur on the old one is looked at.
  useLayoutEffect(() => {
    const input = focus_target && inputs.current.get(focus_target.id)
    if (!input) return
    input.focus()
    const caret = focus_target.caret === 'end' ? input.value.length : Math.min(focus_target.caret, input.value.length)
    input.setSelectionRange(caret, caret)
    set_focus_target(null)
  })

  return (
    <main className="checklist_page">
      <form className="multibar" onSubmit={(event) => event.preventDefault()}>
        <SearchBox auto_focus label="Search, or type a task to add" value={text} on_input={on_text} on_submit={on_submit} />
      </form>

      {found ? (
        <>
          {quick_add?.title && <AddTaskRow quick_add={quick_add} tags={tags} on_add={on_add} on_cancel={() => on_text('')} />}
          <ul className="task_list checklist">
            {found.map((node) => (
              <ChecklistRow key={node.task.id} node={node} editor={editor} {...props} />
            ))}
          </ul>
          {found.length === 0 && <p className="empty">No open tasks match.</p>}
        </>
      ) : (
        <>
          <h1 className="checklist_heading">
            <span className="checklist_view">
              <Select bare label="View" options={props.view_choices} groups={[{ label: 'Tags', options: props.tag_choices }]} value={view_key} on_change={props.on_select_view} />
            </span>
            <span className="checklist_subtitle">
              {parse_local(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {left_count} left
            </span>
          </h1>
          <ul className="task_list checklist">
            {listed.map((node) => (
              <ChecklistRow key={node.task.id} node={node} editor={editor} {...props} />
            ))}
          </ul>
          {listed.length === 0 && <p className="empty">{view_key === 'my_day' ? 'Nothing in My Day yet. Search above to add tasks.' : `No open tasks in ${props.current_title}.`}</p>}
        </>
      )}
      {/* The page stands without the app's shell, so it shows the Undo after a deletion itself. */}
      <Toasts />
    </main>
  )
}

// A grip to drag it by, a chevron when the task has subtasks, its checkbox and title, then the sun that puts it into My Day or takes it out.
function ChecklistRow(props: ChecklistPageProps & { node: TaskNode; editor: Editor }) {
  const { node, editor, collapsed_ids, is_in_my_day, on_set_my_day, on_set_collapsed, on_toggle, on_move } = props
  const { task, children } = node
  const is_collapsed = collapsed_ids.includes(task.id)
  const is_added = is_in_my_day(task)
  const [shown_placement, set_shown_placement] = useState<DropPlacement | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const can_drop_here = editor.dragged !== null && !all_tasks_in([editor.dragged]).some((each) => each.id === task.id)

  function start_drag(event: DragEvent): void {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.title)
    if (row.current) event.dataTransfer.setDragImage(row.current, 0, row.current.offsetHeight / 2)
    editor.set_dragged(node)
  }

  function placement_of(event: DragEvent): DropPlacement {
    const box = event.currentTarget.getBoundingClientRect()
    return placement_at(box.height > 0 ? (event.clientY - box.top) / box.height : 0.5, true)
  }

  function drag_over(event: DragEvent): void {
    if (!can_drop_here) return
    event.preventDefault()
    set_shown_placement(placement_of(event))
  }

  function drop(event: DragEvent): void {
    event.preventDefault()
    set_shown_placement(null)
    if (!editor.dragged || !can_drop_here) return
    const placement = placement_of(event)
    if (placement === 'inside' && is_collapsed) on_set_collapsed(task, false)
    on_move(editor.dragged.task, task, placement)
    editor.set_dragged(null)
  }

  return (
    <li className="task_item">
      <div
        ref={row}
        className={cx('task', task.is_done && 'is_done', editor.dragged?.task.id === task.id && 'is_dragged', shown_placement && `drop-${shown_placement}`)}
        onDragOver={drag_over}
        onDragLeave={() => set_shown_placement(null)}
        onDrop={drop}
      >
        <span className="checklist_grip" draggable onDragStart={start_drag} onDragEnd={() => editor.set_dragged(null)} title="Drag to move" aria-hidden="true">
          <Icon icon={DragIcon} />
        </span>
        {children.length > 0 ? (
          <button type="button" className="icon tree-toggle" onClick={() => on_set_collapsed(task, !is_collapsed)} aria-label={is_collapsed ? 'Expand' : 'Collapse'} aria-expanded={!is_collapsed}>
            <Icon icon={is_collapsed ? ChevronRightIcon : ChevronDownIcon} />
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <input type="checkbox" checked={task.is_done} onChange={() => on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <ChecklistTitle {...props} />
        <button
          type="button"
          className={cx('icon', 'checklist_my_day', is_added && 'is_added')}
          onClick={() => on_set_my_day(task, !is_added)}
          aria-pressed={is_added}
          aria-label={is_added ? 'Remove from My Day' : 'Add to My Day'}
          title={is_added ? 'Remove from My Day' : 'Add to My Day'}
        >
          <Icon icon={SunIcon} />
        </button>
      </div>
      {children.length > 0 && !is_collapsed && (
        <ul className="subtask_list">
          {children.map((child) => (
            <ChecklistRow key={child.task.id} {...props} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

// The title as a field that grows to fit, saved when the caret leaves it or a key acts on the row; an emptied title puts the old one back.
function ChecklistTitle(props: ChecklistPageProps & { node: TaskNode; editor: Editor }) {
  const { node, editor, on_rename, on_add_after, on_indent, on_outdent, on_remove } = props
  const { task } = node
  const [draft, set_draft] = useState(task.title)
  useLayoutEffect(() => {
    set_draft(task.title)
  }, [task.title])
  const place = editor.place_of.get(task.id)

  function commit(): void {
    const title = draft.trim()
    if (title && title !== task.title) on_rename(task, title)
  }

  function caret_of(input: HTMLTextAreaElement): number {
    return input.selectionStart ?? draft.length
  }

  function indent(input: HTMLTextAreaElement): void {
    const above = place && place.siblings[place.siblings.indexOf(node) - 1]
    if (!above) return
    on_indent(task, above.task)
    editor.focus({ id: task.id, caret: caret_of(input) })
  }

  function outdent(input: HTMLTextAreaElement): void {
    if (!place?.parent) return
    on_outdent(task, place.parent.task, editor.place_of.get(place.parent.task.id)?.parent === null)
    editor.focus({ id: task.id, caret: caret_of(input) })
  }

  // Up and Down go to the next row once the caret is on the field's first or last line.
  function step(input: HTMLTextAreaElement, by: number): boolean {
    const style = getComputedStyle(input)
    const line_height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 0
    const is_one_line = input.scrollHeight <= line_height * 1.5
    const is_at_edge = by < 0 ? caret_of(input) === 0 : caret_of(input) === draft.length
    const next_id = editor.open_ids[editor.open_ids.indexOf(task.id) + by]
    if (!next_id || (!is_one_line && !is_at_edge)) return false
    commit()
    editor.focus({ id: next_id, caret: 'end' })
    return true
  }

  function on_key_down(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const input = event.currentTarget
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      commit()
      // Enter on an empty subtask brings it out a level, as in a note.
      if (!draft.trim()) return outdent(input)
      void on_add_after(task, place?.parent === null).then((added) => editor.focus({ id: added.id, caret: 'end' }))
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commit()
      if (event.shiftKey) outdent(input)
      else indent(input)
    } else if (event.key === 'Backspace' && draft === '' && node.children.length === 0) {
      event.preventDefault()
      const above_id = editor.open_ids[editor.open_ids.indexOf(task.id) - 1]
      if (above_id) editor.focus({ id: above_id, caret: 'end' })
      on_remove(task)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (step(input, event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault()
    }
  }

  // A new row left blank goes, unless the caret came straight back to it after a move.
  function on_blur(): void {
    commit()
    if (draft.trim()) return
    if (task.title !== '' || node.children.length > 0) return set_draft(task.title)
    setTimeout(() => {
      if (!editor.inputs.get(task.id)?.isConnected || document.activeElement !== editor.inputs.get(task.id)) on_remove(task)
    })
  }

  return (
    <textarea
      ref={(input) => {
        if (input) editor.inputs.set(task.id, input)
        else if (editor.inputs.get(task.id)?.isConnected === false) editor.inputs.delete(task.id)
      }}
      className="task_title checklist_title"
      rows={1}
      value={draft}
      placeholder="Task"
      aria-label="Title"
      onChange={(event) => set_draft(event.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={on_key_down}
      onBlur={on_blur}
    />
  )
}

// Notes where each row sits and lists the open rows in screen order, leaving out the subtasks of collapsed rows.
function place_rows(nodes: TaskNode[], parent: TaskNode | null, collapsed_ids: string[], place_of: Map<string, Place>, open_ids: string[]): void {
  for (const node of nodes) {
    place_of.set(node.task.id, { parent, siblings: nodes })
    open_ids.push(node.task.id)
    if (!collapsed_ids.includes(node.task.id)) place_rows(node.children, node, collapsed_ids, place_of, open_ids)
  }
}

function all_tasks_in(nodes: TaskNode[]): Task[] {
  return nodes.flatMap((node) => [node.task, ...all_tasks_in(node.children)])
}
