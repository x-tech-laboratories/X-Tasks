import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { format_local } from '@x-tech-laboratories/x-libs/dates'
import { can_drop, children_of, move_for_drop } from '@x-tech-laboratories/x-libs/web/tree'
import { next_schedule, recurrence_anchor } from '@shared/schedule'
import type { McpStatus, Settings } from '@shared/settings'
import { can_link, links_of, type Task } from '@shared/tasks'
import { entry_seconds, running_entries, task_entries, total_seconds } from '@shared/time_tracking'
import {
  add_tag, add_tag_group, add_task, get_settings, link_tasks, list_tag_groups, list_tags, list_tasks, move_task, remove_tag, remove_tag_group, remove_task, set_task_done, set_task_my_day,
  set_task_estimate, set_task_reminders, set_task_notes, set_task_schedule, set_task_title, start_timer, stop_timer, tag_task, unlink_tasks, untag_task, update_tag, update_tag_group,
  list_time_entries
} from '@shared/task_database'
import type { Tag, TagGroup } from '@shared/tasks'

// ============================================================================
// Task helpers
// ============================================================================

const estimate_minutes = z.number().int().positive().nullable().describe('How long the task should take, in minutes; null clears it')

const reminders = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'use YYYY-MM-DDTHH:MM'))
  .describe("Local times as YYYY-MM-DDTHH:MM to be reminded of the task at, apart from its dates; they move with a repeat, and an empty list clears them")

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

function find_tag_group(group_id: string): TagGroup {
  const group = list_tag_groups().find((each) => each.id === group_id)
  if (!group) throw new Error(`no tag group with id ${group_id}`)
  return group
}

function find_tag(tag_id: string): Tag {
  const tag = list_tags().find((each) => each.id === tag_id)
  if (!tag) throw new Error(`no tag with id ${tag_id}`)
  return tag
}

function describe_tag(tag: Tag): object {
  const { id, name, group_id, parent_id, rule, color, icon } = tag
  return { id, name, group_id, parent_id, is_rule_tag: rule !== null, color, icon }
}

const tag_color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'use #rrggbb')
  .nullable()
  .describe('A colour as #rrggbb; null clears it')

const tag_icon = z.string().nullable().describe('An icon name; null clears it')

// Each task with its tags and links named, so a client need not look the ids up.
function describe_tasks(tasks: Task[]): object[] {
  const tags = list_tags()
  const groups = list_tag_groups()
  const all_tasks = list_tasks()
  const relationships = get_settings().task_relationships
  const entries = list_time_entries()
  const now = new Date()
  return tasks.map((task) => ({
    ...task,
    tag_ids: undefined,
    tags: task.tag_ids.map((tag_id) => {
      const tag = tags.find((each) => each.id === tag_id)
      return { id: tag_id, name: tag?.name, group: groups.find((group) => group.id === tag?.group_id)?.name }
    }),
    links: links_of(task, all_tasks).map((link) => {
      const relationship = relationships.find((each) => each.id === link.relationship_id)
      return { relationship: link.is_inverse ? relationship?.inverse_name : relationship?.name, task_id: link.other.id, title: link.other.title }
    }),
    time_spent_seconds: Math.round(total_seconds(task_entries(entries, task.id), now))
  }))
}

// The running timers, oldest first, each with its task's title.
function describe_timers(): object[] {
  const now = new Date()
  return running_entries(list_time_entries(), get_settings().allow_several_timers).map((entry) => ({
    task_id: entry.task_id,
    title: find_task(entry.task_id).title,
    started_at: entry.started_at,
    elapsed_seconds: Math.round(entry_seconds(entry, now))
  }))
}

// The relationship and the way it reads for a name such as "Waits on" or its inverse "Blocks".
function find_relationship(name: string) {
  const relationships = get_settings().task_relationships
  const wanted = name.trim().toLowerCase()
  const forward = relationships.find((each) => each.name.toLowerCase() === wanted)
  if (forward) return { relationship: forward, is_inverse: false }
  const inverse = relationships.find((each) => each.inverse_name.toLowerCase() === wanted)
  if (inverse) return { relationship: inverse, is_inverse: true }
  const names = relationships.flatMap((each) => (each.name === each.inverse_name ? [each.name] : [each.name, each.inverse_name]))
  throw new Error(`no relationship named ${name}; the relationships are ${names.join(', ')}`)
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
  set_task_done(task.id, is_done, done_at, { kind: 'add', occurrence_on: recurrence_anchor(task) })
  for (const each of tasks) {
    if (!subtask_ids_of(task.id, tasks).has(each.id) || each.is_done === is_done) continue
    if (is_done) set_task_done(each.id, true, done_at, { kind: 'add', occurrence_on: recurrence_anchor(each) })
    else set_task_done(each.id, false, each.done_at, { kind: 'none' })
  }

  return find_task(task.id)
}

