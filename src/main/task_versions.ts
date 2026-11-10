import { create_history, type Version } from '@x-tech-laboratories/x-libs/history'

import { is_same_snapshot, normalized_snapshot, type SnapshotLink, type TaskSnapshot, type TaskVersion } from '@shared/versions'
import type { SqlDatabase } from '@x-tech-laboratories/x-libs/sql'

// ============================================================================
// Snapshots
// ============================================================================

interface SnapshotRow {
  title: string
  notes: string
  is_done: number
  done_at: string | null
  start_at: string | null
  due_at: string | null
  recurrence: string
  are_dates_linked: number
  my_day_on: string | null
  parent_id: string | null
  created_at: string
}

// The task as it is now, or nothing once it is gone.
export function read_snapshot(database: SqlDatabase, task_id: string): TaskSnapshot | null {
  const row = database
    .prepare('SELECT title, notes, is_done, done_at, start_at, due_at, recurrence, are_dates_linked, my_day_on, parent_id, created_at FROM tasks WHERE id = ?')
    .get(task_id) as SnapshotRow | undefined
  if (!row) return null

  const tag_rows = database.prepare('SELECT tag_id FROM task_tags WHERE task_id = ?').all(task_id) as { tag_id: string }[]
  const link_rows = database
    .prepare(
      `SELECT depends_on_id AS other_id, relationship_id, 0 AS is_inverse FROM task_dependencies WHERE task_id = ?
       UNION ALL SELECT task_id, relationship_id, 1 FROM task_dependencies WHERE depends_on_id = ?`
    )
    .all(task_id, task_id) as { other_id: string; relationship_id: string; is_inverse: number }[]

  return normalized_snapshot({
    ...row,
    is_done: row.is_done === 1,
    are_dates_linked: row.are_dates_linked === 1,
    tag_ids: tag_rows.map((tag_row) => tag_row.tag_id),
    links: link_rows.map((link): SnapshotLink => ({ ...link, is_inverse: link.is_inverse === 1 }))
  })
}

// ============================================================================
// Restoring
// ============================================================================

function task_exists(database: SqlDatabase, task_id: string): boolean {
  return database.prepare('SELECT 1 FROM tasks WHERE id = ?').get(task_id) !== undefined
}

// Whether the task sits somewhere under the other, so making the other its child would close a loop.
function is_below(database: SqlDatabase, task_id: string, ancestor_id: string): boolean {
  const row = database
    .prepare(
      `WITH RECURSIVE chain (id) AS (SELECT parent_id FROM tasks WHERE id = ? UNION SELECT parent_id FROM tasks JOIN chain ON tasks.id = chain.id)
       SELECT 1 FROM chain WHERE id = ?`
    )
    .get(task_id, ancestor_id)
  return row !== undefined
}

// Puts the task back as the snapshot has it; a parent, tag or linked task deleted since is left out, and a parent now below the task is kept as it is.
function apply_snapshot(database: SqlDatabase, task_id: string, snapshot: TaskSnapshot): void {
  const current_parent = (database.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(task_id) as { parent_id: string | null } | undefined)?.parent_id ?? null
  const can_take_parent = snapshot.parent_id === null || (task_exists(database, snapshot.parent_id) && !is_below(database, snapshot.parent_id, task_id))
  const parent_id = can_take_parent ? snapshot.parent_id : current_parent

  if (!task_exists(database, task_id)) {
    const { last } = database.prepare('SELECT MAX(position) AS last FROM tasks').get() as { last: number | null }
    database.prepare('INSERT INTO tasks (id, title, created_at, position) VALUES (?, ?, ?, ?)').run(task_id, snapshot.title, snapshot.created_at, (last ?? 0) + 1)
  }
  database
    .prepare(
      `UPDATE tasks SET title = ?, notes = ?, is_done = ?, done_at = ?, start_at = ?, due_at = ?, recurrence = ?, are_dates_linked = ?, my_day_on = ?, parent_id = ?
       WHERE id = ?`
    )
    .run(
      snapshot.title, snapshot.notes, Number(snapshot.is_done), snapshot.done_at, snapshot.start_at, snapshot.due_at, snapshot.recurrence,
      Number(snapshot.are_dates_linked), snapshot.my_day_on, parent_id, task_id
    )

  const kept_tag_ids = new Set(snapshot.tag_ids)
  for (const { tag_id } of database.prepare('SELECT tag_id FROM task_tags WHERE task_id = ?').all(task_id) as { tag_id: string }[]) {
    if (!kept_tag_ids.has(tag_id)) database.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(task_id, tag_id)
  }
  for (const tag_id of snapshot.tag_ids) {
    database.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT ?, id FROM tags WHERE id = ? AND rule IS NULL').run(task_id, tag_id)
  }

  database.prepare('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?').run(task_id, task_id)
  for (const link of snapshot.links) {
    if (!task_exists(database, link.other_id)) continue
    const [from_id, to_id] = link.is_inverse ? [link.other_id, task_id] : [task_id, link.other_id]
    database.prepare('INSERT OR REPLACE INTO task_dependencies (task_id, depends_on_id, relationship_id) VALUES (?, ?, ?)').run(from_id, to_id, link.relationship_id)
  }
}

