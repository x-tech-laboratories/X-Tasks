import { vi } from 'vitest'

import { DEFAULT_SETTINGS, type Settings, type SettingsApi } from '../src/shared/settings.ts'
import type { Tag, TagGroup, Task, TasksApi } from '../src/shared/tasks.ts'
import type { TimeEntry } from '../src/shared/time_tracking.ts'
import { advance_pomodoro, pomodoro_in_phase, type PomodoroState } from '../src/shared/pomodoro.ts'
import { make_task } from './fixtures.ts'

// ============================================================================
// Fake bridge
// ============================================================================

// The page's window.x_tasks and window.x_settings over tasks kept in memory, every call recorded.
// The host defaults to the desktop; a browser's page moves a Pomodoro on by itself, where the desktop's daemon does.
export function install_fake_bridge(data: { tasks?: Task[]; tags?: Tag[]; tag_groups?: TagGroup[]; settings?: Partial<Settings>; host?: SettingsApi['host'] }) {
  const tasks = [...(data.tasks ?? [])]
  const settings: Settings = { ...DEFAULT_SETTINGS, ...data.settings }
  let pomodoro: PomodoroState | null = null

  const tasks_api = {
    list_tasks: vi.fn(async () => tasks.map((task) => ({ ...task }))),
    list_completions: vi.fn(async () => []),
    list_time_entries: vi.fn(async (): Promise<TimeEntry[]> => []),
    start_timer: vi.fn(async (task_id: string, started_at: string) => ({ id: `entry-${task_id}`, task_id, started_at, ended_at: null })),
    stop_timer: vi.fn(async (_ended_at: string, _task_id: string | null) => undefined),
    get_pomodoro: vi.fn(async () => pomodoro),
    start_pomodoro: vi.fn(async (task_id: string, started_at: string) => {
      pomodoro = pomodoro_in_phase({ task_id, phase: 'work', round: 1 }, new Date(started_at), settings)
      await tasks_api.start_timer(task_id, started_at)
      return pomodoro
    }),
    next_pomodoro_round: vi.fn(async (started_at: string) => {
      if (pomodoro) pomodoro = pomodoro_in_phase({ ...pomodoro, phase: 'work', round: pomodoro.round + 1 }, new Date(started_at), settings)
      return pomodoro
    }),
    skip_pomodoro_break: vi.fn(async () => (pomodoro = pomodoro && { ...pomodoro, phase: 'ready', phase_ends_at: null })),
    stop_pomodoro: vi.fn(async () => void (pomodoro = null)),
    tick_pomodoro: vi.fn(async (now: string) => {
      if (!pomodoro) return []
      const { state, ended } = advance_pomodoro(pomodoro, new Date(now), settings)
      pomodoro = state
      for (const phase of ended) if (phase.phase === 'work') await tasks_api.stop_timer(phase.phase_ends_at!, phase.task_id)
      return ended
    }),
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
    set_task_estimate: vi.fn(async () => undefined),
    set_task_reminders: vi.fn(async () => undefined),
    set_task_notes: vi.fn(async () => undefined),
    set_task_schedule: vi.fn(async () => undefined),
    move_task: vi.fn(async () => undefined),
    move_tag: vi.fn(async () => undefined),
    move_tag_group: vi.fn(async () => undefined),
    on_database_changed: () => () => undefined
  }
  const settings_api = {
    host: data.host ?? ('desktop' as const),
    get_settings: vi.fn(async () => ({ ...settings })),
    set_setting: vi.fn(async <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void (settings[key] = value)),
    get_database_path: vi.fn(async () => '/tmp/tasks.db'),
    get_idle_seconds: vi.fn(async () => 0),
    get_sync_status: vi.fn(async () => ({ state: 'off' as const, server_url: '', last_synced_at: '', pending_changes: 0, error: '' }))
  }

  window.x_tasks = tasks_api as unknown as TasksApi
  window.x_settings = settings_api as unknown as SettingsApi
  return { tasks_api, settings_api, settings }
}
