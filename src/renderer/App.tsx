import { useEffect, useState } from 'preact/hooks'

import type { Task, TaskList } from '@shared/tasks'
import { Sidebar } from './Sidebar'
import { list_id_for_new_task, task_is_in_view, view_title, type View } from './views'

// ============================================================================
// App
// ============================================================================

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [task_lists, set_task_lists] = useState<TaskList[]>([])
  const [selected_view, set_selected_view] = useState<View>({ kind: 'all' })
  const [new_title, set_new_title] = useState('')

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

    const added_task = await window.x_tasks.add_task(title, list_id_for_new_task(selected_view))
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_new_title('')
  }

  function toggle_task(task: Task): void {
    const is_done = !task.is_done
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, is_done } : each)))
    void window.x_tasks.set_task_done(task.id, is_done)
  }

  function remove_task(task: Task): void {
    set_tasks((current_tasks) => current_tasks.filter((each) => each.id !== task.id))
    void window.x_tasks.remove_task(task.id)
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

  // ==========================================================================
  // Layout
  // ==========================================================================

  const visible_tasks = tasks.filter((task) => task_is_in_view(task, selected_view))
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length

  return (
    <div class="app">
      <Sidebar
        tasks={tasks}
        task_lists={task_lists}
        selected_view={selected_view}
        on_select_view={set_selected_view}
        on_add_list={add_list}
        on_remove_list={remove_list}
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
          {visible_tasks.map((task) => (
            <li key={task.id} class={task.is_done ? 'task is_done' : 'task'}>
              <label>
                <input type="checkbox" checked={task.is_done} onChange={() => toggle_task(task)} />
                <span>{task.title}</span>
              </label>
              <button class="remove_button" onClick={() => remove_task(task)} aria-label="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>

        {visible_tasks.length === 0 && <p class="empty_message">Nothing here yet.</p>}
      </main>
    </div>
  )
}
