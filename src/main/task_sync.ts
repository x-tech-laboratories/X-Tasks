import { create_sync_engine, type SyncedTable } from '@x-tech-laboratories/x-libs/sync_engine'

import { DEVICE_ONLY_SETTINGS } from '@shared/settings'
import { forget_touched_tasks } from './task_versions'

// ============================================================================
// Synced tables
// ============================================================================

// Parents come before children, so a batch adds groups before their tags and tasks before their tags and completions.
const TASK_SYNC_TABLES: SyncedTable[] = [
  { name: 'tag_groups', key_columns: ['id'] },
  { name: 'tags', key_columns: ['id'] },
  { name: 'tasks', key_columns: ['id'] },
  { name: 'task_tags', key_columns: ['task_id', 'tag_id'] },
  { name: 'task_dependencies', key_columns: ['task_id', 'depends_on_id'] },
  { name: 'task_completions', key_columns: ['uid'], local_columns: ['id'] },
  { name: 'task_versions', key_columns: ['uid'], local_columns: ['id'] },
  { name: 'settings', key_columns: ['key'], local_keys: DEVICE_ONLY_SETTINGS }
]

// ============================================================================
// Engine
// ============================================================================

// The device that made each change sends its own version of the task, so hearing of the change records none.
export const task_sync = create_sync_engine({ tables: TASK_SYNC_TABLES, after_apply: forget_touched_tasks })
