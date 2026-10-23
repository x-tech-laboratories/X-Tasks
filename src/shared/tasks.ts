// ============================================================================
// Task and list
// ============================================================================

export interface Task {
  id: string
  title: string
  is_done: boolean
  created_at: string
  list_id: string | null
}

export interface TaskList {
  id: string
  name: string
  created_at: string
}

// ============================================================================
// Bridge contract
// ============================================================================

export interface TasksApi {
  list_tasks: () => Promise<Task[]>
  add_task: (title: string, list_id: string | null) => Promise<Task>
  set_task_done: (task_id: string, is_done: boolean) => Promise<void>
  remove_task: (task_id: string) => Promise<void>

  list_task_lists: () => Promise<TaskList[]>
  add_task_list: (name: string) => Promise<TaskList>
  remove_task_list: (list_id: string) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'

export const LIST_TASK_LISTS_CHANNEL = 'lists:list'
export const ADD_TASK_LIST_CHANNEL = 'lists:add'
export const REMOVE_TASK_LIST_CHANNEL = 'lists:remove'
