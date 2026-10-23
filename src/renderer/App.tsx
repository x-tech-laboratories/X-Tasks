import { useEffect, useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'
import { Sidebar } from './Sidebar'
import { TaskDetail } from './TaskDetail'
import { TaskItem, type TaskActions } from './TaskItem'
import {
  by_position, list_id_for_new_task, list_position_for_drop, nest_tasks, task_is_in_view, task_move_for_drop,
  task_with_descendant_ids, view_title, type DropPlacement, type View
} from './views'

// ============================================================================
// App
// ============================================================================

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [task_lists, set_task_lists] = useState<TaskList[]>([])
  const [selected_view, set_selected_view] = useState<View>({ kind: 'all' })
  const [new_title, set_new_title] = useState('')
  const [dragged_task, set_dragged_task] = useState<Task | null>(null)
  const [selected_task_id, set_selected_task_id] = useState<string | null>(null)

  useEffect(() => {
    void window.x_tasks.list_tasks().then(set_tasks)
    void window.x_tasks.list_task_lists().then(set_task_lists)
  }, [])

  // ==========================================================================
  // Task changes
  // ==========================================================================

  async function submit_new_task(event: Event): Promise<void> {
    event.preventDefault()
    const title = new_title.trim()
    if (!title) return

    const added_task = await window.x_tasks.add_task(title, list_id_for_new_task(selected_view), null)
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_new_title('')
  }

  // A subtask always belongs to the same list as its parent.
  async function add_subtask(parent: Task, title: string): Promise<void> {
    const added_task = await window.x_tasks.add_task(title, parent.list_id, parent.id)
    set_tasks((current_tasks) => [...current_tasks, added_task])
  }

  function toggle_task(task: Task): void {
    const is_done = !task.is_done
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, is_done } : each)))
    void window.x_tasks.set_task_done(task.id, is_done)
  }

  function rename_task(task: Task, title: string): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, title } : each)))
    void window.x_tasks.set_task_title(task.id, title)
  }

  function set_task_notes(task: Task, notes: string): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, notes } : each)))
    void window.x_tasks.set_task_notes(task.id, notes)
  }

  // A task moved to another list leaves its parent and goes to the end, taking its subtasks along.
  function move_task_to_list(task: Task, list_id: string | null): void {
    if (list_id === task.list_id) return
    const position = Math.max(0, ...tasks.map((each) => each.position)) + 1
    const moved_ids = task_with_descendant_ids(task.id, tasks)

    set_tasks((current_tasks) =>
      current_tasks.map((each) => {
        if (each.id === task.id) return { ...each, parent_id: null, list_id, position }
        return moved_ids.has(each.id) ? { ...each, list_id } : each
      })
    )
    void window.x_tasks.move_task(task.id, null, list_id, position)
  }

  // The database removes subtasks along with their parent, so the screen drops them too.
  function remove_task(task: Task): void {
    set_tasks((current_tasks) => {
      const removed_ids = task_with_descendant_ids(task.id, current_tasks)
      return current_tasks.filter((each) => !removed_ids.has(each.id))
    })
    void window.x_tasks.remove_task(task.id)
  }

  // A task cannot be dropped onto itself or anything nested under it.
  function can_drop_task_on(target: Task): boolean {
    return dragged_task !== null && !task_with_descendant_ids(dragged_task.id, tasks).has(target.id)
  }

  function drop_task(target: Task, placement: DropPlacement): void {
    if (!dragged_task || !can_drop_task_on(target)) return
    const move = task_move_for_drop(dragged_task, target, placement, tasks)
    const moved_ids = task_with_descendant_ids(dragged_task.id, tasks)

    set_tasks((current_tasks) =>
      current_tasks
        .map((each) => {
          if (each.id === dragged_task.id) return { ...each, ...move }
          return moved_ids.has(each.id) ? { ...each, list_id: move.list_id } : each
        })
        .sort(by_position)
    )
    set_dragged_task(null)
    void window.x_tasks.move_task(dragged_task.id, move.parent_id, move.list_id, move.position)
  }

  // ==========================================================================
  // List changes
  // ==========================================================================

  async function add_list(name: string): Promise<void> {
    const added_list = await window.x_tasks.add_task_list(name)
    set_task_lists((current_lists) => [...current_lists, added_list])
    set_selected_view({ kind: 'list', list_id: added_list.id })
  }

  function remove_list(task_list: TaskList): void {
    if (!window.confirm(`Delete "${task_list.name}" and all of its tasks?`)) return

    set_task_lists((current_lists) => current_lists.filter((each) => each.id !== task_list.id))
    set_tasks((current_tasks) => current_tasks.filter((task) => task.list_id !== task_list.id))
    if (selected_view.kind === 'list' && selected_view.list_id === task_list.id) set_selected_view({ kind: 'all' })
    void window.x_tasks.remove_task_list(task_list.id)
  }

  function move_list(dragged: TaskList, target: TaskList, placement: 'before' | 'after'): void {
    const position = list_position_for_drop(dragged, target, placement, task_lists)
    set_task_lists((current_lists) =>
      current_lists.map((each) => (each.id === dragged.id ? { ...each, position } : each)).sort(by_position)
    )
    void window.x_tasks.move_task_list(dragged.id, position)
  }

  // ==========================================================================
  // Layout
  // ==========================================================================

  const visible_tasks = tasks.filter((task) => task_is_in_view(task, selected_view))
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length
  const task_tree = nest_tasks(visible_tasks, tasks)

  const selected_task = tasks.find((task) => task.id === selected_task_id) ?? null

  const task_actions: TaskActions = {
    can_add_subtasks: selected_view.kind !== 'completed',
    selected_task_id,
    on_select: (task) => set_selected_task_id(task.id),
    on_toggle: toggle_task,
    on_remove: remove_task,
    on_add_subtask: add_subtask,
    on_drag_start: set_dragged_task,
    on_drag_end: () => set_dragged_task(null),
    can_drop_on: can_drop_task_on,
    on_drop: drop_task
  }

  return (
    <div class={selected_task ? 'app has_detail' : 'app'}>
      <Sidebar
        tasks={tasks}
        task_lists={task_lists}
        selected_view={selected_view}
        on_select_view={set_selected_view}
        on_add_list={add_list}
        on_remove_list={remove_list}
        on_move_list={move_list}
      />

      <main class="task_pane">
        <header class="task_pane_header">
          <h1>{view_title(selected_view, task_lists)}</h1>
          <span class="remaining_count">{remaining_count} left</span>
        </header>

        {selected_view.kind !== 'completed' && (
          <form class="new_task_form" onSubmit={submit_new_task}>
            <input
              value={new_title}
              onInput={(event) => set_new_title(event.currentTarget.value)}
              placeholder="What needs doing?"
              autofocus
            />
            <button type="submit">Add</button>
          </form>
        )}

        <ul class="task_list">
          {task_tree.map((node) => (
            <TaskItem key={node.task.id} node={node} actions={task_actions} />
          ))}
        </ul>

        {visible_tasks.length === 0 && <p class="empty_message">Nothing here yet.</p>}
      </main>

      {selected_task && (
        <TaskDetail
          key={selected_task.id}
          task={selected_task}
          task_lists={task_lists}
          subtask_count={task_with_descendant_ids(selected_task.id, tasks).size - 1}
          on_toggle={toggle_task}
          on_rename={rename_task}
          on_set_notes={set_task_notes}
          on_move_to_list={move_task_to_list}
          on_remove={remove_task}
          on_close={() => set_selected_task_id(null)}
        />
      )}
    </div>
  )
}
