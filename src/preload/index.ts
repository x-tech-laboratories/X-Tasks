import { contextBridge, ipcRenderer } from 'electron'

import {
  ADD_TASK_CHANNEL, LIST_TASKS_CHANNEL, REMOVE_TASK_CHANNEL, SET_TASK_DONE_CHANNEL, type TasksApi
} from '@shared/tasks'

const tasks_api: TasksApi = {
  list_tasks: () => ipcRenderer.invoke(LIST_TASKS_CHANNEL),
  add_task: (title) => ipcRenderer.invoke(ADD_TASK_CHANNEL, title),
  set_task_done: (task_id, is_done) => ipcRenderer.invoke(SET_TASK_DONE_CHANNEL, task_id, is_done),
  remove_task: (task_id) => ipcRenderer.invoke(REMOVE_TASK_CHANNEL, task_id)
}

contextBridge.exposeInMainWorld('x_tasks', tasks_api)
