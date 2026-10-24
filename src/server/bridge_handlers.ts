import type { Settings, SettingsApi } from '@shared/settings'
import type { TasksApi } from '@shared/tasks'
import type { WebMethod } from '@shared/web_api'
import { create_backup, keep_automatic_backups, list_backups, remove_backup, restore_backup } from '../main/database_backups'
import { apply_mcp_settings, get_mcp_status } from '../main/mcp_server'
import {
  add_tag, add_tag_group, add_task, apply_priority_scale, get_settings, list_completions, list_tag_groups, list_tags, list_tasks, move_tag, move_tag_group,
  move_task, remove_tag, remove_tag_group, remove_task, set_setting, set_task_done, set_task_my_day, set_task_notes, set_task_schedule, set_task_title,
  tag_task, task_database_path, untag_task, update_tag, update_tag_group
} from '../main/task_database'

// ============================================================================
// Handler table
// ============================================================================

type BridgeApi = TasksApi & SettingsApi

// Each bridge call the web page can make, answered the same way the desktop app's main process answers it.
type BridgeHandlers = {
  [Method in WebMethod]: BridgeApi[Method] extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Result | Promise<Result>
    : never
}

// What a handler needs from the server: telling every page that the data changed underneath them.
export interface BridgeContext {
  announce_change_to_all: () => void
}

export function restart_mcp_server(context: BridgeContext): Promise<void> {
  return apply_mcp_settings(get_settings(), context.announce_change_to_all)
}

export function create_bridge_handlers(context: BridgeContext): BridgeHandlers {
  return {
    list_tasks, add_task, set_task_done, set_task_title, set_task_notes, set_task_schedule, set_task_my_day, remove_task, move_task, tag_task, untag_task,
    list_completions, list_tag_groups, add_tag_group, update_tag_group, remove_tag_group, move_tag_group, list_tags, add_tag, update_tag, remove_tag, move_tag,

    get_settings,
    // The theme is left to each browser, since the server has no window of its own to recolour.
    set_setting: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      set_setting(key, value)
      if (key === 'priority_scale') apply_priority_scale(value as Settings['priority_scale'])
      if (key === 'mcp_enabled' || key === 'mcp_port') void restart_mcp_server(context)
      if (key === 'auto_backup' || key === 'auto_backups_to_keep') keep_automatic_backups()
    },
    get_database_path: task_database_path,
    list_backups,
    create_backup: () => create_backup(),
    // The restored data replaces what every open page shows, and brings its own MCP settings.
    restore_backup: (name) => {
      restore_backup(name)
      void restart_mcp_server(context)
      context.announce_change_to_all()
    },
    remove_backup,
    get_mcp_status
  }
}
