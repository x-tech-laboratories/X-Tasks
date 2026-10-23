import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'

import { LIST_TASKS_CHANNEL, SAVE_TASKS_CHANNEL, type Task } from '@shared/tasks'
import { read_tasks, write_tasks } from './task_store'

// ============================================================================
// Window
// ============================================================================

function create_main_window(): BrowserWindow {
  const main_window = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 480,
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
  ipcMain.handle(LIST_TASKS_CHANNEL, () => read_tasks())
  ipcMain.handle(SAVE_TASKS_CHANNEL, (_event, tasks: Task[]) => write_tasks(tasks))
}

// ============================================================================
// Lifecycle
// ============================================================================

app.whenReady().then(() => {
  register_bridge_handlers()
  create_main_window()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) create_main_window()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
