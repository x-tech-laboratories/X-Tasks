import { contextBridge, ipcRenderer } from 'electron'

import { settings_bridge, tasks_bridge, tasks_events } from '@shared/bridges'
import type { SettingsApi } from '@shared/settings'
import { TAKE_LAUNCH_TASK_CHANNEL, type TasksApi } from '@shared/tasks'

// ============================================================================
// Tasks
// ============================================================================

const events = tasks_events.ipc_client(ipcRenderer)

// The bridge's calls, plus the change and task link events the main process sends on its own; a link the app was launched with comes first.
const tasks_api: TasksApi = {
  ...tasks_bridge.ipc_client(ipcRenderer),
  on_database_changed: (listener) => events.on('database_changed', () => listener()),
  on_open_task: (listener) => {
    const stop = events.on('open_task', listener)
    void ipcRenderer.invoke(TAKE_LAUNCH_TASK_CHANNEL).then((task_id: string | null) => task_id && listener(task_id))
    return stop
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
