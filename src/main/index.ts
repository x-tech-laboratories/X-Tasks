import { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, screen, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { launch_command, set_autostart } from '@x-tech-laboratories/x-libs/autostart'
import { certificate_method_names } from '@x-tech-laboratories/x-libs/certificate_protocol'
import { bring_to_front, first_argument, hold_single_instance } from '@x-tech-laboratories/x-libs/electron/app'
import { create_window } from '@x-tech-laboratories/x-libs/electron/window'
import { call_daemon, daemon_log_path, daemon_socket_path, follow_daemon_events, start_daemon } from '@x-tech-laboratories/x-libs/local_daemon'

import { certificate_bridge, DESKTOP_SETTINGS_METHODS, SERVED_SETTINGS_METHODS, settings_bridge, TASKS_METHODS, tasks_bridge, tasks_events } from '@shared/bridges'
import type { Settings } from '@shared/settings'
import { TAKE_LAUNCH_TASK_CHANNEL, task_id_from_link, type Task } from '@shared/tasks'
import { entry_seconds, running_entries, type TimeEntry } from '@shared/time_tracking'
import { CHANGED_EVENT, CLIENT_ID_HEADER, HELLO_EVENT } from '@shared/web_api'
import { apply_tray_setting, is_tray_shown, refresh_tray, stop_tray, type TrayHost } from './tray'

// ============================================================================
// Profile
// ============================================================================

// The window: Electron's main process, which shows X-Tasks and leaves the work to the daemon in src/daemon, reached over a Unix socket.

// Dev runs set this so Electron's own profile stays apart from the installed app's.
if (process.env.X_TASKS_USER_DATA) app.setPath('userData', process.env.X_TASKS_USER_DATA)
// Flatpak moves the config folder into its sandbox; the Flatpak may write ~/.config/x-tasks, so it keeps the profile the other builds use.
else if (process.env.FLATPAK_ID) app.setPath('userData', join(homedir(), '.config', 'x-tasks'))

// The database a run uses: a test database when X_TASKS_DB names one, otherwise the profile's.
const is_own_database = process.env.X_TASKS_DB === undefined
const database_path = process.env.X_TASKS_DB ?? join(app.getPath('userData'), 'tasks.db')

// A test database gets a daemon, socket and log of its own, so a test run never reaches the user's daemon.
const socket_path = daemon_socket_path({ app: 'x-tasks', data_file: is_own_database ? null : database_path })
const log_file = is_own_database ? daemon_log_path('x-tasks') : join(dirname(database_path), 'daemon.log')

// The built app sits in out/main, and resources/ beside out/ both in the source tree and in the package.
const icon_path = join(__dirname, '../../resources/icon.png')

// The command that starts this app again, which the login entry runs and the daemon runs to open a task from a notification.
const own_command = (args: string[]): string[] =>
  launch_command({ launcher: process.env.X_TASKS_LAUNCHER, is_packaged: app.isPackaged, app_path: app.getAppPath(), args })

// ============================================================================
// Daemon
// ============================================================================

function ensure_daemon(): Promise<unknown> {
  return start_daemon({
    socket_path,
    script: join(__dirname, 'daemon.js'),
    env: { X_TASKS_DB: database_path, X_TASKS_SOCKET: socket_path, X_TASKS_ICON: icon_path },
    log_file
  })
}

// Given by the daemon when this process connects, so the window is not told about its own changes.
let client_id = ''

// One call to the daemon, as the page made it.
function call(method: string, args: unknown[]): Promise<unknown> {
  return call_daemon(socket_path, `/api/${method}`, args, { [CLIENT_ID_HEADER]: client_id })
}

// Every call in a table, passed on to the daemon under a path of its own.
function forwarded(names: readonly string[], prefix = ''): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => call(`${prefix}${name}`, args)]))
}

function get_settings(): Promise<Settings> {
  return call('get_settings', []) as Promise<Settings>
}

// Settings the window itself acts on: the colours, the tray, and starting at login.
async function apply_window_settings(): Promise<void> {
  const settings = await get_settings()
  nativeTheme.themeSource = settings.theme
  apply_tray_setting(settings.show_tray_icon, tray_host)
  apply_autostart(settings)
}

// Only the user's own database starts at login; a test run never writes the login entry.
function apply_autostart(settings: Settings): void {
  if (!is_own_database) return
  set_autostart(
    { id: 'x-tasks-daemon', name: 'X-Tasks in the background', comment: 'Reminders, sync and backups for X-Tasks', icon: icon_path, command: own_command(['--daemon']) },
    settings.start_at_login && settings.keep_running_in_background
  )
}

// Every window hears of the daemon's changes, and comes back to a daemon that stopped, such as one quit from another window.
let is_quitting = false
let stop_following = (): void => {}

function follow_daemon(): void {
  stop_following = follow_daemon_events(
    socket_path,
    '/api/events',
    (event, data) => {
      if (event === HELLO_EVENT) client_id = data
      if (event === CHANGED_EVENT) announce_change()
    },
    {
      // A reconnect may have missed changes, so the windows fetch again.
      on_connect: announce_change,
      on_disconnect: () => {
        if (!is_quitting) void ensure_daemon().catch((error: unknown) => console.error(error))
      }
    }
  )
}

function announce_change(): void {
  tasks_events.emit(BrowserWindow.getAllWindows(), 'database_changed', null)
  void apply_window_settings().catch(() => undefined)
  void refresh_tray(tray_host)
}

// ============================================================================
// Window
// ============================================================================

