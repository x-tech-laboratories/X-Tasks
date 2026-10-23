import type { SettingsApi } from '../shared/settings'
import type { TasksApi } from '../shared/tasks'

declare global {
  interface Window {
    x_tasks: TasksApi
    x_settings: SettingsApi
  }
}

export {}
