import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { Task, TaskList } from '@shared/tasks'

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
     SET position = (SELECT COUNT(*) FROM task_lists AS earlier WHERE earlier.created_at < task_lists.created_at)`
]

function migrate_schema(database: DatabaseSync): void {
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
  is_done: number
  created_at: string
  list_id: string | null
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
}

export function close_task_database(): void {
  database?.close()
  database = undefined
}

function open_database(): DatabaseSync {
  if (!database) throw new Error('task database is not open')
  return database
}

// New rows go after every existing one.
function next_position(table: 'tasks' | 'task_lists'): number {
  const { last } = open_database().prepare(`SELECT MAX(position) AS last FROM ${table}`).get() as { last: number | null }
  return (last ?? 0) + 1
}

function row_to_task(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    is_done: row.is_done === 1,
    created_at: row.created_at,
    list_id: row.list_id,
    parent_id: row.parent_id,
    position: row.position
  }
}

// ============================================================================
// Task queries
// ============================================================================

export function list_tasks(): Task[] {
  const rows = open_database().prepare('SELECT * FROM tasks ORDER BY position').all() as unknown as TaskRow[]
  return rows.map(row_to_task)
}

export function add_task(title: string, list_id: string | null, parent_id: string | null): Task {
  const task: Task = {
    id: randomUUID(),
    title,
    is_done: false,
    created_at: new Date().toISOString(),
    list_id,
    parent_id,
    position: next_position('tasks')
  }

  open_database()
    .prepare('INSERT INTO tasks (id, title, is_done, created_at, list_id, parent_id, position) VALUES (?, ?, 0, ?, ?, ?, ?)')
    .run(task.id, task.title, task.created_at, task.list_id, task.parent_id, task.position)

  return task
}

export function set_task_done(task_id: string, is_done: boolean): void {
  open_database().prepare('UPDATE tasks SET is_done = ? WHERE id = ?').run(is_done ? 1 : 0, task_id)
}

export function remove_task(task_id: string): void {
  open_database().prepare('DELETE FROM tasks WHERE id = ?').run(task_id)
}

// The task's subtasks follow it into its new list.
export function move_task(task_id: string, parent_id: string | null, list_id: string | null, position: number): void {
  const database = open_database()

  database.exec('BEGIN')
  database.prepare('UPDATE tasks SET parent_id = ?, list_id = ?, position = ? WHERE id = ?').run(parent_id, list_id, position, task_id)
  database
    .prepare(
      `WITH RECURSIVE descendants (id) AS (
         SELECT id FROM tasks WHERE parent_id = ?
         UNION SELECT tasks.id FROM tasks JOIN descendants ON tasks.parent_id = descendants.id
       )
       UPDATE tasks SET list_id = ? WHERE id IN (SELECT id FROM descendants)`
    )
    .run(task_id, list_id)
  database.exec('COMMIT')
}

// ============================================================================
// List queries
// ============================================================================

export function list_task_lists(): TaskList[] {
  return open_database().prepare('SELECT * FROM task_lists ORDER BY position').all() as unknown as TaskList[]
}

export function add_task_list(name: string): TaskList {
  const task_list: TaskList = { id: randomUUID(), name, created_at: new Date().toISOString(), position: next_position('task_lists') }

  open_database()
    .prepare('INSERT INTO task_lists (id, name, created_at, position) VALUES (?, ?, ?, ?)')
    .run(task_list.id, task_list.name, task_list.created_at, task_list.position)

  return task_list
}

export function remove_task_list(list_id: string): void {
  open_database().prepare('DELETE FROM task_lists WHERE id = ?').run(list_id)
}

export function move_task_list(list_id: string, position: number): void {
  open_database().prepare('UPDATE task_lists SET position = ? WHERE id = ?').run(position, list_id)
}
