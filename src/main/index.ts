import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'

import {
  CREATE_BACKUP_CHANNEL, GET_DATABASE_PATH_CHANNEL, GET_SETTINGS_CHANNEL, LIST_BACKUPS_CHANNEL, REMOVE_BACKUP_CHANNEL,
  RESTORE_BACKUP_CHANNEL, SET_SETTING_CHANNEL, SHOW_BACKUP_FOLDER_CHANNEL, SHOW_DATABASE_FOLDER_CHANNEL, GET_MCP_STATUS_CHANNEL, GET_SYNC_STATUS_CHANNEL,
  CONNECT_SYNC_CHANNEL, DISCONNECT_SYNC_CHANNEL, SYNC_NOW_CHANNEL, type Settings
} from '@shared/settings'
import type { SyncDirection } from '@shared/sync'
import {
  ADD_TAG_CHANNEL, ADD_TAG_GROUP_CHANNEL, ADD_TASK_CHANNEL, DATABASE_CHANGED_CHANNEL, LIST_COMPLETIONS_CHANNEL, LIST_TAG_GROUPS_CHANNEL, LIST_TAGS_CHANNEL, LIST_TASKS_CHANNEL,
  MOVE_TAG_CHANNEL, MOVE_TAG_GROUP_CHANNEL, MOVE_TASK_CHANNEL, REMOVE_TAG_CHANNEL, REMOVE_TAG_GROUP_CHANNEL, REMOVE_TASK_CHANNEL, SET_TASK_DONE_CHANNEL, SET_TASK_MY_DAY_CHANNEL, SET_TASK_NOTES_CHANNEL, SET_TASK_SCHEDULE_CHANNEL,
  UPDATE_TAG_CHANNEL, UPDATE_TAG_GROUP_CHANNEL, SET_TASK_TITLE_CHANNEL, TAG_TASK_CHANNEL, UNTAG_TASK_CHANNEL, type CompletionLogChange, type TagRule, type TaskSchedule
} from '@shared/tasks'
import { apply_mcp_settings, get_mcp_status, stop_mcp_server } from './mcp_server'
import { open_task_database } from './node_task_database'
import { node_sync_storage } from './node_sync_storage'
import { connect_sync, disconnect_sync, get_sync_status, start_sync, stop_sync, sync_now } from './sync_client'
import { backup_folder, create_backup, keep_automatic_backups, list_backups, remove_backup, restore_backup, schedule_automatic_backups } from './database_backups'
import {
  add_tag, add_tag_group, add_task, apply_priority_scale, close_task_database, get_settings, has_changed_elsewhere, list_completions, list_tag_groups, list_tags,
  list_tasks, move_tag, move_tag_group, move_task, remove_tag, remove_tag_group, remove_task, set_setting, update_tag, update_tag_group,
  set_task_done, set_task_my_day, set_task_notes, set_task_schedule, set_task_title, tag_task, task_database_path,
  untag_task
} from './task_database'

// ============================================================================
// Window
// ============================================================================