function as_text(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

// ============================================================================
// Tools
// ============================================================================

export function create_mcp_server(on_change: () => void): McpServer {
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
      description: 'Lists tasks with their notes (Markdown), dates, recurrence, My Day day, estimate and time spent, reminders, parent and tags.',
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
          tags: tags.filter((tag) => tag.group_id === group.id).map(({ id, name, parent_id, rule, color, icon }) => ({ id, name, parent_id, is_rule_tag: rule !== null, color, icon }))
        }))
      )
    }
  )

  server.registerTool(
    'add_tag_group',
    {
      description: 'Adds a group of tags, such as Area. A one-tag-per-task group lets a task hold only one of its tags. Rule groups are set up in the app.',
      inputSchema: {
        name: z.string().trim().min(1),
        is_single_choice: z.boolean().default(false).describe('Let a task hold only one tag from this group')
      }
    },
    changing(({ name, is_single_choice }) => {
      const group = add_tag_group(name, false)
      if (is_single_choice) update_tag_group(group.id, name, false, true)
      return find_tag_group(group.id)
    })
  )

  server.registerTool(
    'update_tag_group',
    {
      description: 'Renames a tag group or changes whether a task may hold only one of its tags. Fields left out stay as they are.',
      inputSchema: {
        group_id: z.string(),
        name: z.string().trim().min(1).optional(),
        is_single_choice: z.boolean().optional().describe('Let a task hold only one tag from this group; a rule group cannot')
      }
    },
    changing(({ group_id, name, is_single_choice }) => {
      const group = find_tag_group(group_id)
      if (group.is_rule && is_single_choice) throw new Error(`${group.name} is a rule group, which cannot limit a task to one tag`)
      update_tag_group(group_id, name ?? group.name, group.is_rule, is_single_choice ?? group.is_single_choice)
      return find_tag_group(group_id)
    })
  )

  server.registerTool(
    'remove_tag_group',
    {
      description: 'Deletes a tag group and all its tags for good. Tasks stay and only lose those tags.',
      inputSchema: { group_id: z.string() },
      annotations: { destructiveHint: true }
    },
    changing(({ group_id }) => {
      const group = find_tag_group(group_id)
      remove_tag_group(group_id)
      return { removed: group.name }
    })
  )

  server.registerTool(
    'add_tag',
    {
      description: 'Adds a tag to a tag group, or a sub-tag when parent_id is given. Rule tags are set up in the app.',
      inputSchema: {
        group_id: z.string(),
        name: z.string().trim().min(1),
        parent_id: z.string().optional().describe('The tag to put this one under, in the same group'),
        color: tag_color.optional(),
        icon: tag_icon.optional()
      }
    },
    changing(({ group_id, name, parent_id, color, icon }) => {
      const group = find_tag_group(group_id)
      if (group.is_rule) throw new Error(`${group.name} is a rule group, whose tags are set up in the app`)
      if (parent_id && find_tag(parent_id).group_id !== group_id) throw new Error(`tag ${parent_id} is in another group`)
      return describe_tag(add_tag(name, group_id, parent_id ?? null, null, color ?? null, icon ?? null, true))
    })
  )

  server.registerTool(
    'update_tag',
    {
      description: "Renames a tag or changes its colour or icon. Fields left out stay as they are; a rule tag's rule is kept.",
      inputSchema: { tag_id: z.string(), name: z.string().trim().min(1).optional(), color: tag_color.optional(), icon: tag_icon.optional() }
    },
    changing(({ tag_id, name, color, icon }) => {
      const tag = find_tag(tag_id)
      update_tag(tag_id, name ?? tag.name, tag.rule, color === undefined ? tag.color : color, icon === undefined ? tag.icon : icon, tag.shows_on_rows)
      return describe_tag(find_tag(tag_id))
    })
  )

  server.registerTool(
    'remove_tag',
    {
      description: 'Deletes a tag and its sub-tags for good. Tasks stay and only lose those tags.',
      inputSchema: { tag_id: z.string() },
      annotations: { destructiveHint: true }
    },
    changing(({ tag_id }) => {
      const tag = find_tag(tag_id)
      remove_tag(tag_id)
      return { removed: tag.name }
    })
  )

  server.registerTool(
    'add_task',
    {
      description: 'Adds a task, or a subtask when parent_id is given.',
      inputSchema: {
        title: z.string().trim().min(1),
        notes: z.string().optional().describe('Markdown, shown formatted'),
        parent_id: z.string().optional().describe('The task to put this one under'),
        tag_ids: z.array(z.string()).default([]),
        start_at: task_date.optional(),
        due_at: task_date.optional(),
        recurrence: z.string().optional().describe('An RFC 5545 rule without the RRULE: prefix, such as FREQ=WEEKLY;BYDAY=MO'),
        in_my_day: z.boolean().default(false),
        estimate_minutes: estimate_minutes.optional(),
        reminders: reminders.optional()
      }
    },
    changing(({ title, notes, parent_id, tag_ids, start_at, due_at, recurrence, in_my_day, estimate_minutes, reminders }) => {
      if (parent_id) find_task(parent_id)
      tag_ids.forEach(check_plain_tag)

      const task = add_task(title, parent_id ?? null, tag_ids, in_my_day ? format_local(new Date(), false) : null)
      if (notes) set_task_notes(task.id, notes)
      if (estimate_minutes) set_task_estimate(task.id, estimate_minutes)
      if (reminders?.length) set_task_reminders(task.id, reminders)
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
        notes: z.string().optional().describe('Markdown, shown formatted'),
        start_at: task_date.optional(),
        due_at: task_date.optional(),
        recurrence: z.string().optional().describe('An RFC 5545 rule without the RRULE: prefix; an empty string stops it repeating'),
        in_my_day: z.boolean().optional(),
        estimate_minutes: estimate_minutes.optional(),
        reminders: reminders.optional()
      }
    },
    changing(({ task_id, title, notes, start_at, due_at, recurrence, in_my_day, estimate_minutes, reminders }) => {
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
      if (in_my_day !== undefined) set_task_my_day(task_id, in_my_day ? format_local(new Date(), false) : null)
      if (estimate_minutes !== undefined) set_task_estimate(task_id, estimate_minutes)
      if (reminders !== undefined) set_task_reminders(task_id, reminders)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'move_task',
    {
      description:
        'Moves a task, with its subtasks, before or after another task, or inside it as its last subtask. ' +
        'Without target_id the task goes to the end of the top level. Refused when the target is the task itself or one of its subtasks.',
      inputSchema: {
        task_id: z.string(),
        target_id: z.string().optional().describe('The task to move next to or into; left out, the task goes to the top level'),
        placement: z.enum(['before', 'after', 'inside']).default('inside').describe('Where the task goes relative to the target')
      }
    },
    changing(({ task_id, target_id, placement }) => {
      const task = find_task(task_id)
      const tasks = list_tasks()
      if (target_id === undefined) {
        const top_level = children_of(null, tasks).filter((each) => each.id !== task_id)
        move_task(task_id, null, Math.max(0, ...top_level.map((each) => each.position)) + 1)
      } else {
        const target = find_task(target_id)
        if (!can_drop(task_id, target_id, tasks)) throw new Error('a task cannot move next to or into itself or its own subtasks')
        const move = move_for_drop(task, target, placement, tasks)
        move_task(task_id, move.parent_id, move.position)
      }
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
      set_task_done(task_id, false, null, find_task(task_id).is_done ? { kind: 'remove' } : { kind: 'none' })
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
    'link_tasks',
    {
      description:
        'Links a task to another by a relationship from the Relationships setting, by its name or inverse name, as in "Waits on" or "Blocks". ' +
        'The other task gets the inverse; any link the two already had is replaced. Refused when it would make a task wait on itself through others.',
      inputSchema: { task_id: z.string(), relationship: z.string(), other_id: z.string() }
    },
    changing(({ task_id, relationship: name, other_id }) => {
      find_task(task_id)
      find_task(other_id)
      const { relationship, is_inverse } = find_relationship(name)
      if (!can_link(task_id, other_id, relationship, is_inverse, list_tasks(), get_settings().task_relationships)) throw new Error('that link would make a loop')
      if (is_inverse) link_tasks(other_id, task_id, relationship.id)
      else link_tasks(task_id, other_id, relationship.id)
      return describe_tasks([find_task(task_id)])[0]
    })
  )

  server.registerTool(
    'unlink_tasks',
    { description: 'Removes the link between two tasks, whichever way it was made.', inputSchema: { task_id: z.string(), other_id: z.string() } },
    changing(({ task_id, other_id }) => {
      find_task(task_id)
      unlink_tasks(task_id, other_id)
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

  server.registerTool(
    'list_timers',
    {
      description: 'Lists the running timers: each task timed, since when, and for how many seconds. Only one runs unless the settings allow several.',
      annotations: { readOnlyHint: true }
    },
    () => as_text(describe_timers())
  )

  server.registerTool(
    'start_timer',
    {
      description: 'Starts a timer on a task, counting time spent on it. It stops the other running timers unless the settings allow several.',
      inputSchema: { task_id: z.string() }
    },
    changing(({ task_id }) => {
      find_task(task_id)
      start_timer(task_id, new Date().toISOString())
      return describe_timers()
    })
  )

  server.registerTool(
    'stop_timer',
    {
      description: "Stops one task's timer, or every running timer when no task is given, keeping the time counted.",
      inputSchema: { task_id: z.string().optional().describe('The task whose timer to stop; left out, every timer stops') }
    },
    changing(({ task_id }) => {
      if (task_id) find_task(task_id)
      stop_timer(new Date().toISOString(), task_id ?? null)
      return { running: describe_timers() }
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
