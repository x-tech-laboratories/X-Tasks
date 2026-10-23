import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'

import {
  ADD_TASK_CHANNEL, ADD_TASK_LIST_CHANNEL, LIST_TASKS_CHANNEL, LIST_TASK_LISTS_CHANNEL, REMOVE_TASK_CHANNEL,
  REMOVE_TASK_LIST_CHANNEL, SET_TASK_DONE_CHANNEL
} from '@shared/tasks'
import {
  add_task, add_task_list, close_task_database, list_task_lists, list_tasks, open_task_database, remove_task,
  remove_task_list, set_task_done
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
// Bridge handlers
// ============================================================================

function register_bridge_handlers(): void {
  ipcMain.handle(LIST_TASKS_CHANNEL, () => list_tasks())
  ipcMain.handle(ADD_TASK_CHANNEL, (_event, title: string, list_id: string | null, parent_id: string | null) =>
    add_task(title, list_id, parent_id)
  )
  ipcMain.handle(SET_TASK_DONE_CHANNEL, (_event, task_id: string, is_done: boolean) => set_task_done(task_id, is_done))
  ipcMain.handle(REMOVE_TASK_CHANNEL, (_event, task_id: string) => remove_task(task_id))

  ipcMain.handle(LIST_TASK_LISTS_CHANNEL, () => list_task_lists())
  ipcMain.handle(ADD_TASK_LIST_CHANNEL, (_event, name: string) => add_task_list(name))
  ipcMain.handle(REMOVE_TASK_LIST_CHANNEL, (_event, list_id: string) => remove_task_list(list_id))
}

// ============================================================================
// Lifecycle
// ============================================================================

app.whenReady().then(() => {
  open_task_database()
  register_bridge_handlers()
  create_main_window()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) create_main_window()
  })
})

app.on('will-quit', () => close_task_database())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
