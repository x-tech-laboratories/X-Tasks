import type { Settings } from '@shared/settings'
import type { Task, TaskList, View } from '@shared/tasks'

export type { View }

// ============================================================================
// View
// ============================================================================

export const BUILT_IN_VIEWS: { view: View; label: string }[] = [
  { view: { kind: 'all' }, label: 'All tasks' },
  { view: { kind: 'active' }, label: 'Active' },
  { view: { kind: 'completed' }, label: 'Completed' },
  { view: { kind: 'inbox' }, label: 'Inbox' }
]

// ============================================================================
// Helpers
// ============================================================================

export function is_same_view(first: View, second: View): boolean {
  if (first.kind === 'list' && second.kind === 'list') return first.list_id === second.list_id
  return first.kind === second.kind
}

export function task_is_in_view(task: Task, view: View): boolean {
  switch (view.kind) {
    case 'all': return true
    case 'active': return !task.is_done
    case 'completed': return task.is_done
    case 'inbox': return task.list_id === null
    case 'list': return task.list_id === view.list_id
  }
}

export function view_title(view: View, task_lists: TaskList[]): string {
  if (view.kind === 'list') return task_lists.find((task_list) => task_list.id === view.list_id)?.name ?? 'List'
  return BUILT_IN_VIEWS.find((entry) => entry.view.kind === view.kind)!.label
}

// A remembered list that has since been deleted falls back to all tasks.
export function launch_view(settings: Settings, task_lists: TaskList[]): View {
  if (settings.launch_view !== 'last') return { kind: settings.launch_view }

  const view = settings.last_view
  if (view.kind === 'list' && !task_lists.some((task_list) => task_list.id === view.list_id)) return { kind: 'all' }
  return view
}

// New tasks land in the selected list, or the inbox for every other view.
export function list_id_for_new_task(view: View): string | null {
  return view.kind === 'list' ? view.list_id : null
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

export function task_with_descendant_ids(task_id: string, all_tasks: Task[]): Set<string> {
  const ids = new Set([task_id])
  let found_more = true

  while (found_more) {
    found_more = false
    for (const task of all_tasks) {
      if (task.parent_id && ids.has(task.parent_id) && !ids.has(task.id)) {
        ids.add(task.id)
        found_more = true
      }
    }
  }

  return ids
}

// ============================================================================
// Dragging
// ============================================================================

export type DropPlacement = 'before' | 'after' | 'inside'

export interface TaskMove {
  parent_id: string | null
  list_id: string | null
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

export function task_move_for_drop(dragged: Task, target: Task, placement: DropPlacement, all_tasks: Task[]): TaskMove {
  const others = all_tasks.filter((task) => task.id !== dragged.id)

  if (placement === 'inside') {
    const last_child_position = Math.max(target.position, ...others.filter((task) => task.parent_id === target.id).map((task) => task.position))
    return { parent_id: target.id, list_id: target.list_id, position: last_child_position + 1 }
  }

  const siblings = others.filter((task) => task.parent_id === target.parent_id)
  return { parent_id: target.parent_id, list_id: target.list_id, position: position_beside(siblings, target, placement) }
}

export function list_position_for_drop(dragged: TaskList, target: TaskList, placement: 'before' | 'after', task_lists: TaskList[]): number {
  return position_beside(task_lists.filter((task_list) => task_list.id !== dragged.id), target, placement)
}

export function by_position<Item extends { position: number }>(first: Item, second: Item): number {
  return first.position - second.position
}
