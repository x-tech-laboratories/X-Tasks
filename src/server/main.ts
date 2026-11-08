import { schedule_automatic_backups } from '../main/database_backups'
import { stop_mcp_server } from '../main/mcp_server'
import { open_task_database } from '../main/node_task_database'
import { close_task_database, has_changed_elsewhere } from '../main/task_database'
import { build_app } from './app.ts'
import { restart_mcp_server } from './bridge_handlers.ts'
import { read_config } from './config.ts'
import { announce_change } from './events.ts'

// ============================================================================
// Lifecycle
// ============================================================================

// Checks the database every second and tells each page when another program has changed it.
function watch_for_outside_changes(): void {
  setInterval(() => {
    if (has_changed_elsewhere()) announce_change()
  }, 1000)
}

async function main(): Promise<void> {
  const config = read_config()
  open_task_database(config.database_path)

  const app = await build_app({ web_folder: config.web_folder, access_token: config.access_token })
  void restart_mcp_server({ announce_change_to_all: () => announce_change() })
  watch_for_outside_changes()
  schedule_automatic_backups()

  await app.listen({ port: config.port, host: config.host })
  const shown_host = config.host.includes(':') ? `[${config.host}]` : config.host
  console.log(`x-tasks server on http://${shown_host}:${config.port}, using ${config.database_path}`)

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
