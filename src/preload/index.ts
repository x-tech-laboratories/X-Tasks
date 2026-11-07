import { contextBridge, ipcRenderer } from 'electron'

import { settings_bridge, tasks_bridge } from '@shared/bridges'
import type { SettingsApi } from '@shared/settings'
import { DATABASE_CHANGED_CHANNEL, OPEN_TASK_CHANNEL, TAKE_LAUNCH_TASK_CHANNEL, type TasksApi } from '@shared/tasks'

// ============================================================================
// Tasks
// ============================================================================

// The bridge's calls, plus the change and task link events the main process sends on its own.
const tasks_api: TasksApi = {
  ...tasks_bridge.ipc_client(ipcRenderer),
  on_database_changed: (listener) => {
    const handle_change = (): void => listener()
    ipcRenderer.on(DATABASE_CHANGED_CHANNEL, handle_change)
    return () => ipcRenderer.removeListener(DATABASE_CHANGED_CHANNEL, handle_change)
  },
  on_open_task: (listener) => {
    const handle_open = (_event: unknown, task_id: string): void => listener(task_id)
    ipcRenderer.on(OPEN_TASK_CHANNEL, handle_open)
    void ipcRenderer.invoke(TAKE_LAUNCH_TASK_CHANNEL).then((task_id: string | null) => task_id && listener(task_id))
    return () => ipcRenderer.removeListener(OPEN_TASK_CHANNEL, handle_open)
  }
}

// ============================================================================
// Settings
// ============================================================================

const settings_api: SettingsApi = {
  ...settings_bridge.ipc_client(ipcRenderer),
  host: 'desktop'
}

contextBridge.exposeInMainWorld(tasks_bridge.api_name, tasks_api)
contextBridge.exposeInMainWorld(settings_bridge.api_name, settings_api)
