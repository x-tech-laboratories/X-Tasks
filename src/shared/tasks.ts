import type { TaskRelationship } from './settings'

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
  // The links this task makes to others; each other task sees the same link by the relationship's inverse name.
  links: TaskLink[]
}

// This task has the relationship to the other task, as in "this task waits on the other".
export interface TaskLink {
  other_id: string
  relationship_id: string
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

// The preset group of rule tags, such as Actionable and Untagged, that a new database starts with.
export const PRESET_FILTERS_GROUP_ID = 'filters'

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
  // An emoji shown before the tag's name wherever it shows, or empty for none.
  icon: string | null
  // When cleared, the tag is left off task rows, though it still filters and shows in the sidebar and the details panel.
  shows_on_rows: boolean
}

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

export type StartCondition = 'started' | 'not_started' | 'passed_or_none' | 'none'

export type RuleCondition =
  | { kind: 'status'; is_done: boolean }
  | { kind: 'tag'; tag_id: string; has_tag: boolean }
  | { kind: 'group'; group_id: string; has_tag: boolean }
  | { kind: 'due'; when: DueCondition; days: number }
  | { kind: 'start'; when: StartCondition }
  | { kind: 'completed_within'; days: number }
  | { kind: 'recurring'; is_recurring: boolean }
  | { kind: 'subtask'; is_subtask: boolean }
  | { kind: 'open_subtasks'; has_open: boolean }
  | { kind: 'tagged'; is_tagged: boolean }
  | { kind: 'title'; text: string }
  | { kind: 'link'; relationship_id: string; direction: LinkDirection; target: LinkTarget; task_id: string; has_link: boolean }

// Which way a link condition reads a relationship: by its name, by its inverse name, or either way; an empty relationship means any.
export type LinkDirection = 'forward' | 'inverse' | 'either'

// What a link condition counts the links to: any task, open tasks only, or the one task it names.
export type LinkTarget = 'any' | 'open' | 'task'

// ============================================================================
// View
// ============================================================================

export type View =
  | { kind: 'my_day' }
  | { kind: 'upcoming' }
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'completed' }
  | { kind: 'reports' }
  | { kind: 'tag'; tag_ids: string[] }

// ============================================================================
// Relationships
// ============================================================================

// A link between two tasks a relationship makes, seen from one of them, named as that task sees it.
export interface SeenLink {
  other: Task
  relationship_id: string
  is_inverse: boolean
}

// Every link touching the task, whichever of the two tasks made it.
export function links_of(task: Task, tasks: Task[]): SeenLink[] {
  const by_id = new Map(tasks.map((each) => [each.id, each]))
  const made = task.links.flatMap((link) => {
    const other = by_id.get(link.other_id)
    return other ? [{ other, relationship_id: link.relationship_id, is_inverse: false }] : []
  })
  const received = tasks.flatMap((other) =>
    other.links.filter((link) => link.other_id === task.id).map((link) => ({ other, relationship_id: link.relationship_id, is_inverse: true }))
  )
  return [...made, ...received]
}

// Whether a link of this relationship, read this way, makes the task wait on the other.
export function link_waits(relationship: TaskRelationship | undefined, is_inverse: boolean): boolean {
  if (!relationship || relationship.waiter === 'none') return false
  return (relationship.waiter === 'first') !== is_inverse
}

// For each task, the ids of the tasks it waits on through relationships that make one task wait.
export function waits_on_by_task(tasks: Task[], relationships: TaskRelationship[]): Map<string, string[]> {
  const by_id = new Map(relationships.map((relationship) => [relationship.id, relationship]))
  const waits_on = new Map<string, string[]>()
  const add = (waiter_id: string, waited_id: string) => waits_on.set(waiter_id, [...(waits_on.get(waiter_id) ?? []), waited_id])

  for (const task of tasks) {
    for (const link of task.links) {
      const relationship = by_id.get(link.relationship_id)
      if (link_waits(relationship, false)) add(task.id, link.other_id)
      else if (link_waits(relationship, true)) add(link.other_id, task.id)
    }
  }
  return waits_on
}

// A task cannot be linked to itself, nor wait on any task that already waits on it, directly or through others.
export function can_link(task_id: string, other_id: string, relationship: TaskRelationship | undefined, is_inverse: boolean, tasks: Task[], relationships: TaskRelationship[]): boolean {
  if (task_id === other_id) return false
  if (!relationship || relationship.waiter === 'none') return true
  const [waiter_id, waited_id] = link_waits(relationship, is_inverse) ? [task_id, other_id] : [other_id, task_id]

  // The two tasks' current link is replaced, so it cannot count towards a loop.
  const others = tasks.map((each) =>
    each.id === task_id || each.id === other_id
      ? { ...each, links: each.links.filter((link) => link.other_id !== task_id && link.other_id !== other_id) }
      : each
  )
  const waits_on = waits_on_by_task(others, relationships)
  const waiting = [waited_id]
  const seen = new Set<string>()
  while (waiting.length > 0) {
    const current_id = waiting.pop()!
    if (current_id === waiter_id) return false
    if (seen.has(current_id)) continue
    seen.add(current_id)
    waiting.push(...(waits_on.get(current_id) ?? []))
  }
  return true
}

// ============================================================================
// Task links
// ============================================================================

// A link such as x-tasks://task/<id> opens that task in the desktop app from any other program.
export const TASK_LINK_SCHEME = 'x-tasks'

const TASK_LINK_PATTERN = /^x-tasks:\/\/task\/([\w-]+)\/?$/i

export function task_link(task_id: string): string {
  return `${TASK_LINK_SCHEME}://task/${task_id}`
}

// The task a link names, or null when the text is not a task link.
export function task_id_from_link(text: string): string | null {
  return TASK_LINK_PATTERN.exec(text)?.[1] ?? null
}

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
  // Replaces whatever link the two tasks already had, in either direction.
  link_tasks: (task_id: string, other_id: string, relationship_id: string) => Promise<void>
  unlink_tasks: (task_id: string, other_id: string) => Promise<void>
  list_completions: () => Promise<Completion[]>

  list_tag_groups: () => Promise<TagGroup[]>
  add_tag_group: (name: string, is_rule: boolean) => Promise<TagGroup>
  update_tag_group: (group_id: string, name: string, is_rule: boolean, is_single_choice: boolean) => Promise<void>
  remove_tag_group: (group_id: string) => Promise<void>
  move_tag_group: (group_id: string, position: number) => Promise<void>

  list_tags: () => Promise<Tag[]>
  add_tag: (name: string, group_id: string, parent_id: string | null, rule: TagRule | null, color: string | null, icon: string | null, shows_on_rows: boolean) => Promise<Tag>
  update_tag: (tag_id: string, name: string, rule: TagRule | null, color: string | null, icon: string | null, shows_on_rows: boolean) => Promise<void>
  remove_tag: (tag_id: string) => Promise<void>
  move_tag: (tag_id: string, parent_id: string | null, position: number) => Promise<void>

  // Calls the listener whenever another program changes the database; returns a function that stops listening.
  on_database_changed: (listener: () => void) => () => void
  // Only in the desktop app: calls the listener with each task a link opens, starting with one that launched the app.
  on_open_task?: (listener: (task_id: string) => void) => () => void
}

// The page asks for the task a link launched the app with once it is ready to show it.
export const TAKE_LAUNCH_TASK_CHANNEL = 'links:take-launch-task'
