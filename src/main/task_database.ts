import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { DEFAULT_SETTINGS, PRIORITY_SCALE_NAMES, type PriorityScale, type Settings } from '@shared/settings'
import type { Tag, TagGroup, TagRule, Task, TaskSchedule } from '@shared/tasks'

// ============================================================================
// Schema
// ============================================================================

// Each entry upgrades the schema by one version; append new ones, never edit old ones.
const SCHEMA_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS tasks (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     is_done INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE task_lists (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   ALTER TABLE tasks ADD COLUMN list_id TEXT REFERENCES task_lists (id) ON DELETE CASCADE;
   CREATE INDEX tasks_by_list ON tasks (list_id)`,
  `ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks (id) ON DELETE CASCADE;
   CREATE INDEX tasks_by_parent ON tasks (parent_id)`,
  `ALTER TABLE tasks ADD COLUMN position REAL NOT NULL DEFAULT 0;
   UPDATE tasks SET position = (SELECT COUNT(*) FROM tasks AS earlier WHERE earlier.created_at < tasks.created_at);
   ALTER TABLE task_lists ADD COLUMN position REAL NOT NULL DEFAULT 0;
   UPDATE task_lists
     SET position = (SELECT COUNT(*) FROM task_lists AS earlier WHERE earlier.created_at < task_lists.created_at)`,
  `ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  // Starts an Area group, and turns lists into tags of a Lists group; subtasks pick up their parent's tags.
  `CREATE TABLE tag_groups (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL,
     position REAL NOT NULL DEFAULT 0
   );
   CREATE TABLE tags (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL,
     group_id TEXT NOT NULL REFERENCES tag_groups (id) ON DELETE CASCADE,
     parent_id TEXT REFERENCES tags (id) ON DELETE CASCADE,
     position REAL NOT NULL DEFAULT 0
   );
   CREATE INDEX tags_by_group ON tags (group_id);
   CREATE INDEX tags_by_parent ON tags (parent_id);
   CREATE TABLE task_tags (
     task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
     tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
     PRIMARY KEY (task_id, tag_id)
   );
   CREATE INDEX task_tags_by_tag ON task_tags (tag_id);
   INSERT INTO tag_groups (id, name, created_at, position) VALUES ('area', 'Area', strftime('%Y-%m-%dT%H:%M:%fZ'), 0);
   INSERT INTO tags (id, name, created_at, group_id, position)
     SELECT lower(hex(randomblob(16))), column1, strftime('%Y-%m-%dT%H:%M:%fZ'), 'area', column2
     FROM (VALUES ('Career', 1), ('Finances', 2), ('Home', 3), ('Car', 4), ('Tech', 5), ('Fitness', 6), ('Grooming', 7),
                  ('Sexual', 8), ('Social', 9), ('Health', 10), ('Mental', 11), ('Productivity', 12), ('Fun', 13));
   INSERT INTO tag_groups (id, name, created_at, position)
     SELECT 'lists', 'Lists', MIN(created_at), 1 FROM task_lists HAVING COUNT(*) > 0;
   INSERT INTO tags (id, name, created_at, group_id, position) SELECT id, name, created_at, 'lists', position FROM task_lists;
   INSERT INTO task_tags (task_id, tag_id) SELECT id, list_id FROM tasks WHERE list_id IS NOT NULL AND parent_id IS NULL;
   DROP INDEX tasks_by_list;
   ALTER TABLE tasks DROP COLUMN list_id;
   DROP TABLE task_lists`,
  `ALTER TABLE tasks ADD COLUMN start_at TEXT;
   ALTER TABLE tasks ADD COLUMN due_at TEXT;
   ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT ''`,
  // Starts a Priority group after Area, unless a group by that name already exists.
  `INSERT INTO tag_groups (id, name, created_at, position)
     SELECT 'priority', 'Priority', strftime('%Y-%m-%dT%H:%M:%fZ'), 0.5
     WHERE NOT EXISTS (SELECT 1 FROM tag_groups WHERE name = 'Priority');
   INSERT INTO tags (id, name, created_at, group_id, position)
     SELECT lower(hex(randomblob(16))), column1, strftime('%Y-%m-%dT%H:%M:%fZ'), 'priority', column2
     FROM (VALUES ('High', 1), ('Medium', 2), ('Low', 3))
     WHERE EXISTS (SELECT 1 FROM tag_groups WHERE id = 'priority')`,
  // The preset Area and Priority groups start as one tag per task; tasks already holding several keep them.
  `ALTER TABLE tag_groups ADD COLUMN is_single_choice INTEGER NOT NULL DEFAULT 0;
   UPDATE tag_groups SET is_single_choice = 1 WHERE id IN ('area', 'priority')`,
  // Starts a one-tag-per-task Type group after Priority, unless a group by that name already exists.
  `INSERT INTO tag_groups (id, name, created_at, position, is_single_choice)
     SELECT 'type', 'Type', strftime('%Y-%m-%dT%H:%M:%fZ'), 0.75, 1
     WHERE NOT EXISTS (SELECT 1 FROM tag_groups WHERE name = 'Type');
   INSERT INTO tags (id, name, created_at, group_id, position)
     SELECT lower(hex(randomblob(16))), column1, strftime('%Y-%m-%dT%H:%M:%fZ'), 'type', column2
     FROM (VALUES ('Goal', 1), ('Task', 2), ('Routine', 3), ('Habit', 4))
     WHERE EXISTS (SELECT 1 FROM tag_groups WHERE id = 'type')`,
  // Tasks already done have no known completion time, so theirs stays empty.
  `ALTER TABLE tasks ADD COLUMN done_at TEXT`,
  `ALTER TABLE tasks ADD COLUMN my_day_on TEXT`,
  // A rule tag keeps its rule here as JSON; plain tags leave it empty.
  `ALTER TABLE tags ADD COLUMN rule TEXT`
]

// A reverted upgrade once took version 4 and added task_lists.parent_id; take it out and redo version 4.
function undo_reverted_list_tree(database: DatabaseSync): void {
  const columns = database.prepare('PRAGMA table_info(task_lists)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'parent_id')) return

  database.exec('BEGIN')
  database.exec('DROP INDEX IF EXISTS task_lists_by_parent')
  database.exec('ALTER TABLE task_lists DROP COLUMN parent_id')
  database.exec('PRAGMA user_version = 3')
  database.exec('COMMIT')
}

function migrate_schema(database: DatabaseSync): void {
  undo_reverted_list_tree(database)
  const { user_version } = database.prepare('PRAGMA user_version').get() as { user_version: number }

  for (let version = user_version; version < SCHEMA_MIGRATIONS.length; version += 1) {
    database.exec('BEGIN')
    database.exec(SCHEMA_MIGRATIONS[version]!)
    database.exec(`PRAGMA user_version = ${version + 1}`)
    database.exec('COMMIT')
  }
}

// ============================================================================
// Connection
// ============================================================================

interface TaskRow {
  id: string
  title: string
  notes: string
  is_done: number
  done_at: string | null
  start_at: string | null
  due_at: string | null
  recurrence: string
  my_day_on: string | null
  created_at: string
  parent_id: string | null
  position: number
}

let database: DatabaseSync | undefined

export function task_database_path(): string {
  return process.env.X_TASKS_DB ?? join(app.getPath('userData'), 'tasks.db')
}

export function open_task_database(): void {
  const database_path = task_database_path()
  mkdirSync(dirname(database_path), { recursive: true })

  database = new DatabaseSync(database_path)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA foreign_keys = ON')
  migrate_schema(database)
  last_data_version = read_data_version(database)
}

export function close_task_database(): void {
  database?.close()
  database = undefined
}

// SQLite bumps data_version only when another connection commits, so the app's own writes never count as a change.
let last_data_version = 0

function read_data_version(database: DatabaseSync): number {
  return (database.prepare('PRAGMA data_version').get() as { data_version: number }).data_version
}

export function has_changed_elsewhere(): boolean {
  if (!database) return false
  const data_version = read_data_version(database)
  if (data_version === last_data_version) return false
  last_data_version = data_version
  return true
}

// Writes a complete, consistent copy of the open database to a new file.
export function back_up_task_database(backup_path: string): void {
  open_database().prepare('VACUUM INTO ?').run(backup_path)
}

function open_database(): DatabaseSync {
  if (!database) throw new Error('task database is not open')
  return database
}

// New rows go after every existing one.
function next_position(table: 'tasks' | 'tag_groups' | 'tags'): number {
  const { last } = open_database().prepare(`SELECT MAX(position) AS last FROM ${table}`).get() as { last: number | null }
  return (last ?? 0) + 1
}

function row_to_task(row: TaskRow, tag_ids: string[]): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    is_done: row.is_done === 1,
    done_at: row.done_at,
    start_at: row.start_at,
    due_at: row.due_at,
    recurrence: row.recurrence,
    my_day_on: row.my_day_on,
    created_at: row.created_at,
    parent_id: row.parent_id,
    position: row.position,
    tag_ids
  }
}

