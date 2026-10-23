// ============================================================================
// Task and tag
// ============================================================================

export interface Task {
  id: string
  title: string
  notes: string
  is_done: boolean
  created_at: string
  parent_id: string | null
  position: number
  tag_ids: string[]
}

export interface Tag {
  id: string
  name: string
  created_at: string
  parent_id: string | null
  position: number
}

// ============================================================================
// View
// ============================================================================

export type View =
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'completed' }
  | { kind: 'tag'; tag_id: string }

// ============================================================================
// Bridge contract
// ============================================================================

export interface TasksApi {
  list_tasks: () => Promise<Task[]>
  add_task: (title: string, parent_id: string | null, tag_ids: string[]) => Promise<Task>
  set_task_done: (task_id: string, is_done: boolean) => Promise<void>
  set_task_title: (task_id: string, title: string) => Promise<void>
  set_task_notes: (task_id: string, notes: string) => Promise<void>
  remove_task: (task_id: string) => Promise<void>
  move_task: (task_id: string, parent_id: string | null, position: number) => Promise<void>
  tag_task: (task_id: string, tag_id: string) => Promise<void>
  untag_task: (task_id: string, tag_id: string) => Promise<void>

  list_tags: () => Promise<Tag[]>
  add_tag: (name: string, parent_id: string | null) => Promise<Tag>
  remove_tag: (tag_id: string) => Promise<void>
  move_tag: (tag_id: string, parent_id: string | null, position: number) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const SET_TASK_TITLE_CHANNEL = 'tasks:set-title'
export const SET_TASK_NOTES_CHANNEL = 'tasks:set-notes'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'
export const MOVE_TASK_CHANNEL = 'tasks:move'
export const TAG_TASK_CHANNEL = 'tasks:tag'
export const UNTAG_TASK_CHANNEL = 'tasks:untag'

export const LIST_TAGS_CHANNEL = 'tags:list'
export const ADD_TAG_CHANNEL = 'tags:add'
export const REMOVE_TAG_CHANNEL = 'tags:remove'
export const MOVE_TAG_CHANNEL = 'tags:move'
