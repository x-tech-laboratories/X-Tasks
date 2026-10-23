import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { Task } from '@shared/tasks'

// ============================================================================
// Connection
// ============================================================================

interface TaskRow {
  id: string
  title: string
  is_done: number
  created_at: string
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `)
}

export function close_task_database(): void {
  database?.close()
  database = undefined
}

function open_database(): DatabaseSync {
  if (!database) throw new Error('task database is not open')
  return database
}

function row_to_task(row: TaskRow): Task {
  return { id: row.id, title: row.title, is_done: row.is_done === 1, created_at: row.created_at }
}

// ============================================================================
// Queries
// ============================================================================

export function list_tasks(): Task[] {
  const rows = open_database().prepare('SELECT * FROM tasks ORDER BY created_at').all() as unknown as TaskRow[]
  return rows.map(row_to_task)
}

export function add_task(title: string): Task {
  const task: Task = { id: randomUUID(), title, is_done: false, created_at: new Date().toISOString() }

  open_database()
    .prepare('INSERT INTO tasks (id, title, is_done, created_at) VALUES (?, ?, 0, ?)')
    .run(task.id, task.title, task.created_at)

  return task
}

export function set_task_done(task_id: string, is_done: boolean): void {
  open_database().prepare('UPDATE tasks SET is_done = ? WHERE id = ?').run(is_done ? 1 : 0, task_id)
}

export function remove_task(task_id: string): void {
  open_database().prepare('DELETE FROM tasks WHERE id = ?').run(task_id)
}