// ============================================================================
// Task queries
// ============================================================================

export function list_tasks(): Task[] {
  const database = open_database()
  const rows = database.prepare('SELECT * FROM tasks ORDER BY position').all() as unknown as TaskRow[]
  const links = database.prepare('SELECT task_id, tag_id FROM task_tags').all() as { task_id: string; tag_id: string }[]

  const tag_ids_by_task = new Map<string, string[]>()
  for (const link of links) tag_ids_by_task.set(link.task_id, [...(tag_ids_by_task.get(link.task_id) ?? []), link.tag_id])

  return rows.map((row) => row_to_task(row, tag_ids_by_task.get(row.id) ?? []))
}

export function add_task(title: string, parent_id: string | null, tag_ids: string[], my_day_on: string | null): Task {
  const database = open_database()
  const task: Task = {
    id: randomUUID(),
    title,
    notes: '',
    is_done: false,
    done_at: null,
    start_at: null,
    due_at: null,
    recurrence: '',
    my_day_on,
    created_at: new Date().toISOString(),
    parent_id,
    position: next_position('tasks'),
    tag_ids
  }

  database.exec('BEGIN')
  database
    .prepare('INSERT INTO tasks (id, title, is_done, my_day_on, created_at, parent_id, position) VALUES (?, ?, 0, ?, ?, ?, ?)')
    .run(task.id, task.title, task.my_day_on, task.created_at, task.parent_id, task.position)
  for (const tag_id of tag_ids) database.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(task.id, tag_id)
  database.exec('COMMIT')

  return task
}

