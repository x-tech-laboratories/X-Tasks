import { useEffect, useState } from 'preact/hooks'

import type { Task } from '@shared/tasks'

// ============================================================================
// App
// ============================================================================

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [new_title, set_new_title] = useState('')

  useEffect(() => {
    void window.x_tasks.list_tasks().then(set_tasks)
  }, [])

  async function submit_new_task(event: Event): Promise<void> {
    event.preventDefault()
    const title = new_title.trim()
    if (!title) return

    const added_task = await window.x_tasks.add_task(title)
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

  const remaining_count = tasks.filter((task) => !task.is_done).length

  return (
    <main class="app">
      <header class="app_header">
        <h1>X-Tasks</h1>
        <span class="remaining_count">{remaining_count} left</span>
      </header>

      <form class="new_task_form" onSubmit={submit_new_task}>
        <input
          value={new_title}
          onInput={(event) => set_new_title(event.currentTarget.value)}
          placeholder="What needs doing?"
          autofocus
        />
        <button type="submit">Add</button>
      </form>

      <ul class="task_list">
        {tasks.map((task) => (
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

      {tasks.length === 0 && <p class="empty_message">Nothing to do yet.</p>}
    </main>
  )
}
