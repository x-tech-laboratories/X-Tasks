import type { Settings, TagMatch, TagScope, TagSelection, TaskDateField } from '@shared/settings'
import { task_and_ancestors, type Tag, type TagGroup, type Task, type View } from '@shared/tasks'
import { has_time } from '@x-tech-laboratories/x-libs/dates'
import { task_date_of } from '@shared/schedule'
import { rule_matches } from './rules'
import { nest, path_names, subtree_ids, type TreeNode } from '@x-tech-laboratories/x-libs/web/tree'

export type { View }

// ============================================================================
// View
// ============================================================================

export const BUILT_IN_VIEWS: { view: View; label: string }[] = [
  { view: { kind: 'my_day' }, label: 'My Day' },
  { view: { kind: 'upcoming' }, label: 'Upcoming' },
  { view: { kind: 'all' }, label: 'All tasks' },
  { view: { kind: 'active' }, label: 'Active' },
  { view: { kind: 'completed' }, label: 'Completed' },
  { view: { kind: 'reports' }, label: 'Reports' },
  { view: { kind: 'history' }, label: 'History' }
]

// ============================================================================
// Helpers
// ============================================================================

export function is_same_view(first: View, second: View): boolean {
  if (first.kind === 'tag' && second.kind === 'tag') {
    return first.tag_ids.length === second.tag_ids.length && first.tag_ids.every((tag_id) => second.tag_ids.includes(tag_id))
  }
  return first.kind === second.kind
}

export function is_tag_selected(view: View | null, tag_id: string): boolean {
  return view?.kind === 'tag' && view.tag_ids.includes(tag_id)
}

// Clicking a selected tag takes it out; any other tag joins, replacing the tags the selection mode leaves no room for.
export function view_with_tag_toggled(view: View, tag: Tag, tags: Tag[], selection: TagSelection): View {
  const current_ids = view.kind === 'tag' ? view.tag_ids : []
  const kept_ids = current_ids.filter((tag_id) => {
    if (tag_id === tag.id) return false
    if (selection === 'single') return false
    if (selection === 'one_per_group') return tags.find((each) => each.id === tag_id)?.group_id !== tag.group_id
    return true
  })
  const tag_ids = current_ids.includes(tag.id) ? current_ids.filter((tag_id) => tag_id !== tag.id) : [...kept_ids, tag.id]
  return tag_ids.length > 0 ? { kind: 'tag', tag_ids } : { kind: 'all' }
}

// A task matches every selected tag, or at least one, through the tag itself or, unless scoped to its own, any tag below it; subtasks follow their parent into My Day and Upcoming.
export function task_is_in_view(
  task: Task, view: View, all_tasks: Task[], tags: Tag[], my_day_since: string, tag_match: TagMatch = 'all', tag_scope: TagScope = 'subtags', date_field: TaskDateField = 'due'
): boolean {
  switch (view.kind) {
    case 'my_day': return task_and_ancestors(task, all_tasks).some((each) => is_in_my_day(each, my_day_since))
    case 'upcoming': return !task.is_done && task_and_ancestors(task, all_tasks).some((each) => !each.is_done && task_date_of(each, date_field) !== null)
    case 'all': return true
    case 'active': return !task.is_done
    case 'completed': return task.is_done
    case 'reports': return false
    case 'history': return false
    case 'tag': {
      const chain_tag_ids = chain_tag_ids_of(task, all_tasks)
      const matched_ids = (tag_id: string) => (tag_scope === 'own' ? [tag_id] : [...subtree_ids(tag_id, tags)])
      const matches = (tag_id: string) => matched_ids(tag_id).some((id) => task_has_tag(task, id, all_tasks, chain_tag_ids, tags))
      return tag_match === 'any' ? view.tag_ids.some(matches) : view.tag_ids.every(matches)
    }
  }
}

// A plain tag is held by the task or a task above it; a rule tag is held whenever its rule matches.
export function task_has_tag(task: Task, tag_id: string, all_tasks: Task[], chain_tag_ids: Set<string>, tags: Tag[]): boolean {
  const rule = tags.find((tag) => tag.id === tag_id)?.rule
  return rule ? rule_matches(rule, task, all_tasks, chain_tag_ids, tags) : chain_tag_ids.has(tag_id)
}

// The task's own tags and those of every task above it.
export function chain_tag_ids_of(task: Task, all_tasks: Task[]): Set<string> {
  return new Set(task_and_ancestors(task, all_tasks).flatMap((each) => each.tag_ids))
}

// The rule tags whose rules match the task right now.
export function rule_tags_of(task: Task, all_tasks: Task[], tags: Tag[]): Tag[] {
  const chain_tag_ids = chain_tag_ids_of(task, all_tasks)
  return tags.filter((tag) => tag.rule && rule_matches(tag.rule, task, all_tasks, chain_tag_ids, tags))
}

// ============================================================================
// My Day
// ============================================================================

// The earliest day whose My Day tasks still count: today when My Day clears itself, or any day when it does not.
export function my_day_since(settings: Settings, today: string): string {
  return settings.auto_clear_my_day ? today : ''
}

export function is_in_my_day(task: Task, my_day_since: string): boolean {
  return task.my_day_on !== null && task.my_day_on >= my_day_since
}

// The minute a task comes due by its chosen date; a date without a time comes due at midnight.
function due_moment(task: Task, date_field: TaskDateField): string | null {
  const task_date = task_date_of(task, date_field)
  if (task_date === null) return null
  return has_time(task_date) ? task_date : `${task_date}T00:00`
}