// A recurring task stays open when ticked, yet still records the time it was done.
export function set_task_done(task_id: string, is_done: boolean, done_at: string | null): void {
  open_database().prepare('UPDATE tasks SET is_done = ?, done_at = ? WHERE id = ?').run(is_done ? 1 : 0, done_at, task_id)
}

export function set_task_title(task_id: string, title: string): void {
  open_database().prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, task_id)
}

export function set_task_notes(task_id: string, notes: string): void {
  open_database().prepare('UPDATE tasks SET notes = ? WHERE id = ?').run(notes, task_id)
}

export function set_task_schedule(task_id: string, schedule: TaskSchedule): void {
  open_database()
    .prepare('UPDATE tasks SET start_at = ?, due_at = ?, recurrence = ? WHERE id = ?')
    .run(schedule.start_at, schedule.due_at, schedule.recurrence, task_id)
}

export function set_task_my_day(task_id: string, my_day_on: string | null): void {
  open_database().prepare('UPDATE tasks SET my_day_on = ? WHERE id = ?').run(my_day_on, task_id)
}

export function remove_task(task_id: string): void {
  open_database().prepare('DELETE FROM tasks WHERE id = ?').run(task_id)
}

export function move_task(task_id: string, parent_id: string | null, position: number): void {
  open_database().prepare('UPDATE tasks SET parent_id = ?, position = ? WHERE id = ?').run(parent_id, position, task_id)
}

// In a one-tag-per-task group, the new tag replaces whichever tag of that group the task had.
export function tag_task(task_id: string, tag_id: string): void {
  const database = open_database()

  database.exec('BEGIN')
  database
    .prepare(
      `DELETE FROM task_tags WHERE task_id = ? AND tag_id IN (
         SELECT other.id FROM tags AS other
           JOIN tags AS chosen ON chosen.group_id = other.group_id
           JOIN tag_groups ON tag_groups.id = chosen.group_id
         WHERE chosen.id = ? AND tag_groups.is_single_choice = 1
       )`
    )
    .run(task_id, tag_id)
  database.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(task_id, tag_id)
  database.exec('COMMIT')
}

export function untag_task(task_id: string, tag_id: string): void {
  open_database().prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(task_id, tag_id)
}

// ============================================================================
// Tag group queries
// ============================================================================

export function list_tag_groups(): TagGroup[] {
  const rows = open_database().prepare('SELECT * FROM tag_groups ORDER BY position').all() as unknown as (Omit<TagGroup, 'is_single_choice'> & {
    is_single_choice: number
  })[]
  return rows.map((row) => ({ ...row, is_single_choice: row.is_single_choice === 1 }))
}

