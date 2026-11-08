import { is_same_snapshot, normalized_snapshot, type SnapshotLink, type TaskSnapshot, type TaskVersion, type VersionKind } from '@shared/versions'
import type { SqlDatabase } from './sql_database'

// ============================================================================
// Triggers
// ============================================================================

// Triggers note each task a write touches, however it was made, cascades included; record_task_versions then saves one version for each.
const VERSION_TRIGGERS: { name: string; sql: string }[] = [
  { name: 'versions_tasks_insert', sql: 'AFTER INSERT ON tasks BEGIN INSERT OR IGNORE INTO task_versions_pending VALUES (NEW.id); END' },
  { name: 'versions_tasks_update', sql: 'AFTER UPDATE ON tasks BEGIN INSERT OR IGNORE INTO task_versions_pending VALUES (NEW.id); END' },
  { name: 'versions_tasks_delete', sql: 'AFTER DELETE ON tasks BEGIN INSERT OR IGNORE INTO task_versions_pending VALUES (OLD.id); END' },
  { name: 'versions_task_tags_insert', sql: 'AFTER INSERT ON task_tags BEGIN INSERT OR IGNORE INTO task_versions_pending VALUES (NEW.task_id); END' },
  { name: 'versions_task_tags_delete', sql: 'AFTER DELETE ON task_tags BEGIN INSERT OR IGNORE INTO task_versions_pending VALUES (OLD.task_id); END' },
  ...(['insert', 'update', 'delete'] as const).map((event) => {
    const row = event === 'delete' ? 'OLD' : 'NEW'
    return {
      name: `versions_task_dependencies_${event}`,
      sql: `AFTER ${event.toUpperCase()} ON task_dependencies BEGIN
              INSERT OR IGNORE INTO task_versions_pending VALUES (${row}.task_id);
              INSERT OR IGNORE INTO task_versions_pending VALUES (${row}.depends_on_id);
            END`
    }
  })
]

