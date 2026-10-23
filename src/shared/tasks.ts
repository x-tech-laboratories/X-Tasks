// ============================================================================
// Task
// ============================================================================

export interface Task {
  id: string
  title: string
  is_done: boolean
  created_at: string
}

// ============================================================================
// Bridge contract
// ============================================================================

export interface TasksApi {
  list_tasks: () => Promise<Task[]>
  save_tasks: (tasks: Task[]) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const SAVE_TASKS_CHANNEL = 'tasks:save'
