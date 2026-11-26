import type { NamedParams } from '@x-tech-laboratories/x-libs/api_spec'

import type { BridgeHandlers } from './bridge_handlers.ts'
import { task_item_calls } from '@shared/task_items'

// ============================================================================
// Argument names
// ============================================================================

// One name for each argument a call takes, in order, so a call given too few or too many fails to compile.
type NamesOf<Handler> = Handler extends (...args: infer Args) => unknown ? { readonly [Index in keyof Args]: string } : never

// Each served call's argument names, so other programs may send the arguments by name as a JSON object as well as a list.
const BRIDGE_ARGUMENT_NAMES: { [Method in keyof BridgeHandlers]: NamesOf<BridgeHandlers[Method]> } = {
  list_tasks: [],
  add_task: ['title', 'parent_id', 'tag_ids', 'my_day_on'],
  set_task_done: ['task_id', 'is_done', 'done_at', 'log_change'],
  set_task_title: ['task_id', 'title'],
  set_task_notes: ['task_id', 'notes'],
  set_task_schedule: ['task_id', 'schedule'],
  set_task_my_day: ['task_id', 'my_day_on'],
  set_task_estimate: ['task_id', 'estimate_minutes'],
  set_task_reminders: ['task_id', 'reminders'],
  remove_task: ['task_id'],
  move_task: ['task_id', 'parent_id', 'position'],
  tag_task: ['task_id', 'tag_id'],
  untag_task: ['task_id', 'tag_id'],
  link_tasks: ['task_id', 'other_id', 'relationship_id'],
  unlink_tasks: ['task_id', 'other_id'],
  list_completions: [],
  list_task_versions: ['task_id'],
  list_recent_versions: ['limit'],
  restore_task_version: ['version_id'],
  list_time_entries: [],
  start_timer: ['task_id', 'started_at'],
  stop_timer: ['ended_at', 'task_id'],
  remove_time_entry: ['entry_id'],
  get_pomodoro: [],
  start_pomodoro: ['task_id', 'started_at'],
  next_pomodoro_round: ['started_at'],
  skip_pomodoro_break: [],
  stop_pomodoro: [],
  tick_pomodoro: ['now'],
  list_tag_groups: [],
  add_tag_group: ['name', 'is_rule'],
  update_tag_group: ['group_id', 'name', 'is_rule', 'is_single_choice'],
  remove_tag_group: ['group_id'],
  move_tag_group: ['group_id', 'position'],
  list_tags: [],
  add_tag: ['name', 'group_id', 'parent_id', 'rule', 'color', 'icon', 'shows_on_rows'],
  update_tag: ['tag_id', 'name', 'rule', 'color', 'icon', 'shows_on_rows'],
  remove_tag: ['tag_id'],
  move_tag: ['tag_id', 'parent_id', 'position'],
  get_settings: [],
  set_setting: ['key', 'value'],
  get_database_path: [],
  list_backups: [],
  create_backup: [],
  restore_backup: ['name'],
  remove_backup: ['name'],
  get_mcp_status: []
}

// Every argument is required by name, as in a list; a value of null is given as null.
export const call_params: Record<string, NamedParams> = {
  ...Object.fromEntries(Object.entries(BRIDGE_ARGUMENT_NAMES).map(([method, names]) => [method, { params: names.map((name) => ({ name })) }])),
  ...task_item_calls.api
}
