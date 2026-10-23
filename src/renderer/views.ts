import type { Task, TaskList } from '@shared/tasks'

// ============================================================================
// View
// ============================================================================

export type View =
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'completed' }
  | { kind: 'inbox' }
  | { kind: 'list'; list_id: string }

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

// New tasks land in the selected list, or the inbox for every other view.
export function list_id_for_new_task(view: View): string | null {
  return view.kind === 'list' ? view.list_id : null
}
