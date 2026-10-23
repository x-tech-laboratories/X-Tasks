import { contextBridge, ipcRenderer } from 'electron'

import { LIST_TASKS_CHANNEL, SAVE_TASKS_CHANNEL, type TasksApi } from '@shared/tasks'

const tasks_api: TasksApi = {
  list_tasks: () => ipcRenderer.invoke(LIST_TASKS_CHANNEL),
  save_tasks: (tasks) => ipcRenderer.invoke(SAVE_TASKS_CHANNEL, tasks)
}

contextBridge.exposeInMainWorld('x_tasks', tasks_api)
