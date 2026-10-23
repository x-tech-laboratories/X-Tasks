import { contextBridge, ipcRenderer } from 'electron'

import {
  GET_DATABASE_PATH_CHANNEL, GET_SETTINGS_CHANNEL, SET_SETTING_CHANNEL, SHOW_DATABASE_FOLDER_CHANNEL, type SettingsApi
} from '@shared/settings'
import {
  ADD_TAG_CHANNEL, ADD_TAG_GROUP_CHANNEL, ADD_TASK_CHANNEL, LIST_TAG_GROUPS_CHANNEL, LIST_TAGS_CHANNEL, LIST_TASKS_CHANNEL,
  MOVE_TAG_CHANNEL, MOVE_TASK_CHANNEL, REMOVE_TAG_CHANNEL, REMOVE_TAG_GROUP_CHANNEL, REMOVE_TASK_CHANNEL, SET_TASK_DONE_CHANNEL, SET_TASK_NOTES_CHANNEL, SET_TASK_TITLE_CHANNEL,
  TAG_TASK_CHANNEL, UNTAG_TASK_CHANNEL, type TasksApi
} from '@shared/tasks'

const tasks_api: TasksApi = {
  list_tasks: () => ipcRenderer.invoke(LIST_TASKS_CHANNEL),
  add_task: (title, parent_id, tag_ids) => ipcRenderer.invoke(ADD_TASK_CHANNEL, title, parent_id, tag_ids),
  set_task_done: (task_id, is_done) => ipcRenderer.invoke(SET_TASK_DONE_CHANNEL, task_id, is_done),
  set_task_title: (task_id, title) => ipcRenderer.invoke(SET_TASK_TITLE_CHANNEL, task_id, title),
  set_task_notes: (task_id, notes) => ipcRenderer.invoke(SET_TASK_NOTES_CHANNEL, task_id, notes),
  remove_task: (task_id) => ipcRenderer.invoke(REMOVE_TASK_CHANNEL, task_id),
  move_task: (task_id, parent_id, position) => ipcRenderer.invoke(MOVE_TASK_CHANNEL, task_id, parent_id, position),
  tag_task: (task_id, tag_id) => ipcRenderer.invoke(TAG_TASK_CHANNEL, task_id, tag_id),
  untag_task: (task_id, tag_id) => ipcRenderer.invoke(UNTAG_TASK_CHANNEL, task_id, tag_id),

  list_tag_groups: () => ipcRenderer.invoke(LIST_TAG_GROUPS_CHANNEL),
  add_tag_group: (name) => ipcRenderer.invoke(ADD_TAG_GROUP_CHANNEL, name),
  remove_tag_group: (group_id) => ipcRenderer.invoke(REMOVE_TAG_GROUP_CHANNEL, group_id),

  list_tags: () => ipcRenderer.invoke(LIST_TAGS_CHANNEL),
  add_tag: (name, group_id, parent_id) => ipcRenderer.invoke(ADD_TAG_CHANNEL, name, group_id, parent_id),
  remove_tag: (tag_id) => ipcRenderer.invoke(REMOVE_TAG_CHANNEL, tag_id),
  move_tag: (tag_id, parent_id, position) => ipcRenderer.invoke(MOVE_TAG_CHANNEL, tag_id, parent_id, position)
}

const settings_api: SettingsApi = {
  get_settings: () => ipcRenderer.invoke(GET_SETTINGS_CHANNEL),
  set_setting: (key, value) => ipcRenderer.invoke(SET_SETTING_CHANNEL, key, value),
  get_database_path: () => ipcRenderer.invoke(GET_DATABASE_PATH_CHANNEL),
  show_database_folder: () => ipcRenderer.invoke(SHOW_DATABASE_FOLDER_CHANNEL)
}

contextBridge.exposeInMainWorld('x_tasks', tasks_api)
contextBridge.exposeInMainWorld('x_settings', settings_api)
