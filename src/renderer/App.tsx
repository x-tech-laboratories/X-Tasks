import { useEffect, useState } from 'preact/hooks'

import type { Task } from '@shared/tasks'

// ============================================================================
// Task changes
// ============================================================================

function make_task(title: string): Task {
  return { id: crypto.randomUUID(), title, is_done: false, created_at: new Date().toISOString() }
}

function toggle_task(tasks: Task[], task_id: string): Task[] {
  return tasks.map((task) => (task.id === task_id ? { ...task, is_done: !task.is_done } : task))
}

function remove_task(tasks: Task[], task_id: string): Task[] {
  return tasks.filter((task) => task.id !== task_id)
}

// ============================================================================
// App
// ============================================================================

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [new_title, set_new_title] = useState('')

  useEffect(() => {
    void window.x_tasks.list_tasks().then(set_tasks)
  }, [])

  function update_tasks(next_tasks: Task[]): void {
    set_tasks(next_tasks)
    void window.x_tasks.save_tasks(next_tasks)
  }

  function submit_new_task(event: Event): void {
    event.preventDefault()
    const title = new_title.trim()
    if (!title) return

    update_tasks([...tasks, make_task(title)])
    set_new_title('')
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
              <input type="checkbox" checked={task.is_done} onChange={() => update_tasks(toggle_task(tasks, task.id))} />
              <span>{task.title}</span>
            </label>
            <button class="remove_button" onClick={() => update_tasks(remove_task(tasks, task.id))} aria-label="Remove">
              ×
            </button>
          </li>
        ))}
      </ul>

      {tasks.length === 0 && <p class="empty_message">Nothing to do yet.</p>}
    </main>
  )
}
