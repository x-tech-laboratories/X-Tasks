import type { Settings, TagMatch, TagScope, TagSelection, TaskDateField } from '@shared/settings'
import { type Tag, type TagGroup, type Task, type View } from '@shared/tasks'
import { has_time, task_date_of } from '@shared/schedule'
import { rule_matches } from './rules'

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
  { view: { kind: 'reports' }, label: 'Reports' }
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

// A task matches every selected tag, or at least one, through the tag itself or, unless scoped to its own, any tag below it; subtasks follow their parent into My Day.
export function task_is_in_view(
  task: Task, view: View, all_tasks: Task[], tags: Tag[], my_day_since: string, tag_match: TagMatch = 'all', tag_scope: TagScope = 'subtags', date_field: TaskDateField = 'due'
): boolean {
  switch (view.kind) {
    case 'my_day': return task_and_ancestors(task, all_tasks).some((each) => is_in_my_day(each, my_day_since))
    case 'upcoming': return !task.is_done && task_date_of(task, date_field) !== null
    case 'all': return true
    case 'active': return !task.is_done
    case 'completed': return task.is_done
    case 'reports': return false
    case 'tag': {
      const chain_tag_ids = chain_tag_ids_of(task, all_tasks)
      const matched_ids = (tag_id: string) => (tag_scope === 'own' ? [tag_id] : [...subtree_ids(tag_id, tags)])
      const matches = (tag_id: string) => matched_ids(tag_id).some((id) => task_has_tag(task, id, all_tasks, chain_tag_ids, tags))
      return tag_match === 'any' ? view.tag_ids.some(matches) : view.tag_ids.every(matches)
    }
  }
}

