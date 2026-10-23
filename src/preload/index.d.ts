import type { TasksApi } from '../shared/tasks'

declare global {
  interface Window {
    x_tasks: TasksApi
  }
}

export {}
