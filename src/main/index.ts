import { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import { homedir, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { bring_to_front, first_argument, hold_single_instance } from '@x-tech-laboratories/x-libs/electron/app'
import { create_window } from '@x-tech-laboratories/x-libs/electron/window'
import { file_sync_storage } from '@x-tech-laboratories/x-libs/sync_file_storage'
import { sync_device_methods } from '@x-tech-laboratories/x-libs/sync_client'

import { settings_bridge, tasks_bridge, tasks_events } from '@shared/bridges'
import type { Settings } from '@shared/settings'
import { TAKE_LAUNCH_TASK_CHANNEL, task_id_from_link } from '@shared/tasks'
import { apply_mcp_settings, get_mcp_status, stop_mcp_server } from './mcp_server'
import { open_task_database } from './node_task_database'
import { apply_trusted_certificates, get_trusted_certificate, inspect_server_certificate, set_trusted_certificate } from './trusted_certificate'
import { backup_folder, create_backup, keep_automatic_backups, list_backups, remove_backup, restore_backup, schedule_automatic_backups } from './database_backups'
import {
  add_tag, add_tag_group, add_task, link_tasks, close_task_database, get_settings, has_changed_elsewhere, list_completions, list_tag_groups, list_tags,
  list_tasks, move_tag, move_tag_group, move_task, remove_tag, remove_tag_group, remove_task, unlink_tasks, set_setting, update_tag, update_tag_group,
  set_task_done, set_task_my_day, set_task_notes, set_task_schedule, set_task_title, tag_task, task_database_path,
  untag_task, list_task_versions, list_recent_versions, restore_task_version
} from './task_database'
import { create_task_sync_client } from './task_sync_client'

// ============================================================================
// Profile
// ============================================================================

// Dev runs set this so Electron's own profile stays apart from the installed app's.
if (process.env.X_TASKS_USER_DATA) app.setPath('userData', process.env.X_TASKS_USER_DATA)
// Flatpak moves the config folder into its sandbox; the Flatpak may write ~/.config/x-tasks, so it keeps the profile the other builds use.
else if (process.env.FLATPAK_ID) app.setPath('userData', join(homedir(), '.config', 'x-tasks'))

// ============================================================================
// Window
// ============================================================================

// Opens the page with the size and place it had last time.
function create_main_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    title: 'X-Tasks',
    // The built app sits in out/main, and resources/ beside out/ both in the source tree and in the package.
    icon: join(__dirname, '../../resources/icon.png'),
    // electron-vite emits an ESM preload as .mjs; loading .js here silently yields no bridge.
    preload: join(__dirname, '../preload/index.mjs'),
    dev_url: !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined,
    file: join(__dirname, '../renderer/index.html'),
    default_size: { width: 1100, height: 700 },
    min_size: { width: 640, height: 400 },
    background: { light: '#f5f6f8', dark: '#0f1115' },
    native_theme: nativeTheme,
    shell,
    screen,
    state_file: join(app.getPath('userData'), 'window.json')
  })
}

// ============================================================================
// MCP endpoint
// ============================================================================

// The MCP endpoint and sync write through the app's own connection, which the outside-change check never sees, so they tell the windows themselves.
function announce_mcp_change(): void {
  tasks_events.emit(BrowserWindow.getAllWindows(), 'database_changed', null)
}

// Changes from other devices can include the theme, which the window's colours follow.
function announce_sync_change(): void {
  nativeTheme.themeSource = get_settings().theme
  announce_mcp_change()
}

// The database a run uses: a test database when X_TASKS_DB names one, otherwise the profile's.
const database_path = process.env.X_TASKS_DB ?? join(app.getPath('userData'), 'tasks.db')

// The server and token live in sync.json beside the database, so a scratch database never syncs with the real server.
const sync = create_task_sync_client(
  file_sync_storage({ file: join(dirname(database_path), 'sync.json'), back_up_before_download: () => create_backup().then(() => undefined) }),
  `X-Tasks on ${hostname()}`,
  announce_sync_change
)

