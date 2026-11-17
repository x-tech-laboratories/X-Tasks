import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'

import { entry_seconds, running_entries } from '@shared/time_tracking'
import { get_settings, list_tasks, list_time_entries, stop_timer } from './task_database'
import { tray_items, tray_tooltip, type TrayItem, type TrayTimer } from './tray_menu'

// ============================================================================
// Tray icon
// ============================================================================

// What the tray needs from the app: its icon, and ways to show the window, open a task, tell windows of a change and quit.
export interface TrayHost {
  icon_path: string
  show_window: () => void
  open_task: (task_id: string) => void
  announce_change: () => void
  quit: () => void
}

// How often the tray reads the running timers again, so its times keep up.
const REFRESH_MS = 5000

let tray: Tray | null = null
let refresh_timer: ReturnType<typeof setInterval> | undefined

// Shows or takes away the icon, as the setting says.
export function apply_tray_setting(is_shown: boolean, host: TrayHost): void {
  if (is_shown && !tray) start_tray(host)
  if (!is_shown && tray) stop_tray()
}

export function stop_tray(): void {
  clearInterval(refresh_timer)
  tray?.destroy()
  tray = null
}

function start_tray(host: TrayHost): void {
  tray = new Tray(nativeImage.createFromPath(host.icon_path).resize({ width: 22, height: 22 }))
  tray.on('click', host.show_window)
  refresh_tray(host)
  refresh_timer = setInterval(() => refresh_tray(host), REFRESH_MS)
}

function running_timers(): TrayTimer[] {
  const tasks = list_tasks()
  const now = new Date()
  return running_entries(list_time_entries(), get_settings().allow_several_timers).map((entry) => ({
    task_id: entry.task_id,
    title: tasks.find((task) => task.id === entry.task_id)?.title ?? 'Removed task',
    seconds: entry_seconds(entry, now)
  }))
}

function refresh_tray(host: TrayHost): void {
  if (!tray || tray.isDestroyed()) return
  const timers = running_timers()
  tray.setToolTip(tray_tooltip(timers))
  tray.setContextMenu(Menu.buildFromTemplate(tray_items(timers).map((item) => menu_item(item, host))))
}

function menu_item(item: TrayItem, host: TrayHost): MenuItemConstructorOptions {
  if (item.kind === 'separator') return { type: 'separator' }
  if (item.kind === 'timer') return { label: item.label, click: () => host.open_task(item.task_id) }
  switch (item.command) {
    case 'stop_timers':
      return {
        label: item.label,
        click: () => {
          stop_timer(new Date().toISOString(), null)
          host.announce_change()
          refresh_tray(host)
        }
      }
    case 'show': return { label: item.label, click: host.show_window }
    case 'quit': return { label: item.label, click: host.quit }
  }
}
