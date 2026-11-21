import { SearchBox } from '@x-tech-laboratories/x-libs/web/react/controls'
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
  // The task the typed text would add, and the open tasks it found; both null while nothing is typed.
  quick_add: QuickAdd | null
  found_tasks: Task[] | null
  my_day: TaskNode[]
  today: string
  tags: Tag[]
  is_in_my_day: (task: Task) => boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_toggle: (task: Task) => void
  on_add: () => void
}

export function ChecklistPage(props: ChecklistPageProps) {
  const { text, on_text, on_submit, quick_add, found_tasks, my_day, today, tags, on_add } = props
  const my_day_rows = flattened(my_day, 0)
  const left_count = my_day_rows.filter(({ task }) => !task.is_done).length

  return (
    <main className="checklist_page">
      <form className="multibar" onSubmit={(event) => event.preventDefault()}>
        <SearchBox auto_focus label="Search, or type a task to add" value={text} on_input={on_text} on_submit={on_submit} />
      </form>

      {found_tasks ? (
        <>
          {quick_add?.title && <AddTaskRow quick_add={quick_add} tags={tags} on_add={on_add} on_cancel={() => on_text('')} />}
          <ul className="task_list checklist">
            {found_tasks.map((task) => (
              <ChecklistRow key={task.id} task={task} depth={0} {...props} />
            ))}
          </ul>
          {found_tasks.length === 0 && <p className="empty">No open tasks match.</p>}
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
            {my_day_rows.map(({ task, depth }) => (
              <ChecklistRow key={task.id} task={task} depth={depth} {...props} />
            ))}
          </ul>
          {my_day_rows.length === 0 && <p className="empty">Nothing in My Day yet. Search above to add tasks.</p>}
        </>
      )}
    </main>
  )
}

// A checkbox and title, then a button putting the task into My Day or taking it out; subtasks stay under their parent in My Day.
function ChecklistRow({ task, depth, is_in_my_day, on_set_my_day, on_toggle }: ChecklistPageProps & { task: Task; depth: number }) {
  const is_added = is_in_my_day(task)
  // A subtask shows in My Day through its parent, so only a task put there itself can be taken out.
  const can_remove = is_added && task.my_day_on !== null

  return (
    <li className="task_item">
      <div className={cx('task', task.is_done && 'is_done')} style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-7))` }}>
        <input type="checkbox" checked={task.is_done} onChange={() => on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
        <span className="task_title">{task.title}</span>
        {!is_added && (
          <button type="button" className="checklist_my_day" onClick={() => on_set_my_day(task, true)} title="Add to My Day">
            + My Day
          </button>
        )}
        {can_remove && (
          <button type="button" className="icon checklist_my_day" onClick={() => on_set_my_day(task, false)} aria-label="Remove from My Day" title="Remove from My Day">
            ×
          </button>
        )}
      </div>
    </li>
  )
}

function flattened(nodes: TaskNode[], depth: number): { task: Task; depth: number }[] {
  return nodes.flatMap((node) => [{ task: node.task, depth }, ...flattened(node.children, depth + 1)])
}