// A task belongs in My Day once its date and time have come and it is still open.
export function is_due_by(task: Task, now: string, date_field: TaskDateField): boolean {
  const moment = due_moment(task, date_field)
  return !task.is_done && moment !== null && moment <= now
}

// A task whose chosen date falls on a later day than today.
export function falls_after_today(task: Task, today: string, date_field: TaskDateField): boolean {
  const task_date = task_date_of(task, date_field)
  return task_date !== null && task_date.slice(0, 10) > today
}

// An open task whose date and time fell after one minute and no later than another.
export function comes_due_between(task: Task, after: string, now: string, date_field: TaskDateField): boolean {
  const moment = due_moment(task, date_field)
  return is_due_by(task, now, date_field) && moment !== null && moment > after
}

// New tasks added while My Day is shown go into it.
export function my_day_for_new_task(view: View, today: string): string | null {
  return view.kind === 'my_day' ? today : null
}

export function view_title(view: View, tags: Tag[]): string {
  if (view.kind === 'tag') return view.tag_ids.map((tag_id) => tags.find((tag) => tag.id === tag_id)?.name ?? 'Tag').join(' · ')
  return BUILT_IN_VIEWS.find((entry) => entry.view.kind === view.kind)!.label
}

// Older saved views name one list or one tag; tags deleted since are dropped, and anything else unknown falls back to all tasks.
export function launch_view(settings: Settings, tags: Tag[]): View {
  if (settings.launch_view !== 'last') {
    return BUILT_IN_VIEWS.some(({ view }) => view.kind === settings.launch_view) ? { kind: settings.launch_view } : { kind: 'all' }
  }

  const saved = settings.last_view as View | { kind: 'list'; list_id: string } | { kind: 'tag'; tag_id: string }
  if (saved.kind === 'list') return view_without_missing_tags([saved.list_id], tags)
  if ('tag_id' in saved) return view_without_missing_tags([saved.tag_id], tags)
  if (saved.kind === 'tag') return view_without_missing_tags(saved.tag_ids, tags)
  return BUILT_IN_VIEWS.some((entry) => entry.view.kind === saved.kind) ? saved : { kind: 'all' }
}

// A view named in the page address opens instead of the launch view: a built-in one such as ?view=my_day, or tags by name such as ?view=Work,Home.
export function view_from_address(search: string, tags: Tag[]): View | null {
  const named = new URLSearchParams(search).get('view')?.trim()
  if (!named) return null
  const built_in = BUILT_IN_VIEWS.find(({ view }) => view.kind === named)
  if (built_in) return built_in.view

  const tag_ids = named.split(',').flatMap((name) => tags.filter((tag) => tag.name.toLowerCase() === name.trim().toLowerCase()).slice(0, 1).map((tag) => tag.id))
  return tag_ids.length > 0 ? { kind: 'tag', tag_ids } : null
}

function view_without_missing_tags(tag_ids: string[], tags: Tag[]): View {
  const kept_ids = tag_ids.filter((tag_id) => tags.some((tag) => tag.id === tag_id))
  return kept_ids.length > 0 ? { kind: 'tag', tag_ids: kept_ids } : { kind: 'all' }
}

// New tasks carry the selected plain tags, but only the first from a one-tag-per-task group; rule tags apply by themselves.
export function tag_ids_for_new_task(view: View, tags: Tag[], tag_groups: TagGroup[]): string[] {
  if (view.kind !== 'tag') return []
  const filled_group_ids = new Set<string>()

  return view.tag_ids.filter((tag_id) => {
    const tag = tags.find((each) => each.id === tag_id)
    if (!tag || tag.rule) return false
    if (!tag_groups.find((group) => group.id === tag.group_id)?.is_single_choice) return true
    if (filled_group_ids.has(tag.group_id)) return false
    filled_group_ids.add(tag.group_id)
    return true
  })
}

// Deleted tags leave the filter, and an empty filter falls back to all tasks.
export function view_without_tags(view: View, removed_ids: Set<string>): View {
  if (view.kind !== 'tag') return view
  const kept_ids = view.tag_ids.filter((tag_id) => !removed_ids.has(tag_id))
  if (kept_ids.length === view.tag_ids.length) return view
  return kept_ids.length > 0 ? { kind: 'tag', tag_ids: kept_ids } : { kind: 'all' }
}

// ============================================================================
// Trees
// ============================================================================

// Names a tag by its whole branch, such as "Work › Clients".
export function tag_path(tag: Tag, tags: Tag[]): string {
  return path_names(tag, tags, (each) => each.name).join(' › ')
}

// Hands the tag's colour to its styles as --item-color, or nothing when it has none.
export function tag_color_style(tag: Tag): Record<string, string> | undefined {
  return tag.color ? { '--item-color': tag.color } : undefined
}

// Puts the tag's icon in front of the text that names it, when it has one.
export function with_icon(tag: Tag, text: string): string {
  return tag.icon ? `${tag.icon} ${text}` : text
}

// ============================================================================
// Nesting
// ============================================================================

export interface TaskNode {
  task: Task
  children: TaskNode[]
}

// Each task sits under its nearest ancestor that is also shown, or at the top when none is.
export function nest_tasks(visible_tasks: Task[], all_tasks: Task[]): TaskNode[] {
  const as_task_nodes = (nodes: TreeNode<Task>[]): TaskNode[] => nodes.map((node) => ({ task: node.item, children: as_task_nodes(node.children) }))
  return as_task_nodes(nest(visible_tasks, all_tasks))
}
