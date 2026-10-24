import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { create_backup } from './database_backups'
import type { SyncConfig, SyncStorage } from './sync_client'
import { task_database_path } from './task_database'

// ============================================================================
// Sync storage on Node
// ============================================================================

// The server and its token live in a file beside the database, so a scratch database never syncs with the real server.
function config_path(): string {
  return join(dirname(task_database_path()), 'sync.json')
}

// Only this user can read the file, since it holds the token.
export const node_sync_storage: SyncStorage = {
  read_config: () => (existsSync(config_path()) ? (JSON.parse(readFileSync(config_path(), 'utf8')) as SyncConfig) : null),
  write_config: (config) => {
    writeFileSync(config_path(), JSON.stringify(config, null, 2), { mode: 0o600 })
    chmodSync(config_path(), 0o600)
  },
  remove_config: () => rmSync(config_path(), { force: true }),
  back_up_before_download: () => void create_backup()
}
