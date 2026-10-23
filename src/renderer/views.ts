import type { Settings } from '@shared/settings'
import { PRIORITY_GROUP_ID, type Tag, type Task, type View } from '@shared/tasks'

export type { View }

// ============================================================================
// View
// ============================================================================

export const BUILT_IN_VIEWS: { view: View; label: string }[] = [
  { view: { kind: 'all' }, label: 'All tasks' },
  { view: { kind: 'active' }, label: 'Active' },
  { view: { kind: 'completed' }, label: 'Completed' }
]

// ============================================================================
// Helpers
// ============================================================================

export function is_same_view(first: View, second: View): boolean {
  if (first.kind === 'tag' && second.kind === 'tag') return first.tag_id === second.tag_id
  return first.kind === second.kind
}

// A tag view shows tasks carrying that tag or any tag below it, along with their subtasks.
export function task_is_in_view(task: Task, view: View, all_tasks: Task[], tags: Tag[]): boolean {
  switch (view.kind) {
    case 'all': return true
    case 'active': return !task.is_done
    case 'completed': return task.is_done
    case 'tag': {
      const tag_ids = subtree_ids(view.tag_id, tags)
      return task_and_ancestors(task, all_tasks).some((each) => each.tag_ids.some((tag_id) => tag_ids.has(tag_id)))
    }
  }
}

export function view_title(view: View, tags: Tag[]): string {
  if (view.kind === 'tag') return tags.find((tag) => tag.id === view.tag_id)?.name ?? 'Tag'
  return BUILT_IN_VIEWS.find((entry) => entry.view.kind === view.kind)!.label
}

// A saved list view reopens as the tag that list became; anything else unknown falls back to all tasks.
export function launch_view(settings: Settings, tags: Tag[]): View {
  if (settings.launch_view !== 'last') {
    return BUILT_IN_VIEWS.some(({ view }) => view.kind === settings.launch_view) ? { kind: settings.launch_view } : { kind: 'all' }
  }

  const saved = settings.last_view as View | { kind: 'list'; list_id: string }
  const view: View = saved.kind === 'list' ? { kind: 'tag', tag_id: saved.list_id } : saved

  if (view.kind === 'tag') return tags.some((tag) => tag.id === view.tag_id) ? view : { kind: 'all' }
  return BUILT_IN_VIEWS.some((entry) => entry.view.kind === view.kind) ? view : { kind: 'all' }
}

// New tasks carry the selected tag, and no tag in every other view.
export function tag_ids_for_new_task(view: View): string[] {
  return view.kind === 'tag' ? [view.tag_id] : []
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

export function is_priority_tag(tag: Tag): boolean {
  return tag.group_id === PRIORITY_GROUP_ID
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

// The top and bottom quarters of a row drop beside it, the middle drops into it.
export function drop_placement(event: DragEvent, allow_inside: boolean): DropPlacement {
  const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const fraction = (event.clientY - row.top) / row.height
  if (!allow_inside) return fraction < 0.5 ? 'before' : 'after'
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

export function by_position<Item extends { position: number }>(first: Item, second: Item): number {
  return first.position - second.position
}