function create_main_window(): BrowserWindow {
  const main_window = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 640,
    minHeight: 400,
    show: false,
    title: 'X-Tasks',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f5f6f8',
    webPreferences: {
      // electron-vite emits an ESM preload as .mjs; loading .js here silently yields no bridge.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  main_window.once('ready-to-show', () => main_window.show())

  main_window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void main_window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void main_window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return main_window
}

// ============================================================================
// MCP endpoint
// ============================================================================

// The MCP endpoint and sync write through the app's own connection, which the outside-change check never sees, so they tell the windows themselves.
function announce_mcp_change(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(DATABASE_CHANGED_CHANNEL)
}

// Changes from other devices can include the theme, which the window's colours follow.
function announce_sync_change(): void {
  nativeTheme.themeSource = get_settings().theme
  announce_mcp_change()
}

function restart_mcp_server(): Promise<void> {
  return apply_mcp_settings(get_settings(), announce_mcp_change)
}

// ============================================================================
// Bridge handlers
// ============================================================================

function register_bridge_handlers(): void {
  ipcMain.handle(LIST_TASKS_CHANNEL, () => list_tasks())
  ipcMain.handle(ADD_TASK_CHANNEL, (_event, title: string, parent_id: string | null, tag_ids: string[], my_day_on: string | null) =>
    add_task(title, parent_id, tag_ids, my_day_on)
  )
  ipcMain.handle(SET_TASK_DONE_CHANNEL, (_event, task_id: string, is_done: boolean, done_at: string | null, log_change: CompletionLogChange) =>
    set_task_done(task_id, is_done, done_at, log_change)
  )
  ipcMain.handle(SET_TASK_TITLE_CHANNEL, (_event, task_id: string, title: string) => set_task_title(task_id, title))
  ipcMain.handle(SET_TASK_NOTES_CHANNEL, (_event, task_id: string, notes: string) => set_task_notes(task_id, notes))
  ipcMain.handle(SET_TASK_SCHEDULE_CHANNEL, (_event, task_id: string, schedule: TaskSchedule) =>
    set_task_schedule(task_id, schedule)
  )
  ipcMain.handle(SET_TASK_MY_DAY_CHANNEL, (_event, task_id: string, my_day_on: string | null) => set_task_my_day(task_id, my_day_on))
  ipcMain.handle(REMOVE_TASK_CHANNEL, (_event, task_id: string) => remove_task(task_id))
  ipcMain.handle(MOVE_TASK_CHANNEL, (_event, task_id: string, parent_id: string | null, position: number) =>
    move_task(task_id, parent_id, position)
  )
  ipcMain.handle(TAG_TASK_CHANNEL, (_event, task_id: string, tag_id: string) => tag_task(task_id, tag_id))
  ipcMain.handle(UNTAG_TASK_CHANNEL, (_event, task_id: string, tag_id: string) => untag_task(task_id, tag_id))
  ipcMain.handle(LIST_COMPLETIONS_CHANNEL, () => list_completions())

  ipcMain.handle(LIST_TAG_GROUPS_CHANNEL, () => list_tag_groups())
  ipcMain.handle(ADD_TAG_GROUP_CHANNEL, (_event, name: string, is_rule: boolean) => add_tag_group(name, is_rule))
  ipcMain.handle(UPDATE_TAG_GROUP_CHANNEL, (_event, group_id: string, name: string, is_rule: boolean, is_single_choice: boolean) =>
    update_tag_group(group_id, name, is_rule, is_single_choice)
  )
  ipcMain.handle(REMOVE_TAG_GROUP_CHANNEL, (_event, group_id: string) => remove_tag_group(group_id))
  ipcMain.handle(MOVE_TAG_GROUP_CHANNEL, (_event, group_id: string, position: number) => move_tag_group(group_id, position))

  ipcMain.handle(LIST_TAGS_CHANNEL, () => list_tags())
  ipcMain.handle(ADD_TAG_CHANNEL, (_event, name: string, group_id: string, parent_id: string | null, rule: TagRule | null, color: string | null) =>
    add_tag(name, group_id, parent_id, rule, color)
  )
  ipcMain.handle(UPDATE_TAG_CHANNEL, (_event, tag_id: string, name: string, rule: TagRule | null, color: string | null) =>
    update_tag(tag_id, name, rule, color)
  )
  ipcMain.handle(REMOVE_TAG_CHANNEL, (_event, tag_id: string) => remove_tag(tag_id))
  ipcMain.handle(MOVE_TAG_CHANNEL, (_event, tag_id: string, parent_id: string | null, position: number) =>
    move_tag(tag_id, parent_id, position)
  )

  ipcMain.handle(GET_SETTINGS_CHANNEL, () => get_settings())
  ipcMain.handle(SET_SETTING_CHANNEL, <Key extends keyof Settings>(_event: unknown, key: Key, value: Settings[Key]) => {
    set_setting(key, value)
    if (key === 'theme') nativeTheme.themeSource = value as Settings['theme']
    if (key === 'priority_scale') apply_priority_scale(value as Settings['priority_scale'])
    if (key === 'mcp_enabled' || key === 'mcp_port') void restart_mcp_server()
    if (key === 'auto_backup' || key === 'auto_backups_to_keep') keep_automatic_backups()
  })
  ipcMain.handle(GET_DATABASE_PATH_CHANNEL, () => task_database_path())
  ipcMain.handle(SHOW_DATABASE_FOLDER_CHANNEL, () => shell.showItemInFolder(task_database_path()))

  ipcMain.handle(LIST_BACKUPS_CHANNEL, () => list_backups())
  ipcMain.handle(CREATE_BACKUP_CHANNEL, () => create_backup())
  // The restored data brings its own settings, so its theme and MCP endpoint are applied straight away, and sync asks which copy to keep.
  ipcMain.handle(RESTORE_BACKUP_CHANNEL, (_event, name: string) => {
    restore_backup(name)
    nativeTheme.themeSource = get_settings().theme
    void restart_mcp_server()
    void sync_now()
  })
  ipcMain.handle(REMOVE_BACKUP_CHANNEL, (_event, name: string) => remove_backup(name))
  ipcMain.handle(SHOW_BACKUP_FOLDER_CHANNEL, () => shell.openPath(backup_folder()).then(() => undefined))

  ipcMain.handle(GET_MCP_STATUS_CHANNEL, () => get_mcp_status())

  ipcMain.handle(GET_SYNC_STATUS_CHANNEL, () => get_sync_status())
  ipcMain.handle(CONNECT_SYNC_CHANNEL, (_event, server_url: string, token: string, direction: SyncDirection) => connect_sync(server_url, token, direction))
  ipcMain.handle(DISCONNECT_SYNC_CHANNEL, () => disconnect_sync())
  ipcMain.handle(SYNC_NOW_CHANNEL, () => sync_now())
}

// ============================================================================
// Outside changes
// ============================================================================

// Checks the database every second and tells each window when another program has changed it.
function watch_for_outside_changes(): void {
  setInterval(() => {
    if (!has_changed_elsewhere()) return
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(DATABASE_CHANGED_CHANNEL)
  }, 1000)
}

// ============================================================================
// Lifecycle
// ============================================================================

app.whenReady().then(() => {
  open_task_database(process.env.X_TASKS_DB ?? join(app.getPath('userData'), 'tasks.db'))
  // The page's light and dark colours follow this, so it is set before the window opens.
  nativeTheme.themeSource = get_settings().theme
  register_bridge_handlers()
  void restart_mcp_server()
  create_main_window()
  watch_for_outside_changes()
  schedule_automatic_backups()
  start_sync(node_sync_storage, announce_sync_change)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) create_main_window()
  })
})

app.on('will-quit', () => {
  stop_sync()
  void stop_mcp_server()
  close_task_database()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
