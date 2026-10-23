// ============================================================================
// Task and list
// ============================================================================

export interface Task {
  id: string
  title: string
  notes: string
  is_done: boolean
  created_at: string
  list_id: string | null
  parent_id: string | null
  position: number
}

export interface TaskList {
  id: string
  name: string
  created_at: string
  position: number
}

// ============================================================================
// Bridge contract
// ============================================================================

export interface TasksApi {
  list_tasks: () => Promise<Task[]>
  add_task: (title: string, list_id: string | null, parent_id: string | null) => Promise<Task>
  set_task_done: (task_id: string, is_done: boolean) => Promise<void>
  set_task_title: (task_id: string, title: string) => Promise<void>
  set_task_notes: (task_id: string, notes: string) => Promise<void>
  remove_task: (task_id: string) => Promise<void>
  move_task: (task_id: string, parent_id: string | null, list_id: string | null, position: number) => Promise<void>

  list_task_lists: () => Promise<TaskList[]>
  add_task_list: (name: string) => Promise<TaskList>
  remove_task_list: (list_id: string) => Promise<void>
  move_task_list: (list_id: string, position: number) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const SET_TASK_TITLE_CHANNEL = 'tasks:set-title'
export const SET_TASK_NOTES_CHANNEL = 'tasks:set-notes'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'
export const MOVE_TASK_CHANNEL = 'tasks:move'

export const LIST_TASK_LISTS_CHANNEL = 'lists:list'
export const ADD_TASK_LIST_CHANNEL = 'lists:add'
export const REMOVE_TASK_LIST_CHANNEL = 'lists:remove'
export const MOVE_TASK_LIST_CHANNEL = 'lists:move'
