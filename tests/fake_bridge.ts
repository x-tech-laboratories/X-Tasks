import { vi } from 'vitest'

import { DEFAULT_SETTINGS, type Settings, type SettingsApi } from '../src/shared/settings.ts'
import type { Tag, TagGroup, Task, TasksApi } from '../src/shared/tasks.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Fake bridge
// ============================================================================

// The page's window.x_tasks and window.x_settings over tasks kept in memory, every call recorded.
export function install_fake_bridge(data: { tasks?: Task[]; tags?: Tag[]; tag_groups?: TagGroup[]; settings?: Partial<Settings> }) {
  const tasks = [...(data.tasks ?? [])]
  const settings: Settings = { ...DEFAULT_SETTINGS, ...data.settings }

  const tasks_api = {
    list_tasks: vi.fn(async () => tasks.map((task) => ({ ...task }))),
    list_completions: vi.fn(async () => []),
    list_tag_groups: vi.fn(async () => data.tag_groups ?? []),
    list_tags: vi.fn(async () => data.tags ?? []),
    add_task: vi.fn(async (title: string, parent_id: string | null, tag_ids: string[]) => {
      const task = make_task({ id: `added-${tasks.length}`, title, parent_id, tag_ids, position: tasks.length + 1 })
      tasks.push(task)
      return task
    }),
    tag_task: vi.fn(async () => undefined),
    untag_task: vi.fn(async () => undefined),
    remove_task: vi.fn(async (task_id: string) => void tasks.splice(tasks.findIndex((task) => task.id === task_id), 1)),
    set_task_done: vi.fn(async () => undefined),
    set_task_my_day: vi.fn(async () => undefined),
    set_task_notes: vi.fn(async () => undefined),
    set_task_schedule: vi.fn(async () => undefined),
    move_task: vi.fn(async () => undefined),
    move_tag: vi.fn(async () => undefined),
    move_tag_group: vi.fn(async () => undefined),
    on_database_changed: () => () => undefined
  }
  const settings_api = {
    host: 'desktop' as const,
    get_settings: vi.fn(async () => ({ ...settings })),
    set_setting: vi.fn(async <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void (settings[key] = value)),
    get_database_path: vi.fn(async () => '/tmp/tasks.db'),
    get_sync_status: vi.fn(async () => ({ state: 'off' as const, server_url: '', last_synced_at: '', pending_changes: 0, error: '' }))
  }

  window.x_tasks = tasks_api as unknown as TasksApi
  window.x_settings = settings_api as unknown as SettingsApi
  return { tasks_api, settings_api, settings }
}