export function add_tag_group(name: string): TagGroup {
  const group: TagGroup = {
    id: randomUUID(),
    name,
    created_at: new Date().toISOString(),
    position: next_position('tag_groups'),
    is_single_choice: false
  }

  open_database()
    .prepare('INSERT INTO tag_groups (id, name, created_at, position) VALUES (?, ?, ?, ?)')
    .run(group.id, group.name, group.created_at, group.position)

  return group
}

// Its tags go with it, while their tasks stay and only lose the tags.
export function remove_tag_group(group_id: string): void {
  open_database().prepare('DELETE FROM tag_groups WHERE id = ?').run(group_id)
}

// Turning this on leaves tasks that already hold several of the group's tags as they are.
export function set_tag_group_single_choice(group_id: string, is_single_choice: boolean): void {
  open_database().prepare('UPDATE tag_groups SET is_single_choice = ? WHERE id = ?').run(is_single_choice ? 1 : 0, group_id)
}

export function move_tag_group(group_id: string, position: number): void {
  open_database().prepare('UPDATE tag_groups SET position = ? WHERE id = ?').run(position, group_id)
}

// ============================================================================
// Tag queries
// ============================================================================

export function list_tags(): Tag[] {
  const rows = open_database().prepare('SELECT * FROM tags ORDER BY position').all() as unknown as (Omit<Tag, 'rule'> & {
    rule: string | null
  })[]
  return rows.map((row) => ({ ...row, rule: row.rule === null ? null : (JSON.parse(row.rule) as TagRule) }))
}

export function add_tag(name: string, group_id: string, parent_id: string | null, rule: TagRule | null): Tag {
  const tag: Tag = {
    id: randomUUID(),
    name,
    created_at: new Date().toISOString(),
    group_id,
    parent_id,
    position: next_position('tags'),
    rule
  }

  open_database()
    .prepare('INSERT INTO tags (id, name, created_at, group_id, parent_id, position, rule) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tag.id, tag.name, tag.created_at, tag.group_id, tag.parent_id, tag.position, rule === null ? null : JSON.stringify(rule))

  return tag
}

export function set_tag_rule(tag_id: string, name: string, rule: TagRule): void {
  open_database().prepare('UPDATE tags SET name = ?, rule = ? WHERE id = ?').run(name, JSON.stringify(rule), tag_id)
}

// Sub-tags go with it, while its tasks stay and only lose the tags.
export function remove_tag(tag_id: string): void {
  open_database().prepare('DELETE FROM tags WHERE id = ?').run(tag_id)
}

export function move_tag(tag_id: string, parent_id: string | null, position: number): void {
  open_database().prepare('UPDATE tags SET parent_id = ?, position = ? WHERE id = ?').run(parent_id, position, tag_id)
}

// ============================================================================
// Setting queries
// ============================================================================

// Each value is stored as JSON, and any setting never saved keeps its default.
export function get_settings(): Settings {
  const rows = open_database().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }

  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) settings[row.key] = JSON.parse(row.value)
  }

  return settings as unknown as Settings
}

export function set_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): void {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting: ${key}`)

  open_database()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

// ============================================================================
// Priority scale
// ============================================================================

// Renames the preset Priority tags rank by rank, so tasks keep their priority; a rank the new scale lacks merges into its lowest.
export function apply_priority_scale(scale: PriorityScale): void {
  const database = open_database()
  const names = PRIORITY_SCALE_NAMES[scale]
  if (!database.prepare("SELECT 1 FROM tag_groups WHERE id = 'priority'").get()) return

  const ranks = database
    .prepare("SELECT id FROM tags WHERE group_id = 'priority' AND parent_id IS NULL ORDER BY position")
    .all() as { id: string }[]

  database.exec('BEGIN')
  names.forEach((name, index) => {
    const rank = ranks[index]
    if (rank) database.prepare('UPDATE tags SET name = ?, position = ? WHERE id = ?').run(name, index + 1, rank.id)
    else {
      database
        .prepare("INSERT INTO tags (id, name, created_at, group_id, position) VALUES (?, ?, ?, 'priority', ?)")
        .run(randomUUID(), name, new Date().toISOString(), index + 1)
    }
  })

  const lowest = database
    .prepare("SELECT id FROM tags WHERE group_id = 'priority' AND parent_id IS NULL ORDER BY position LIMIT 1 OFFSET ?")
    .get(names.length - 1) as { id: string }
  for (const extra of ranks.slice(names.length)) {
    database.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT task_id, ? FROM task_tags WHERE tag_id = ?').run(lowest.id, extra.id)
    database.prepare('DELETE FROM tags WHERE id = ?').run(extra.id)
  }
  database.exec('COMMIT')
}
