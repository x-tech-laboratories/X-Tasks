import { contextBridge, ipcRenderer } from 'electron'

import {
  ADD_TASK_CHANNEL, ADD_TASK_LIST_CHANNEL, LIST_TASKS_CHANNEL, LIST_TASK_LISTS_CHANNEL, MOVE_TASK_CHANNEL,
  MOVE_TASK_LIST_CHANNEL, REMOVE_TASK_CHANNEL, REMOVE_TASK_LIST_CHANNEL, SET_TASK_DONE_CHANNEL, type TasksApi
} from '@shared/tasks'

const tasks_api: TasksApi = {
  list_tasks: () => ipcRenderer.invoke(LIST_TASKS_CHANNEL),
  add_task: (title, list_id, parent_id) => ipcRenderer.invoke(ADD_TASK_CHANNEL, title, list_id, parent_id),
  set_task_done: (task_id, is_done) => ipcRenderer.invoke(SET_TASK_DONE_CHANNEL, task_id, is_done),
  remove_task: (task_id) => ipcRenderer.invoke(REMOVE_TASK_CHANNEL, task_id),
  move_task: (task_id, parent_id, list_id, position) =>
    ipcRenderer.invoke(MOVE_TASK_CHANNEL, task_id, parent_id, list_id, position),

  list_task_lists: () => ipcRenderer.invoke(LIST_TASK_LISTS_CHANNEL),
  add_task_list: (name) => ipcRenderer.invoke(ADD_TASK_LIST_CHANNEL, name),
  remove_task_list: (list_id) => ipcRenderer.invoke(REMOVE_TASK_LIST_CHANNEL, list_id),
  move_task_list: (list_id, position) => ipcRenderer.invoke(MOVE_TASK_LIST_CHANNEL, list_id, position)
}

contextBridge.exposeInMainWorld('x_tasks', tasks_api)