export function drop_version_triggers(database: SqlDatabase): void {
  for (const trigger of VERSION_TRIGGERS) database.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`)
}

// Also gives every task with no history yet a first version, as it stands now, with an id every device gives it alike.
export function install_version_triggers(database: SqlDatabase): void {
  drop_version_triggers(database)
  for (const trigger of VERSION_TRIGGERS) database.exec(`CREATE TRIGGER ${trigger.name} ${trigger.sql}`)

  const unseen = database.prepare('SELECT id FROM tasks WHERE id NOT IN (SELECT task_id FROM task_versions)').all() as { id: string }[]
  for (const { id } of unseen) {
    const snapshot = read_snapshot(database, id)!
    insert_version(database, `first_seen:${id}`, id, snapshot.created_at, 'first_seen', null, snapshot)
  }
}

// Writes that arrive by sync touch tasks too, but their versions come from the device that made them.
export function forget_touched_tasks(database: SqlDatabase): void {
  database.exec('DELETE FROM task_versions_pending')
}

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
// Recording
// ============================================================================

interface VersionRow {
  uid: string
  task_id: string
  changed_at: string
  kind: VersionKind
  is_here: number
  restored_from: string | null
  snapshot: string
  previous: string | null
}

// Versions run in the order they were made, whichever device made them and whenever they arrived.
const NEWEST_FIRST = 'ORDER BY changed_at DESC, id DESC'

function insert_version(
  database: SqlDatabase, uid: string, task_id: string, changed_at: string, kind: VersionKind, restored_from: string | null, snapshot: TaskSnapshot
): void {
  database
    .prepare('INSERT INTO task_versions (uid, task_id, changed_at, kind, site, restored_from, snapshot) VALUES (?, ?, ?, ?, (SELECT site FROM sync_state), ?, ?)')
    .run(uid, task_id, changed_at, kind, restored_from, JSON.stringify(snapshot))
}

function latest_version(database: SqlDatabase, task_id: string): { kind: VersionKind; snapshot: TaskSnapshot } | null {
  const row = database.prepare(`SELECT kind, snapshot FROM task_versions WHERE task_id = ? ${NEWEST_FIRST} LIMIT 1`).get(task_id) as
    | { kind: VersionKind; snapshot: string }
    | undefined
  return row ? { kind: row.kind, snapshot: JSON.parse(row.snapshot) as TaskSnapshot } : null
}

// Saves a version of each task touched since the last call, skipping any that ended up as they were; restores name the version each task came back from.
export function record_task_versions(database: SqlDatabase, restored_from = new Map<string, string>()): void {
  const touched = database.prepare('SELECT task_id FROM task_versions_pending').all() as { task_id: string }[]
  if (touched.length === 0) return
  const changed_at = new Date().toISOString()

  for (const { task_id } of touched) {
    const current = read_snapshot(database, task_id)
    const latest = latest_version(database, task_id)
    const restored_uid = restored_from.get(task_id) ?? null
    const was_deleted = latest?.kind === 'deleted'
    const uid = crypto.randomUUID()

    if (!current) {
      if (latest && !was_deleted) insert_version(database, uid, task_id, changed_at, 'deleted', null, latest.snapshot)
    } else if (!latest) {
      insert_version(database, uid, task_id, changed_at, 'created', null, current)
    } else if (was_deleted || restored_uid !== null || !is_same_snapshot(latest.snapshot, current)) {
      const kind = was_deleted || restored_uid !== null ? 'restored' : 'edited'
      insert_version(database, uid, task_id, changed_at, kind, restored_uid, current)
    }
  }
  database.exec('DELETE FROM task_versions_pending')
}

// Versions made before the cutoff go, except the newest of each task still there, which later changes are compared against.
export function prune_task_versions(database: SqlDatabase, cutoff: string): void {
  database
    .prepare(
      `DELETE FROM task_versions WHERE changed_at < ? AND id NOT IN (
         SELECT id FROM (SELECT id, task_id, ROW_NUMBER() OVER (PARTITION BY task_id ${NEWEST_FIRST}) AS rank FROM task_versions)
         WHERE rank = 1 AND task_id IN (SELECT id FROM tasks)
       )`
    )
    .run(cutoff)
}

// ============================================================================
// Reading
// ============================================================================

const VERSION_COLUMNS = `id, uid, task_id, changed_at, kind, site = (SELECT site FROM sync_state) AS is_here, restored_from, snapshot,
  LAG(snapshot) OVER (PARTITION BY task_id ORDER BY changed_at, id) AS previous`

function row_to_version(row: VersionRow): TaskVersion {
  return {
    id: row.uid,
    task_id: row.task_id,
    changed_at: row.changed_at,
    kind: row.kind,
    origin: row.is_here === 1 ? 'here' : 'elsewhere',
    restored_from: row.restored_from,
    snapshot: JSON.parse(row.snapshot) as TaskSnapshot,
    previous: row.previous === null ? null : (JSON.parse(row.previous) as TaskSnapshot)
  }
}

// One task's versions, newest first.
export function read_task_versions(database: SqlDatabase, task_id: string): TaskVersion[] {
  const rows = database.prepare(`SELECT ${VERSION_COLUMNS} FROM task_versions WHERE task_id = ? ${NEWEST_FIRST}`).all(task_id)
  return (rows as unknown as VersionRow[]).map(row_to_version)
}

// The latest versions of every task, deleted ones included, newest first.
export function read_recent_versions(database: SqlDatabase, limit: number): TaskVersion[] {
  const rows = database.prepare(`SELECT * FROM (SELECT ${VERSION_COLUMNS} FROM task_versions) ${NEWEST_FIRST} LIMIT ?`).all(limit)
  return (rows as unknown as VersionRow[]).map(row_to_version)
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

// Brings a task back to one of its versions; a deleted task comes back with the subtasks deleted along with it.
// Returns the version each restored task came back from, for the new versions to name.
export function restore_version(database: SqlDatabase, version_id: string): Map<string, string> {
  const row = database.prepare('SELECT uid, task_id, snapshot FROM task_versions WHERE uid = ?').get(version_id) as
    | Pick<VersionRow, 'uid' | 'task_id' | 'snapshot'>
    | undefined
  if (!row) throw new Error(`no such version: ${version_id}`)
  const restored_from = new Map<string, string>()
  const was_gone = !task_exists(database, row.task_id)

  apply_snapshot(database, row.task_id, JSON.parse(row.snapshot) as TaskSnapshot)
  restored_from.set(row.task_id, row.uid)
  if (!was_gone) return restored_from

  // Subtasks deleted with the task were recorded at the same moment, and come back only while they are still gone.
  const deleted_together = database
    .prepare(
      `SELECT uid, task_id, snapshot FROM task_versions AS version
       WHERE kind = 'deleted'
         AND changed_at = (SELECT changed_at FROM task_versions WHERE task_id = ? AND kind = 'deleted' ${NEWEST_FIRST} LIMIT 1)
         AND uid = (SELECT uid FROM task_versions WHERE task_id = version.task_id ${NEWEST_FIRST} LIMIT 1)`
    )
    .all(row.task_id) as Pick<VersionRow, 'uid' | 'task_id' | 'snapshot'>[]
  const waiting = deleted_together.map((each) => ({ ...each, snapshot: JSON.parse(each.snapshot) as TaskSnapshot }))

  for (let parent_ids = [row.task_id]; parent_ids.length > 0; ) {
    const children = waiting.filter((each) => each.snapshot.parent_id !== null && parent_ids.includes(each.snapshot.parent_id) && !task_exists(database, each.task_id))
    for (const child of children) {
      apply_snapshot(database, child.task_id, child.snapshot)
      restored_from.set(child.task_id, child.uid)
    }
    parent_ids = children.map((child) => child.task_id)
  }
  return restored_from
}
