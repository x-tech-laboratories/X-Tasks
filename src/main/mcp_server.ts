import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { format_task_date, next_schedule } from '@shared/schedule'
import type { McpStatus, Settings } from '@shared/settings'
import type { Task } from '@shared/tasks'
import {
  add_task, list_tag_groups, list_tags, list_tasks, remove_task, set_task_done, set_task_my_day, set_task_notes, set_task_schedule,
  set_task_title, tag_task, untag_task
} from './task_database'

// ============================================================================
// Task helpers
// ============================================================================

const TASK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

const task_date = z
  .string()
  .regex(TASK_DATE_PATTERN, 'use YYYY-MM-DD or YYYY-MM-DDTHH:MM')
  .nullable()
  .describe('A local date as YYYY-MM-DD, or a local time as YYYY-MM-DDTHH:MM; null clears it')

function find_task(task_id: string): Task {
  const task = list_tasks().find((each) => each.id === task_id)
  if (!task) throw new Error(`no task with id ${task_id}`)
  return task
}

// A plain tag can be given by hand; a rule tag applies itself and cannot.
function check_plain_tag(tag_id: string): void {
  const tag = list_tags().find((each) => each.id === tag_id)
  if (!tag) throw new Error(`no tag with id ${tag_id}`)
  if (tag.rule) throw new Error(`tag ${tag.name} is a rule tag, which applies itself`)
}

// Each task with its tags named, so a client need not look the ids up.
function describe_tasks(tasks: Task[]): object[] {
  const tags = list_tags()
  const groups = list_tag_groups()
  return tasks.map(({ tag_ids, ...task }) => ({
    ...task,
    tags: tag_ids.map((tag_id) => {
      const tag = tags.find((each) => each.id === tag_id)
      return { id: tag_id, name: tag?.name, group: groups.find((group) => group.id === tag?.group_id)?.name }
    })
  }))
}

function subtask_ids_of(task_id: string, tasks: Task[]): Set<string> {
  const ids = new Set([task_id])
  for (const id of ids) for (const each of tasks) if (each.parent_id === id) ids.add(each.id)
  ids.delete(task_id)
  return ids
}

// Completing a task completes its subtasks; a recurring one moves to its next occurrence and resets its subtasks instead.
function complete_task(task: Task): Task {
  const tasks = list_tasks()
  const done_at = new Date().toISOString()
  const next = next_schedule(task)
  const is_done = next === null

  if (next) set_task_schedule(task.id, next)
  set_task_done(task.id, is_done, done_at)
  for (const each of tasks) {
    if (subtask_ids_of(task.id, tasks).has(each.id) && each.is_done !== is_done) set_task_done(each.id, is_done, is_done ? done_at : each.done_at)
  }

  return find_task(task.id)
}

