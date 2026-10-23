import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'

import {
  CREATE_BACKUP_CHANNEL, GET_DATABASE_PATH_CHANNEL, GET_SETTINGS_CHANNEL, LIST_BACKUPS_CHANNEL, REMOVE_BACKUP_CHANNEL,
  RESTORE_BACKUP_CHANNEL, SET_SETTING_CHANNEL, SHOW_BACKUP_FOLDER_CHANNEL, SHOW_DATABASE_FOLDER_CHANNEL, GET_MCP_STATUS_CHANNEL, type Settings
} from '@shared/settings'
import {
  ADD_TAG_CHANNEL, ADD_TAG_GROUP_CHANNEL, ADD_TASK_CHANNEL, DATABASE_CHANGED_CHANNEL, LIST_COMPLETIONS_CHANNEL, LIST_TAG_GROUPS_CHANNEL, LIST_TAGS_CHANNEL, LIST_TASKS_CHANNEL,
  MOVE_TAG_CHANNEL, MOVE_TAG_GROUP_CHANNEL, MOVE_TASK_CHANNEL, REMOVE_TAG_CHANNEL, REMOVE_TAG_GROUP_CHANNEL, REMOVE_TASK_CHANNEL, SET_TAG_GROUP_SINGLE_CHOICE_CHANNEL, SET_TASK_DONE_CHANNEL, SET_TASK_MY_DAY_CHANNEL, SET_TASK_NOTES_CHANNEL, SET_TASK_SCHEDULE_CHANNEL,
  UPDATE_TAG_CHANNEL, SET_TASK_TITLE_CHANNEL, TAG_TASK_CHANNEL, UNTAG_TASK_CHANNEL, type CompletionLogChange, type TagRule, type TaskSchedule
} from '@shared/tasks'
import { apply_mcp_settings, get_mcp_status, stop_mcp_server } from './mcp_server'
import { backup_folder, create_backup, list_backups, remove_backup, restore_backup, run_automatic_backup } from './database_backups'
import {
  add_tag, add_tag_group, add_task, apply_priority_scale, close_task_database, get_settings, has_changed_elsewhere, list_completions, list_tag_groups, list_tags,
  list_tasks, move_tag, move_tag_group, move_task, open_task_database, remove_tag, remove_tag_group, remove_task, set_setting, set_tag_group_single_choice, update_tag,
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

// The MCP endpoint writes through the app's own connection, which the outside-change check never sees, so it tells the windows itself.
function announce_mcp_change(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(DATABASE_CHANGED_CHANNEL)
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
  ipcMain.handle(ADD_TAG_GROUP_CHANNEL, (_event, name: string) => add_tag_group(name))
  ipcMain.handle(REMOVE_TAG_GROUP_CHANNEL, (_event, group_id: string) => remove_tag_group(group_id))
  ipcMain.handle(SET_TAG_GROUP_SINGLE_CHOICE_CHANNEL, (_event, group_id: string, is_single_choice: boolean) =>
    set_tag_group_single_choice(group_id, is_single_choice)
  )
  ipcMain.handle(MOVE_TAG_GROUP_CHANNEL, (_event, group_id: string, position: number) => move_tag_group(group_id, position))

  ipcMain.handle(LIST_TAGS_CHANNEL, () => list_tags())
  ipcMain.handle(ADD_TAG_CHANNEL, (_event, name: string, group_id: string, parent_id: string | null, rule: TagRule | null) =>
    add_tag(name, group_id, parent_id, rule)
  )
  ipcMain.handle(UPDATE_TAG_CHANNEL, (_event, tag_id: string, name: string, rule: TagRule | null) => update_tag(tag_id, name, rule))
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
  // The restored data brings its own settings, so its theme and MCP endpoint are applied straight away.
  ipcMain.handle(RESTORE_BACKUP_CHANNEL, (_event, name: string) => {
    restore_backup(name)
    nativeTheme.themeSource = get_settings().theme
    void restart_mcp_server()
  })
  ipcMain.handle(REMOVE_BACKUP_CHANNEL, (_event, name: string) => remove_backup(name))
  ipcMain.handle(SHOW_BACKUP_FOLDER_CHANNEL, () => shell.openPath(backup_folder()).then(() => undefined))

  ipcMain.handle(GET_MCP_STATUS_CHANNEL, () => get_mcp_status())
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
// Automatic backups
// ============================================================================

const AUTOMATIC_BACKUP_CHECK_MS = 60 * 60 * 1000

// A failed backup is logged rather than thrown, so it never stops the app.
function keep_automatic_backups(): void {
  const settings = get_settings()
  if (!settings.auto_backup) return

  try {
    run_automatic_backup(settings.auto_backups_to_keep)
  } catch (error) {
    console.error('automatic backup failed:', error)
  }
}

// The app can stay open for days, so it checks every hour whether a day has passed since the last backup.
function schedule_automatic_backups(): void {
  keep_automatic_backups()
  setInterval(keep_automatic_backups, AUTOMATIC_BACKUP_CHECK_MS)
}

// ============================================================================
// Lifecycle
// ============================================================================

app.whenReady().then(() => {
  open_task_database()
  // The page's light and dark colours follow this, so it is set before the window opens.
  nativeTheme.themeSource = get_settings().theme
  register_bridge_handlers()
  void restart_mcp_server()
  create_main_window()
  watch_for_outside_changes()
  schedule_automatic_backups()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) create_main_window()
  })
})

app.on('will-quit', () => {
  void stop_mcp_server()
  close_task_database()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