// ============================================================================
// History
// ============================================================================

// Every write that touches a task, however it was made, cascades included, saves one version of it; the versions sync,
// keeping the task_versions(task_id) table every device already has.
const task_history = create_history<TaskSnapshot>({
  name: 'task',
  item_table: 'tasks',
  item_column: 'task_id',
  watches: [
    { table: 'tasks', item_columns: ['id'] },
    { table: 'task_tags', item_columns: ['task_id'] },
    { table: 'task_dependencies', item_columns: ['task_id', 'depends_on_id'] }
  ],
  read: read_snapshot,
  apply: apply_snapshot,
  is_same: is_same_snapshot,
  created_at: (snapshot) => snapshot.created_at,
  // A deleted task comes back with the subtasks deleted along with it.
  parent_of: (snapshot) => snapshot.parent_id
})

// The trigger names from before the history moved into X-Libs, dropped so no write is noted twice.
const OLD_TRIGGERS = [
  'versions_tasks_insert', 'versions_tasks_update', 'versions_tasks_delete', 'versions_task_tags_insert', 'versions_task_tags_delete',
  'versions_task_dependencies_insert', 'versions_task_dependencies_update', 'versions_task_dependencies_delete'
]

export function drop_version_triggers(database: SqlDatabase): void {
  for (const name of OLD_TRIGGERS) database.exec(`DROP TRIGGER IF EXISTS ${name}`)
  task_history.drop_triggers(database)
}

// Also gives every task with no history yet a first version, as it stands now, with an id every device gives it alike.
export function install_version_triggers(database: SqlDatabase): void {
  task_history.install(database)
}

// Writes that arrive by sync touch tasks too, but their versions come from the device that made them.
export function forget_touched_tasks(database: SqlDatabase): void {
  task_history.forget_touched(database)
}

// Saves a version of each task touched since the last call, skipping any that ended up as they were.
export function record_task_versions(database: SqlDatabase): void {
  task_history.record(database)
}

// Versions made before the cutoff go, except the newest of each task still there, which later changes are compared against.
export function prune_task_versions(database: SqlDatabase, cutoff: string): void {
  task_history.prune(database, cutoff)
}

function as_task_version({ item_id, ...version }: Version<TaskSnapshot>): TaskVersion {
  return { ...version, task_id: item_id }
}

// One task's versions, newest first.
export function read_task_versions(database: SqlDatabase, task_id: string): TaskVersion[] {
  return task_history.read_versions(database, task_id).map(as_task_version)
}

// The latest versions of every task, deleted ones included, newest first.
export function read_recent_versions(database: SqlDatabase, limit: number): TaskVersion[] {
  return task_history.read_recent(database, limit).map(as_task_version)
}

// Brings a task back to one of its versions and records it; a deleted task comes back with its subtasks deleted along with it.
export function restore_version(database: SqlDatabase, version_id: string): void {
  task_history.restore(database, version_id)
}