function as_text(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

// ============================================================================
// Tools
// ============================================================================

function create_mcp_server(on_change: () => void): McpServer {
  const server = new McpServer({ name: 'x-tasks', version: '0.1.0' })

  // Wraps a tool that writes, so the open window loads the new data afterwards.
  function changing<Args>(handler: (args: Args) => unknown) {
    return (args: Args) => {
      const result = handler(args)
      on_change()
      return as_text(result)
    }
  }

  server.registerTool(
    'list_tasks',
    {
      description: 'Lists tasks with their notes, dates, recurrence, My Day day, parent and tags.',
      inputSchema: { include_done: z.boolean().default(false).describe('Also list completed tasks') }
    },
    ({ include_done }) => as_text(describe_tasks(list_tasks().filter((task) => include_done || !task.is_done)))
  )

  server.registerTool(
    'list_tags',
    { description: 'Lists the tag groups, such as Area and Priority, each with its tags. Rule tags apply themselves and cannot be given by hand.' },
    () => {
      const tags = list_tags()
      return as_text(
        list_tag_groups().map((group) => ({
          ...group,
          tags: tags.filter((tag) => tag.group_id === group.id).map(({ id, name, parent_id, rule }) => ({ id, name, parent_id, is_rule_tag: rule !== null }))
        }))
      )
    }
  )

  server.registerTool(
    'add_task',
    {
      description: 'Adds a task, or a subtask when parent_id is given.',
      inputSchema: {
        title: z.string().trim().min(1),
        notes: z.string().optional(),
        parent_id: z.string().optional().describe('The task to put this one under'),
        tag_ids: z.array(z.string()).default([]),
        start_at: task_date.optional(),
        due_at: task_date.optional(),
        recurrence: z.string().optional().describe('An RFC 5545 rule without the RRULE: prefix, such as FREQ=WEEKLY;BYDAY=MO'),
        in_my_day: z.boolean().default(false)
      }
    },
    changing(({ title, notes, parent_id, tag_ids, start_at, due_at, recurrence, in_my_day }) => {
      if (parent_id) find_task(parent_id)
      tag_ids.forEach(check_plain_tag)

      const task = add_task(title, parent_id ?? null, tag_ids, in_my_day ? format_task_date(new Date(), false) : null)
      if (notes) set_task_notes(task.id, notes)
      if (start_at || due_at || recurrence) {
        set_task_schedule(task.id, { start_at: start_at ?? null, due_at: due_at ?? null, recurrence: recurrence ?? '' })
      }
      return describe_tasks([find_task(task.id)])[0]
    })
  )

  server.registerTool(
    'update_task',
    {
      description: 'Changes a task. Fields left out stay as they are.',
      inputSchema: {
        task_id: z.string(),
        title: z.string().trim().min(1).optional(),
        notes: z.string().optional(),
        start_at: task_date.optional(),
        due_at: task_date.optional(),
        recurrence: z.string().optional().describe('An RFC 5545 rule without the RRULE: prefix; an empty string stops it repeating'),
        in_my_day: z.boolean().optional()
      }
    },
    changing(({ task_id, title, notes, start_at, due_at, recurrence, in_my_day }) => {
      const task = find_task(task_id)
      if (title !== undefined) set_task_title(task_id, title)
      if (notes !== undefined) set_task_notes(task_id, notes)
      if (start_at !== undefined || due_at !== undefined || recurrence !== undefined) {
        set_task_schedule(task_id, {
          start_at: start_at === undefined ? task.start_at : start_at,
          due_at: due_at === undefined ? task.due_at : due_at,
          recurrence: recurrence ?? task.recurrence
        })
      }
      if (in_my_day !== undefined) set_task_my_day(task_id, in_my_day ? format_task_date(new Date(), false) : null)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'complete_task',
    {
      description: 'Completes a task and its subtasks. A recurring task instead moves to its next occurrence and stays open.',
      inputSchema: { task_id: z.string() }
    },
    changing(({ task_id }) => describe_tasks([complete_task(find_task(task_id))])[0])
  )

  server.registerTool(
    'reopen_task',
    { description: 'Marks a completed task as not done.', inputSchema: { task_id: z.string() } },
    changing(({ task_id }) => {
      find_task(task_id)
      set_task_done(task_id, false, null)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'tag_task',
    {
      description: 'Gives a task a tag. In a one-tag-per-task group the new tag replaces the old one.',
      inputSchema: { task_id: z.string(), tag_id: z.string() }
    },
    changing(({ task_id, tag_id }) => {
      find_task(task_id)
      check_plain_tag(tag_id)
      tag_task(task_id, tag_id)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'untag_task',
    { description: 'Takes a tag off a task.', inputSchema: { task_id: z.string(), tag_id: z.string() } },
    changing(({ task_id, tag_id }) => {
      find_task(task_id)
      untag_task(task_id, tag_id)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'remove_task',
    {
      description: 'Deletes a task and all its subtasks for good.',
      inputSchema: { task_id: z.string() },
      annotations: { destructiveHint: true }
    },
    changing(({ task_id }) => {
      const task = find_task(task_id)
      remove_task(task_id)
      return { removed: task.title }
    })
  )

  return server
}

// ============================================================================
// HTTP endpoint
// ============================================================================

const MCP_PATH = '/mcp'
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']

let http_server: Server | undefined
let status: McpStatus = { state: 'off', url: '', error: '' }
let restarting: Promise<void> = Promise.resolve()

// Only local names are accepted, so a web page cannot reach the endpoint by pointing its own domain at this machine.
function has_local_host(request: IncomingMessage): boolean {
  const hostname = (request.headers.host ?? '').replace(/:\d+$/, '')
  return LOCAL_HOSTNAMES.includes(hostname)
}

// Each request gets its own server and transport, so no session state is kept between calls.
async function handle_request(request: IncomingMessage, response: ServerResponse, on_change: () => void): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== MCP_PATH) {
    response.writeHead(404).end()
    return
  }
  if (!has_local_host(request)) {
    response.writeHead(403).end()
    return
  }

  const server = create_mcp_server(on_change)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  response.on('close', () => {
    void transport.close()
    void server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(request, response)
}

function stop(): Promise<void> {
  const closing = http_server
  http_server = undefined
  status = { state: 'off', url: '', error: '' }
  if (!closing) return Promise.resolve()

  closing.closeAllConnections()
  return new Promise((resolve) => closing.close(() => resolve()))
}

function start(port: number, on_change: () => void): Promise<void> {
  const server = createServer((request, response) => {
    handle_request(request, response, on_change).catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500).end(String(error))
    })
  })

  return new Promise((resolve) => {
    server.once('error', (error) => {
      status = { state: 'failed', url: '', error: error.message }
      resolve()
    })
    server.listen(port, '127.0.0.1', () => {
      http_server = server
      status = { state: 'running', url: `http://127.0.0.1:${port}${MCP_PATH}`, error: '' }
      resolve()
    })
  })
}

// Stops any running endpoint, then starts one on the set port when it is turned on.
export function apply_mcp_settings(settings: Settings, on_change: () => void): Promise<void> {
  restarting = restarting.then(async () => {
    await stop()
    if (settings.mcp_enabled) await start(settings.mcp_port, on_change)
  })
  return restarting
}

// Waits for any restart in progress, so the status reflects the latest settings.
export async function get_mcp_status(): Promise<McpStatus> {
  await restarting
  return status
}

export function stop_mcp_server(): Promise<void> {
  restarting = restarting.then(stop)
  return restarting
}
