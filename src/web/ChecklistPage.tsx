import { SearchBox } from '@x-tech-laboratories/x-libs/web/react/controls'
import { ChevronDownIcon, ChevronRightIcon, Icon, SunIcon } from '@x-tech-laboratories/x-libs/web/react/icons'
import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { parse_local } from '@x-tech-laboratories/x-libs/dates'
import type { Tag, Task } from '@shared/tasks'
import { AddTaskRow } from './SyntaxHelp'
import type { QuickAdd } from './syntax'
import type { TaskNode } from './views'

// ============================================================================
// Checklist page
// ============================================================================

// The page opened with ?checklist, for a narrow strip such as the Linux sidebar: one bar that searches and adds, and My Day as checkboxes.
export interface ChecklistPageProps {
  text: string
  on_text: (text: string) => void
  on_submit: () => void
  // The task the typed text would add, and the open tasks it found with their open subtasks; both null while nothing is typed.
  quick_add: QuickAdd | null
  found: TaskNode[] | null
  my_day: TaskNode[]
  today: string
  tags: Tag[]
  collapsed_ids: string[]
  is_in_my_day: (task: Task) => boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_set_collapsed: (task: Task, is_collapsed: boolean) => void
  on_toggle: (task: Task) => void
  on_add: () => void
}

export function ChecklistPage(props: ChecklistPageProps) {
  const { text, on_text, on_submit, quick_add, found, my_day, today, tags, on_add } = props
  const left_count = all_tasks_in(my_day).filter((task) => !task.is_done).length

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
              <ChecklistRow key={node.task.id} node={node} {...props} />
            ))}
          </ul>
          {found.length === 0 && <p className="empty">No open tasks match.</p>}
        </>
      ) : (
        <>
          <h1 className="checklist_heading">
            My Day
            <span className="checklist_subtitle">
              {parse_local(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {left_count} left
            </span>
          </h1>
          <ul className="task_list checklist">
            {my_day.map((node) => (
              <ChecklistRow key={node.task.id} node={node} {...props} />
            ))}
          </ul>
          {my_day.length === 0 && <p className="empty">Nothing in My Day yet. Search above to add tasks.</p>}
        </>
      )}
    </main>
  )
}

// A chevron when the task has subtasks, its checkbox and title, then the sun that puts it into My Day or takes it out.
function ChecklistRow(props: ChecklistPageProps & { node: TaskNode }) {
  const { node, collapsed_ids, is_in_my_day, on_set_my_day, on_set_collapsed, on_toggle } = props
  const { task, children } = node
  const is_collapsed = collapsed_ids.includes(task.id)
  const is_added = is_in_my_day(task)

  return (
    <li className="task_item">
      <div className={cx('task', task.is_done && 'is_done')}>
        {children.length > 0 ? (
          <button type="button" className="icon tree-toggle" onClick={() => on_set_collapsed(task, !is_collapsed)} aria-label={is_collapsed ? 'Expand' : 'Collapse'} aria-expanded={!is_collapsed}>
            <Icon icon={is_collapsed ? ChevronRightIcon : ChevronDownIcon} />
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <input type="checkbox" checked={task.is_done} onChange={() => on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title">{task.title}</span>
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

function all_tasks_in(nodes: TaskNode[]): Task[] {
  return nodes.flatMap((node) => [node.task, ...all_tasks_in(node.children)])
}
