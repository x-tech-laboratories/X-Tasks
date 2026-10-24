// ============================================================================
// Task, tag and tag group
// ============================================================================

export interface Task {
  id: string
  title: string
  notes: string
  is_done: boolean
  // When the task was last ticked, as an ISO time, kept when a recurring task moves on; empty if never ticked or unticked since.
  done_at: string | null
  start_at: string | null
  due_at: string | null
  recurrence: string
  // The local day, as YYYY-MM-DD, the task was added to My Day; empty when it is not in My Day.
  my_day_on: string | null
  created_at: string
  parent_id: string | null
  position: number
  tag_ids: string[]
}

// Dates are local clock times, as YYYY-MM-DD or YYYY-MM-DDTHH:MM; recurrence is an RFC 5545 rule without the RRULE: prefix.
export type TaskSchedule = Pick<Task, 'start_at' | 'due_at' | 'recurrence'>

// One tick of a task, kept so streaks and reports can look back over every time it was done.
export interface Completion {
  task_id: string
  done_at: string
  // The task's due date, or start date without one, at the time it was ticked; empty when it had neither.
  occurrence_on: string | null
}

// How a change to a task's done state touches its completion log: a new entry, the latest taken away or moved to the new time, or none.
export type CompletionLogChange = { kind: 'add'; occurrence_on: string | null } | { kind: 'remove' } | { kind: 'retime' } | { kind: 'none' }

// A named set of tags, such as Area or Priority, shown as its own section in the sidebar.
export interface TagGroup {
  id: string
  name: string
  created_at: string
  position: number
  // When set, a task holds at most one tag from this group, such as a single priority.
  is_single_choice: boolean
  // When set, every tag in the group is a rule tag that applies itself; otherwise its tags are given by hand.
  is_rule: boolean
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
  // When set, the tag is never given by hand: it applies to every task this rule matches.
  rule: TagRule | null
  // A colour as #rrggbb that marks the tag wherever it shows, or empty for none.
  color: string | null
}

// The swatches offered when picking a tag colour; any other #rrggbb colour can be picked too.
export const TAG_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#db2777', '#64748b']

// ============================================================================
// Tag rule
// ============================================================================

// A rule matches a task when all, or any, of its conditions hold; with no conditions it matches every task.
export interface TagRule {
  match: 'all' | 'any'
  conditions: RuleCondition[]
}

export const EMPTY_RULE: TagRule = { match: 'all', conditions: [] }

export type DueCondition = 'overdue' | 'today' | 'within_days' | 'any' | 'none'

export type StartCondition = 'started' | 'not_started' | 'none'

export type RuleCondition =
  | { kind: 'status'; is_done: boolean }
  | { kind: 'tag'; tag_id: string; has_tag: boolean }
  | { kind: 'group'; group_id: string; has_tag: boolean }
  | { kind: 'due'; when: DueCondition; days: number }
  | { kind: 'start'; when: StartCondition }
  | { kind: 'completed_within'; days: number }
  | { kind: 'recurring'; is_recurring: boolean }
  | { kind: 'subtask'; is_subtask: boolean }
  | { kind: 'title'; text: string }

// ============================================================================
// View
// ============================================================================

export type View =
  | { kind: 'my_day' }
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'completed' }
  | { kind: 'reports' }
  | { kind: 'tag'; tag_ids: string[] }

// ============================================================================
// Bridge contract
// ============================================================================

export interface TasksApi {
  list_tasks: () => Promise<Task[]>
  add_task: (title: string, parent_id: string | null, tag_ids: string[], my_day_on: string | null) => Promise<Task>
  set_task_done: (task_id: string, is_done: boolean, done_at: string | null, log_change: CompletionLogChange) => Promise<void>
  set_task_title: (task_id: string, title: string) => Promise<void>
  set_task_notes: (task_id: string, notes: string) => Promise<void>
  set_task_schedule: (task_id: string, schedule: TaskSchedule) => Promise<void>
  set_task_my_day: (task_id: string, my_day_on: string | null) => Promise<void>
  remove_task: (task_id: string) => Promise<void>
  move_task: (task_id: string, parent_id: string | null, position: number) => Promise<void>
  tag_task: (task_id: string, tag_id: string) => Promise<void>
  untag_task: (task_id: string, tag_id: string) => Promise<void>
  list_completions: () => Promise<Completion[]>

  list_tag_groups: () => Promise<TagGroup[]>
  add_tag_group: (name: string, is_rule: boolean) => Promise<TagGroup>
  update_tag_group: (group_id: string, name: string, is_rule: boolean, is_single_choice: boolean) => Promise<void>
  remove_tag_group: (group_id: string) => Promise<void>
  move_tag_group: (group_id: string, position: number) => Promise<void>

  list_tags: () => Promise<Tag[]>
  add_tag: (name: string, group_id: string, parent_id: string | null, rule: TagRule | null, color: string | null) => Promise<Tag>
  update_tag: (tag_id: string, name: string, rule: TagRule | null, color: string | null) => Promise<void>
  remove_tag: (tag_id: string) => Promise<void>
  move_tag: (tag_id: string, parent_id: string | null, position: number) => Promise<void>

  // Calls the listener whenever another program changes the database; returns a function that stops listening.
  on_database_changed: (listener: () => void) => () => void
}

export const LIST_TASKS_CHANNEL = 'tasks:list'
export const ADD_TASK_CHANNEL = 'tasks:add'
export const SET_TASK_DONE_CHANNEL = 'tasks:set-done'
export const SET_TASK_TITLE_CHANNEL = 'tasks:set-title'
export const SET_TASK_NOTES_CHANNEL = 'tasks:set-notes'
export const SET_TASK_SCHEDULE_CHANNEL = 'tasks:set-schedule'
export const SET_TASK_MY_DAY_CHANNEL = 'tasks:set-my-day'
export const REMOVE_TASK_CHANNEL = 'tasks:remove'
export const MOVE_TASK_CHANNEL = 'tasks:move'
export const TAG_TASK_CHANNEL = 'tasks:tag'
export const UNTAG_TASK_CHANNEL = 'tasks:untag'
export const LIST_COMPLETIONS_CHANNEL = 'tasks:list-completions'

export const LIST_TAG_GROUPS_CHANNEL = 'tag-groups:list'
export const ADD_TAG_GROUP_CHANNEL = 'tag-groups:add'
export const REMOVE_TAG_GROUP_CHANNEL = 'tag-groups:remove'
export const UPDATE_TAG_GROUP_CHANNEL = 'tag-groups:update'
export const MOVE_TAG_GROUP_CHANNEL = 'tag-groups:move'

export const LIST_TAGS_CHANNEL = 'tags:list'
export const ADD_TAG_CHANNEL = 'tags:add'
export const UPDATE_TAG_CHANNEL = 'tags:update'
export const REMOVE_TAG_CHANNEL = 'tags:remove'
export const MOVE_TAG_CHANNEL = 'tags:move'

export const DATABASE_CHANGED_CHANNEL = 'database:changed'