// Opens the page with the size and place it had last time.
function create_main_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    title: 'X-Tasks',
    icon: icon_path,
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

function shown_window(): BrowserWindow {
  const window = BrowserWindow.getAllWindows()[0] ?? create_main_window()
  bring_to_front(window)
  return window
}

// Stops the daemon as well, so nothing runs until the app is opened again.
async function quit_completely(): Promise<void> {
  is_quitting = true
  await call('stop_daemon', []).catch(() => undefined)
  app.quit()
}

// ============================================================================
// Tray icon
// ============================================================================

async function list_tray_timers() {
  const [tasks, entries, settings] = (await Promise.all([call('list_tasks', []), call('list_time_entries', []), get_settings()])) as [Task[], TimeEntry[], Settings]
  const now = new Date()
  return running_entries(entries, settings.allow_several_timers).map((entry) => ({
    task_id: entry.task_id,
    title: tasks.find((task) => task.id === entry.task_id)?.title ?? 'Removed task',
    seconds: entry_seconds(entry, now)
  }))
}

// The tray brings the window forward, making one again if it was closed, and opens tasks in it as a task link does.
// Its own changes go without a client id, so the window hears of them.
const tray_host: TrayHost = {
  icon_path,
  list_timers: list_tray_timers,
  stop_timers: () => call_daemon(socket_path, '/api/stop_timer', [new Date().toISOString(), null]).then(() => undefined),
  show_window: () => void shown_window(),
  open_task: (task_id) => tasks_events.emit([shown_window()], 'open_task', task_id),
  quit: () => {
    is_quitting = true
    app.quit()
  },
  quit_completely: () => void quit_completely()
}

// ============================================================================
// Task links
// ============================================================================

// The task a link at launch asked for, kept until the page is ready to take it.
let launch_task_id: string | null = null

// A second launch, such as a clicked task link or a reminder, brings the window forward, making one if it was closed, and opens the task it names.
function open_from_second_launch(argv: string[]): void {
  if (argv.includes('--daemon')) return
  const main_window = shown_window()
  const task_id = first_argument(argv, task_id_from_link)
  if (task_id) tasks_events.emit([main_window], 'open_task', task_id)
}

// ============================================================================
// Saving files
// ============================================================================

// The save dialog starts in the Downloads folder with the suggested name, offering files of its kind.
async function save_text_file(file_name: string, text: string): Promise<boolean> {
  const extension = extname(file_name).slice(1)
  const options = { defaultPath: join(app.getPath('downloads'), file_name), filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [] }
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { canceled, filePath } = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return false
  await writeFile(filePath, text)
  return true
}

// ============================================================================
// Bridge handlers
// ============================================================================

// The page's calls go to the daemon, but for those that need the screen: folders, dialogs, the idle time and quitting.
function register_bridge_handlers(): void {
  tasks_bridge.handle(ipcMain, forwarded(TASKS_METHODS) as never)

  const window_methods = ['show_database_folder', 'show_backup_folder', 'save_text_file', 'get_idle_seconds', 'quit_completely']
  const settings_handlers = {
    ...forwarded([...SERVED_SETTINGS_METHODS, ...DESKTOP_SETTINGS_METHODS.filter((name) => !window_methods.includes(name))]),
    set_setting: async <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      await call('set_setting', [key, value])
      await apply_window_settings()
    },
    restore_backup: async (name: string) => {
      await call('restore_backup', [name])
      await apply_window_settings()
    },
    show_database_folder: () => shell.showItemInFolder(database_path),
    show_backup_folder: () => shell.openPath(join(dirname(database_path), 'backups')).then(() => undefined),
    save_text_file,
    get_idle_seconds: () => powerMonitor.getSystemIdleTime(),
    quit_completely
  }
  settings_bridge.handle(ipcMain, settings_handlers as unknown as Parameters<typeof settings_bridge.handle>[1])
  certificate_bridge.handle(ipcMain, forwarded(certificate_method_names, 'certificates/') as never)

  ipcMain.handle(TAKE_LAUNCH_TASK_CHANNEL, () => {
    const task_id = launch_task_id
    launch_task_id = null
    return task_id
  })
}

// ============================================================================
// Lifecycle
// ============================================================================

function start_app(): void {
  launch_task_id = first_argument(process.argv, task_id_from_link)

  app.whenReady().then(async () => {
    try {
      await ensure_daemon()
    } catch (error) {
      dialog.showErrorBox('X-Tasks could not start', `${error instanceof Error ? error.message : String(error)}\n\nSee ${log_file}.`)
      app.exit(1)
      return
    }
    register_bridge_handlers()
    follow_daemon()
    // The page's light and dark colours follow the theme, so it is set before the window opens.
    await apply_window_settings().catch(() => undefined)
    create_main_window()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) create_main_window()
    })
  })

  app.on('will-quit', () => {
    is_quitting = true
    stop_following()
    stop_tray()
  })

  // Closing the window ends only the window, or leaves the app in the tray; the daemon runs on either way.
  app.on('window-all-closed', () => {
    if (!is_tray_shown()) app.quit()
  })
}

// `x-tasks --daemon`, as the login entry runs it, starts only the daemon.
async function start_daemon_alone(): Promise<void> {
  try {
    await ensure_daemon()
    app.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    app.exit(1)
  }
}

// Only the app on the default database takes task links from later launches, so a run on a test database never hands off to it.
if (process.argv.includes('--daemon')) void start_daemon_alone()
else if (!is_own_database || hold_single_instance(app, open_from_second_launch)) start_app()
