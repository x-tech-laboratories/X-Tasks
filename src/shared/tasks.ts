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
  add_task: (title: string) => Promise<Task>
  set_task_done: (task_id: string, is_done: boolean) => Promise<void>
  remove_task: (task_id: string) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'
