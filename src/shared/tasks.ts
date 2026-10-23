// ============================================================================
// Task, tag and tag group
// ============================================================================

export interface Task {
  id: string
  title: string
  notes: string
  is_done: boolean
  start_at: string | null
  due_at: string | null
  recurrence: string
  created_at: string
  parent_id: string | null
  position: number
  tag_ids: string[]
}

// Dates are local clock times, as YYYY-MM-DD or YYYY-MM-DDTHH:MM; recurrence is an RFC 5545 rule without the RRULE: prefix.
export type TaskSchedule = Pick<Task, 'start_at' | 'due_at' | 'recurrence'>

// A named set of tags, such as Area or Priority, shown as its own section in the sidebar.
export interface TagGroup {
  id: string
  name: string
  created_at: string
  position: number
  // When set, a task holds at most one tag from this group, such as a single priority.
  is_single_choice: boolean
}

// The preset Priority group, whose tag shows on task rows as its own label.
export const PRIORITY_GROUP_ID = 'priority'

export interface Tag {
  id: string
  name: string
  created_at: string
  group_id: string
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
  set_task_schedule: (task_id: string, schedule: TaskSchedule) => Promise<void>
  remove_task: (task_id: string) => Promise<void>
  move_task: (task_id: string, parent_id: string | null, position: number) => Promise<void>
  tag_task: (task_id: string, tag_id: string) => Promise<void>
  untag_task: (task_id: string, tag_id: string) => Promise<void>

  list_tag_groups: () => Promise<TagGroup[]>
  add_tag_group: (name: string) => Promise<TagGroup>
  remove_tag_group: (group_id: string) => Promise<void>
  set_tag_group_single_choice: (group_id: string, is_single_choice: boolean) => Promise<void>

  list_tags: () => Promise<Tag[]>
  add_tag: (name: string, group_id: string, parent_id: string | null) => Promise<Tag>
  remove_tag: (tag_id: string) => Promise<void>
  move_tag: (tag_id: string, parent_id: string | null, position: number) => Promise<void>
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const SET_TASK_TITLE_CHANNEL = 'tasks:set-title'
export const SET_TASK_NOTES_CHANNEL = 'tasks:set-notes'
export const SET_TASK_SCHEDULE_CHANNEL = 'tasks:set-schedule'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'
export const MOVE_TASK_CHANNEL = 'tasks:move'
export const TAG_TASK_CHANNEL = 'tasks:tag'
export const UNTAG_TASK_CHANNEL = 'tasks:untag'

export const LIST_TAG_GROUPS_CHANNEL = 'tag-groups:list'
export const ADD_TAG_GROUP_CHANNEL = 'tag-groups:add'
export const REMOVE_TAG_GROUP_CHANNEL = 'tag-groups:remove'
export const SET_TAG_GROUP_SINGLE_CHOICE_CHANNEL = 'tag-groups:set-single-choice'

export const LIST_TAGS_CHANNEL = 'tags:list'
export const ADD_TAG_CHANNEL = 'tags:add'
export const REMOVE_TAG_CHANNEL = 'tags:remove'
export const MOVE_TAG_CHANNEL = 'tags:move'
