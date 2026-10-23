import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Task } from '@shared/tasks'

// ============================================================================
// Location
// ============================================================================

export function tasks_file_path(): string {
  return process.env.X_TASKS_FILE ?? join(app.getPath('userData'), 'tasks.json')
}

// ============================================================================
// Reading and writing
// ============================================================================

export async function read_tasks(): Promise<Task[]> {
  try {
    const file_text = await readFile(tasks_file_path(), 'utf8')
    return JSON.parse(file_text) as Task[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function write_tasks(tasks: Task[]): Promise<void> {
  const file_path = tasks_file_path()
  const temporary_path = `${file_path}.tmp`

  await mkdir(dirname(file_path), { recursive: true })
  await writeFile(temporary_path, JSON.stringify(tasks, null, 2))

  // Renaming over the old file means a crash mid-write never leaves it half written.
  await rename(temporary_path, file_path)
}
