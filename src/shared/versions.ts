// ============================================================================
// Task versions
// ============================================================================

// A link as one task sees it: made by this task, or made by the other and read by its inverse name.
export interface SnapshotLink {
  other_id: string
  relationship_id: string
  is_inverse: boolean
}

// Everything about a task that its history keeps; its place among its siblings is left out, so reordering makes no version.
export interface TaskSnapshot {
  title: string
  notes: string
  is_done: boolean
  done_at: string | null
  start_at: string | null
  due_at: string | null
  recurrence: string
  are_dates_linked: boolean
  my_day_on: string | null
  parent_id: string | null
  created_at: string
  tag_ids: string[]
  links: SnapshotLink[]
}

// How a version came about: the task made, changed, deleted or restored, or as it stood when history began.
export type VersionKind = 'created' | 'edited' | 'deleted' | 'restored' | 'first_seen'

// Whether the change was made on this device, or arrived by sync from another.
export type VersionOrigin = 'here' | 'elsewhere'

// One entry in a task's history, holding the whole task as that change left it; a deleted task's entry holds what it was before.
export interface TaskVersion {
  id: number
  task_id: string
  changed_at: string
  kind: VersionKind
  origin: VersionOrigin
  // The version a restore brought back, when it names one.
  restored_from: number | null
  snapshot: TaskSnapshot
  // The task's version before this one, for showing what this one changed.
  previous: TaskSnapshot | null
}

// ============================================================================
// Comparing
// ============================================================================

export type SnapshotField = Exclude<keyof TaskSnapshot, 'created_at'>

export const SNAPSHOT_FIELDS: SnapshotField[] = [
  'title', 'is_done', 'done_at', 'start_at', 'due_at', 'are_dates_linked', 'recurrence', 'my_day_on', 'parent_id', 'tag_ids', 'links', 'notes'
]

// Tags and links in a fixed order, so two snapshots of the same task compare equal whatever order they were read in.
export function normalized_snapshot(snapshot: TaskSnapshot): TaskSnapshot {
  return {
    ...snapshot,
    tag_ids: [...snapshot.tag_ids].sort(),
    links: [...snapshot.links].sort((first, second) => link_key(first).localeCompare(link_key(second)))
  }
}

function link_key(link: SnapshotLink): string {
  return `${link.other_id}/${link.relationship_id}/${link.is_inverse ? 1 : 0}`
}

// The fields that differ between two snapshots, in the order the history shows them.
export function changed_fields(before: TaskSnapshot | null, after: TaskSnapshot): SnapshotField[] {
  if (!before) return []
  const first = normalized_snapshot(before)
  const second = normalized_snapshot(after)
  return SNAPSHOT_FIELDS.filter((field) => JSON.stringify(first[field]) !== JSON.stringify(second[field]))
}

export function is_same_snapshot(first: TaskSnapshot, second: TaskSnapshot): boolean {
  return changed_fields(first, second).length === 0
}
