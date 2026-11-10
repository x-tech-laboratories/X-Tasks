import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { read_server_config } from '@x-tech-laboratories/x-libs/server/config'
import { load_accounts } from '@x-tech-laboratories/x-libs/server/passwords'

import { schedule_automatic_backups } from '../main/database_backups'
import { stop_mcp_server } from '../main/mcp_server'
import { open_task_database } from '../main/node_task_database'
import { close_task_database, has_changed_elsewhere } from '../main/task_database'
import { build_app, changes } from './app.ts'
import { restart_mcp_server } from './bridge_handlers.ts'

// ============================================================================
// Configuration
// ============================================================================

// The database is never guessed, so the server cannot open the desktop app's own file by accident.
function read_config() {
  return read_server_config({
    program: 'x-tasks-server',
    summary: 'Serves X-Tasks as a web app.',
    env_prefix: 'X_TASKS',
    default_port: 3918,
    secret: false,
    web_folder_default: join(dirname(fileURLToPath(import.meta.url)), '../web'),
    options: { database: { variable: 'X_TASKS_DB', help: 'the task database; it is made if missing', placeholder: '<file>', required: true } }
  })
}

// ============================================================================
// Lifecycle
// ============================================================================

// Checks the database every second and tells each page when another program has changed it.
function watch_for_outside_changes(): void {
  setInterval(() => {
    if (has_changed_elsewhere()) changes.announce_change()
  }, 1000)
}

async function main(): Promise<void> {
  const config = read_config()
  const database_path = config.values.database!
  open_task_database(database_path)

  const app = await build_app({ web_folder: config.web_folder, declared: load_accounts('X_TASKS_PASSWORD_HASH_FILE') })
  void restart_mcp_server({ announce_change_to_all: () => changes.announce_change() })
  watch_for_outside_changes()
  schedule_automatic_backups()

  await app.listen({ port: config.port, host: config.host })
  const shown_host = config.host.includes(':') ? `[${config.host}]` : config.host
  console.log(`x-tasks server on http://${shown_host}:${config.port}, using ${database_path}`)

  const shut_down = (): void => {
    void app
      .close()
      .then(() => stop_mcp_server())
      .then(() => {
        close_task_database()
        process.exit(0)
      })
  }
  process.on('SIGINT', shut_down)
  process.on('SIGTERM', shut_down)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