// A plain tag is held by the task or a task above it; a rule tag is held whenever its rule matches.
function task_has_tag(task: Task, tag_id: string, all_tasks: Task[], chain_tag_ids: Set<string>, tags: Tag[]): boolean {
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

interface TreeItem {
  id: string
  parent_id: string | null
  position: number
}

export function children_of<Item extends TreeItem>(parent_id: string | null, items: Item[]): Item[] {
  return items.filter((item) => item.parent_id === parent_id)
}

// The item itself plus everything below it, at any depth.
export function subtree_ids(item_id: string, items: TreeItem[]): Set<string> {
  const ids = new Set([item_id])

  for (const id of ids) {
    for (const child of children_of(id, items)) ids.add(child.id)
  }

  return ids
}

function task_and_ancestors(task: Task, all_tasks: Task[]): Task[] {
  const chain = [task]
  let parent = all_tasks.find((each) => each.id === task.parent_id)

  while (parent && !chain.includes(parent)) {
    chain.push(parent)
    const parent_id = parent.parent_id
    parent = all_tasks.find((each) => each.id === parent_id)
  }

  return chain
}

// Names a tag by its whole branch, such as "Work › Clients".
export function tag_path(tag: Tag, tags: Tag[]): string {
  const parent = tags.find((each) => each.id === tag.parent_id)
  return parent ? `${tag_path(parent, tags)} › ${tag.name}` : tag.name
}

// Hands the tag's colour to its styles as --tag-color, or nothing when it has none.
export function tag_color_style(tag: Tag): Record<string, string> | undefined {
  return tag.color ? { '--tag-color': tag.color } : undefined
}

// Puts the tag's icon in front of the text that names it, when it has one.
export function with_icon(tag: Tag, text: string): string {
  return tag.icon ? `${tag.icon} ${text}` : text
}

// The last character in the text, counting an emoji and its modifiers as one, or null when the text is blank.
export function last_character(text: string): string | null {
  const characters = [...new Intl.Segmenter().segment(text.trim())]
  return characters.at(-1)?.segment ?? null
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
  const task_by_id = new Map(all_tasks.map((task) => [task.id, task]))
  const node_by_id = new Map(visible_tasks.map((task) => [task.id, { task, children: [] as TaskNode[] }]))
  const top_nodes: TaskNode[] = []

  for (const node of node_by_id.values()) {
    let ancestor_id = node.task.parent_id
    while (ancestor_id && !node_by_id.has(ancestor_id)) ancestor_id = task_by_id.get(ancestor_id)?.parent_id ?? null

    if (ancestor_id) node_by_id.get(ancestor_id)!.children.push(node)
    else top_nodes.push(node)
  }

  return top_nodes
}

// ============================================================================
// Dragging
// ============================================================================

export type DropPlacement = 'before' | 'after' | 'inside'

export interface TreeMove {
  parent_id: string | null
  position: number
}

export type SidePlacement = 'before' | 'after'

// The top half of an element drops before it, the bottom half after it.
export function drop_side(event: DragEvent): SidePlacement {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY - box.top < box.height / 2 ? 'before' : 'after'
}

// The top and bottom quarters of a row drop beside it, the middle drops into it.
export function drop_placement(event: DragEvent, allow_inside: boolean): DropPlacement {
  if (!allow_inside) return drop_side(event)
  const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const fraction = (event.clientY - row.top) / row.height
  if (fraction < 0.25) return 'before'
  if (fraction > 0.75) return 'after'
  return 'inside'
}

// Picks a position between the neighbours at the drop point, so only the moved item changes.
function position_beside<Item extends { id: string; position: number }>(
  siblings: Item[],
  target: Item,
  placement: 'before' | 'after'
): number {
  const index = siblings.findIndex((sibling) => sibling.id === target.id)
  const neighbour = siblings[placement === 'before' ? index - 1 : index + 1]
  if (!neighbour) return placement === 'before' ? target.position - 1 : target.position + 1
  return (target.position + neighbour.position) / 2
}

export function move_for_drop<Item extends TreeItem>(dragged: Item, target: Item, placement: DropPlacement, items: Item[]): TreeMove {
  const others = items.filter((item) => item.id !== dragged.id)

  if (placement === 'inside') {
    const last_child_position = Math.max(target.position, ...children_of(target.id, others).map((item) => item.position))
    return { parent_id: target.id, position: last_child_position + 1 }
  }

  return { parent_id: target.parent_id, position: position_beside(children_of(target.parent_id, others), target, placement) }
}

// Moves several items together, keeping their order: inside the target after its last child, or in a run between it and its neighbour.
export function moves_for_drop<Item extends TreeItem>(dragged: Item[], target: Item, placement: DropPlacement, items: Item[]): TreeMove[] {
  const dragged_ids = new Set(dragged.map((item) => item.id))
  const others = items.filter((item) => !dragged_ids.has(item.id))

  if (placement === 'inside') {
    const last_child_position = Math.max(target.position, ...children_of(target.id, others).map((item) => item.position))
    return dragged.map((_, index) => ({ parent_id: target.id, position: last_child_position + index + 1 }))
  }

  const siblings = children_of(target.parent_id, others).sort(by_position)
  const index = siblings.findIndex((sibling) => sibling.id === target.id)
  const neighbour = siblings[placement === 'before' ? index - 1 : index + 1]
  const low = placement === 'before' ? (neighbour?.position ?? target.position - 1) : target.position
  const high = placement === 'before' ? target.position : (neighbour?.position ?? target.position + 1)
  return dragged.map((_, index) => ({ parent_id: target.parent_id, position: low + ((high - low) * (index + 1)) / (dragged.length + 1) }))
}

// For a flat list such as the tag groups, where items only move before or after each other.
export function position_for_drop<Item extends { id: string; position: number }>(
  dragged: Item,
  target: Item,
  placement: SidePlacement,
  items: Item[]
): number {
  return position_beside(items.filter((item) => item.id !== dragged.id), target, placement)
}

export function by_position<Item extends { position: number }>(first: Item, second: Item): number {
  return first.position - second.position
}
