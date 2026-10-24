import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { schedule_automatic_backups } from '../main/database_backups'
import { stop_mcp_server } from '../main/mcp_server'
import { open_task_database } from '../main/node_task_database'
import { close_task_database, has_changed_elsewhere } from '../main/task_database'
import { restart_mcp_server } from './bridge_handlers'
import { announce_change, create_web_server } from './web_server'

// ============================================================================
// Configuration
// ============================================================================

const USAGE = `Usage: x-tasks-server --database <file> [--host <address>] [--port <number>] [--web-folder <folder>]

Serves X-Tasks as a web app. Every option can also be set in the environment:
  --database     X_TASKS_DB          the task database; it is made if missing
  --host         X_TASKS_HOST        the address to listen on (default 127.0.0.1)
  --port         X_TASKS_PORT        the port to listen on (default 3918)
  --web-folder   X_TASKS_WEB_FOLDER  the built web page (default: next to this program)

The access token browsers sign in with is read from the file named by X_TASKS_TOKEN_FILE,
or from X_TASKS_TOKEN. Without one the server only listens on this machine.`

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost']

interface ServerConfig {
  database_path: string
  host: string
  port: number
  web_folder: string
  access_token: string
}

function read_access_token(): string {
  const token_file = process.env.X_TASKS_TOKEN_FILE
  if (token_file) return readFileSync(token_file, 'utf8').trim()
  return (process.env.X_TASKS_TOKEN ?? '').trim()
}

// The database is never guessed, so the server cannot open the desktop app's own file by accident.
function read_config(): ServerConfig {
  const { values } = parseArgs({
    options: {
      database: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      'web-folder': { type: 'string' },
      help: { type: 'boolean' }
    }
  })
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }

  const database_path = values.database ?? process.env.X_TASKS_DB
  if (!database_path) throw new Error(`no database given\n\n${USAGE}`)

  const port = Number(values.port ?? process.env.X_TASKS_PORT ?? 3918)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`not a port: ${values.port ?? process.env.X_TASKS_PORT}`)

  const config: ServerConfig = {
    database_path,
    host: values.host ?? process.env.X_TASKS_HOST ?? '127.0.0.1',
    port,
    web_folder: values['web-folder'] ?? process.env.X_TASKS_WEB_FOLDER ?? join(dirname(fileURLToPath(import.meta.url)), '../web'),
    access_token: read_access_token()
  }
  if (config.access_token === '' && !LOOPBACK_HOSTS.includes(config.host)) {
    throw new Error(`listening on ${config.host} needs an access token; set X_TASKS_TOKEN_FILE or X_TASKS_TOKEN`)
  }
  return config
}

// ============================================================================
// Lifecycle
// ============================================================================

// Checks the database every second and tells each page when another program has changed it.
function watch_for_outside_changes(): void {
  setInterval(() => {
    if (has_changed_elsewhere()) announce_change()
  }, 1000)
}

function main(): void {
  const config = read_config()
  open_task_database(config.database_path)

  const server = create_web_server({ web_folder: config.web_folder, access_token: config.access_token })
  void restart_mcp_server({ announce_change_to_all: () => announce_change() })
  watch_for_outside_changes()
  schedule_automatic_backups()

  server.listen(config.port, config.host, () => {
    const shown_host = config.host.includes(':') ? `[${config.host}]` : config.host
    console.log(`x-tasks server on http://${shown_host}:${config.port}, using ${config.database_path}`)
  })

  const shut_down = (): void => {
    server.closeAllConnections()
    server.close()
    void stop_mcp_server().then(() => {
      close_task_database()
      process.exit(0)
    })
  }
  process.on('SIGINT', shut_down)
  process.on('SIGTERM', shut_down)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