function restart_mcp_server(): Promise<void> {
  return apply_mcp_settings(get_settings(), announce_mcp_change)
}

// ============================================================================
// Task links
// ============================================================================

// The task a link at launch asked for, kept until the page is ready to take it.
let launch_task_id: string | null = null

// A second launch, such as a clicked task link, brings this window forward and opens the task it names.
function open_from_second_launch(argv: string[]): void {
  const main_window = BrowserWindow.getAllWindows()[0]
  if (!main_window) return
  bring_to_front(main_window)
  const task_id = first_argument(argv, task_id_from_link)
  if (task_id) tasks_events.emit([main_window], 'open_task', task_id)
}

// ============================================================================
// Bridge handlers
// ============================================================================

function register_bridge_handlers(): void {
  tasks_bridge.handle(ipcMain, {
    list_tasks, add_task, set_task_done, set_task_title, set_task_notes, set_task_schedule, set_task_my_day, remove_task, move_task, tag_task, untag_task,
    link_tasks, unlink_tasks, list_completions, list_task_versions, list_recent_versions, restore_task_version,
    list_tag_groups, add_tag_group, update_tag_group, remove_tag_group, move_tag_group,
    list_tags, add_tag, update_tag, remove_tag, move_tag
  })

  settings_bridge.handle(ipcMain, {
    get_settings,
    set_setting: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      set_setting(key, value)
      if (key === 'theme') nativeTheme.themeSource = value as Settings['theme']
      if (key === 'mcp_enabled' || key === 'mcp_port') void restart_mcp_server()
      if (key === 'auto_backup' || key === 'auto_backups_to_keep') keep_automatic_backups()
    },
    get_database_path: task_database_path,
    show_database_folder: () => shell.showItemInFolder(task_database_path()),

    list_backups,
    create_backup: () => create_backup(),
    // The restored data brings its own settings, so its theme and MCP endpoint are applied straight away, and sync asks which copy to keep.
    restore_backup: async (name) => {
      await restore_backup(name)
      nativeTheme.themeSource = get_settings().theme
      void restart_mcp_server()
      void sync.sync_now()
    },
    remove_backup,
    show_backup_folder: () => shell.openPath(backup_folder()).then(() => undefined),

    get_mcp_status,

    ...sync_device_methods(sync),
    get_trusted_certificate, set_trusted_certificate, inspect_server_certificate
  })

  ipcMain.handle(TAKE_LAUNCH_TASK_CHANNEL, () => {
    const task_id = launch_task_id
    launch_task_id = null
    return task_id
  })
}

// ============================================================================
// Outside changes
// ============================================================================

// Checks the database every second and tells each window when another program has changed it.
function watch_for_outside_changes(): void {
  setInterval(() => {
    if (!has_changed_elsewhere()) return
    tasks_events.emit(BrowserWindow.getAllWindows(), 'database_changed', null)
  }, 1000)
}

// ============================================================================
// Lifecycle
// ============================================================================

function start_app(): void {
  launch_task_id = first_argument(process.argv, task_id_from_link)

  app.whenReady().then(() => {
    open_task_database(database_path)
    apply_trusted_certificates()
    // The page's light and dark colours follow this, so it is set before the window opens.
    nativeTheme.themeSource = get_settings().theme
    register_bridge_handlers()
    void restart_mcp_server()
    // The page has its own controls, so Electron's default File/Edit/View menu bar is dropped.
    Menu.setApplicationMenu(null)
    create_main_window()
    watch_for_outside_changes()
    schedule_automatic_backups()
    sync.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) create_main_window()
    })
  })

  app.on('will-quit', () => {
    sync.stop()
    void stop_mcp_server()
    close_task_database()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// Only the app on the default database takes task links from later launches, so a run on a test database never hands off to it.
const takes_task_links = process.env.X_TASKS_DB === undefined

if (!takes_task_links || hold_single_instance(app, open_from_second_launch)) start_app()
