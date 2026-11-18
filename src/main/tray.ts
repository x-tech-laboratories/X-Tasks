import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'

import { tray_items, tray_tooltip, type TrayItem, type TrayTimer } from './tray_menu'

// ============================================================================
// Tray icon
// ============================================================================

// What the tray needs from the app: its icon, the running timers, and ways to stop them, show the window, open a task and quit.
export interface TrayHost {
  icon_path: string
  list_timers: () => Promise<TrayTimer[]>
  stop_timers: () => Promise<void>
  show_window: () => void
  open_task: (task_id: string) => void
  quit: () => void
  quit_completely: () => void
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

// While shown, closing the window leaves the app in the tray.
export function is_tray_shown(): boolean {
  return tray !== null
}

export function stop_tray(): void {
  clearInterval(refresh_timer)
  tray?.destroy()
  tray = null
}

function start_tray(host: TrayHost): void {
  tray = new Tray(nativeImage.createFromPath(host.icon_path).resize({ width: 22, height: 22 }))
  tray.on('click', host.show_window)
  void refresh_tray(host)
  refresh_timer = setInterval(() => void refresh_tray(host), REFRESH_MS)
}

// Also run when the data changed, so a timer started in the window shows at once.
export async function refresh_tray(host: TrayHost): Promise<void> {
  if (!tray || tray.isDestroyed()) return
  const timers = await host.list_timers().catch(() => [])
  if (!tray || tray.isDestroyed()) return
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
        click: () => void host.stop_timers().then(() => refresh_tray(host))
      }
    case 'show': return { label: item.label, click: host.show_window }
    case 'quit': return { label: item.label, click: host.quit }
    case 'quit_completely': return { label: item.label, click: host.quit_completely }
  }
}
