import { contextBridge, ipcRenderer } from 'electron'

import {
  CREATE_BACKUP_CHANNEL, GET_DATABASE_PATH_CHANNEL, GET_SETTINGS_CHANNEL, LIST_BACKUPS_CHANNEL, REMOVE_BACKUP_CHANNEL,
  RESTORE_BACKUP_CHANNEL, SET_SETTING_CHANNEL, SHOW_BACKUP_FOLDER_CHANNEL, SHOW_DATABASE_FOLDER_CHANNEL, GET_MCP_STATUS_CHANNEL, type SettingsApi
} from '@shared/settings'
import {
  ADD_TAG_CHANNEL, ADD_TAG_GROUP_CHANNEL, ADD_TASK_CHANNEL, DATABASE_CHANGED_CHANNEL, LIST_COMPLETIONS_CHANNEL, LIST_TAG_GROUPS_CHANNEL, LIST_TAGS_CHANNEL, LIST_TASKS_CHANNEL,
  MOVE_TAG_CHANNEL, MOVE_TAG_GROUP_CHANNEL, MOVE_TASK_CHANNEL, REMOVE_TAG_CHANNEL, REMOVE_TAG_GROUP_CHANNEL, REMOVE_TASK_CHANNEL, SET_TAG_GROUP_SINGLE_CHOICE_CHANNEL, SET_TASK_DONE_CHANNEL, SET_TASK_MY_DAY_CHANNEL, SET_TASK_NOTES_CHANNEL, SET_TASK_SCHEDULE_CHANNEL,
  SET_TAG_RULE_CHANNEL, SET_TASK_TITLE_CHANNEL, TAG_TASK_CHANNEL, UNTAG_TASK_CHANNEL, type TasksApi
} from '@shared/tasks'

const tasks_api: TasksApi = {
  list_tasks: () => ipcRenderer.invoke(LIST_TASKS_CHANNEL),
  add_task: (title, parent_id, tag_ids, my_day_on) => ipcRenderer.invoke(ADD_TASK_CHANNEL, title, parent_id, tag_ids, my_day_on),
  set_task_done: (task_id, is_done, done_at, log_change) => ipcRenderer.invoke(SET_TASK_DONE_CHANNEL, task_id, is_done, done_at, log_change),
  set_task_title: (task_id, title) => ipcRenderer.invoke(SET_TASK_TITLE_CHANNEL, task_id, title),
  set_task_notes: (task_id, notes) => ipcRenderer.invoke(SET_TASK_NOTES_CHANNEL, task_id, notes),
  set_task_schedule: (task_id, schedule) => ipcRenderer.invoke(SET_TASK_SCHEDULE_CHANNEL, task_id, schedule),
  set_task_my_day: (task_id, my_day_on) => ipcRenderer.invoke(SET_TASK_MY_DAY_CHANNEL, task_id, my_day_on),
  remove_task: (task_id) => ipcRenderer.invoke(REMOVE_TASK_CHANNEL, task_id),
  move_task: (task_id, parent_id, position) => ipcRenderer.invoke(MOVE_TASK_CHANNEL, task_id, parent_id, position),
  tag_task: (task_id, tag_id) => ipcRenderer.invoke(TAG_TASK_CHANNEL, task_id, tag_id),
  untag_task: (task_id, tag_id) => ipcRenderer.invoke(UNTAG_TASK_CHANNEL, task_id, tag_id),
  list_completions: () => ipcRenderer.invoke(LIST_COMPLETIONS_CHANNEL),

  list_tag_groups: () => ipcRenderer.invoke(LIST_TAG_GROUPS_CHANNEL),
  add_tag_group: (name) => ipcRenderer.invoke(ADD_TAG_GROUP_CHANNEL, name),
  remove_tag_group: (group_id) => ipcRenderer.invoke(REMOVE_TAG_GROUP_CHANNEL, group_id),
  set_tag_group_single_choice: (group_id, is_single_choice) =>
    ipcRenderer.invoke(SET_TAG_GROUP_SINGLE_CHOICE_CHANNEL, group_id, is_single_choice),
  move_tag_group: (group_id, position) => ipcRenderer.invoke(MOVE_TAG_GROUP_CHANNEL, group_id, position),

  list_tags: () => ipcRenderer.invoke(LIST_TAGS_CHANNEL),
  add_tag: (name, group_id, parent_id, rule) => ipcRenderer.invoke(ADD_TAG_CHANNEL, name, group_id, parent_id, rule),
  set_tag_rule: (tag_id, name, rule) => ipcRenderer.invoke(SET_TAG_RULE_CHANNEL, tag_id, name, rule),
  remove_tag: (tag_id) => ipcRenderer.invoke(REMOVE_TAG_CHANNEL, tag_id),
  move_tag: (tag_id, parent_id, position) => ipcRenderer.invoke(MOVE_TAG_CHANNEL, tag_id, parent_id, position),

  on_database_changed: (listener) => {
    const handle_change = (): void => listener()
    ipcRenderer.on(DATABASE_CHANGED_CHANNEL, handle_change)
    return () => ipcRenderer.removeListener(DATABASE_CHANGED_CHANNEL, handle_change)
  }
}

const settings_api: SettingsApi = {
  get_settings: () => ipcRenderer.invoke(GET_SETTINGS_CHANNEL),
  set_setting: (key, value) => ipcRenderer.invoke(SET_SETTING_CHANNEL, key, value),
  get_database_path: () => ipcRenderer.invoke(GET_DATABASE_PATH_CHANNEL),
  show_database_folder: () => ipcRenderer.invoke(SHOW_DATABASE_FOLDER_CHANNEL),
  list_backups: () => ipcRenderer.invoke(LIST_BACKUPS_CHANNEL),
  create_backup: () => ipcRenderer.invoke(CREATE_BACKUP_CHANNEL),
  restore_backup: (name) => ipcRenderer.invoke(RESTORE_BACKUP_CHANNEL, name),
  remove_backup: (name) => ipcRenderer.invoke(REMOVE_BACKUP_CHANNEL, name),
  show_backup_folder: () => ipcRenderer.invoke(SHOW_BACKUP_FOLDER_CHANNEL),
  get_mcp_status: () => ipcRenderer.invoke(GET_MCP_STATUS_CHANNEL)
}

contextBridge.exposeInMainWorld('x_tasks', tasks_api)
contextBridge.exposeInMainWorld('x_settings', settings_api)
