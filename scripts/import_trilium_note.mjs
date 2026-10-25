#!/usr/bin/env node
// Copies Trilium task notes into X-Tasks: title, content, attributes, checklist and child notes.
//
//   TRILIUM_ETAPI_TOKEN=... node scripts/import_trilium_note.mjs [--dry-run] [note_id ...]
//
// With no note ids it asks for them one at a time, so ids can be pasted in a row.

import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { next_occurrence } from 'recurrence-input'

// ============================================================================
// Settings
// ============================================================================

const DEFAULT_TRILIUM_URL = 'http://127.0.0.1:37840/mcp'
const DEFAULT_X_TASKS_URL = 'http://127.0.0.1:3917/mcp'

const TYPE_TAGS = {
  routine: 'Routine', routines: 'Routine',
  project: 'Task', projects: 'Task', task: 'Task', tasks: 'Task',
  goal: 'Goal', goals: 'Goal',
  habit: 'Habit', habits: 'Habit',
  future: 'Future'
}

const PRIORITY_TAGS = {
  '4-critical': 'Must have',
  '3-high': 'Should have',
  '2-medium': 'Could have',
  '1-low': "Won't have"
}

// ============================================================================
// MCP clients
// ============================================================================

async function connect(url, headers = {}) {
  const client = new Client({ name: 'import-trilium-note', version: '0.1.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }))
  return client
}

// Calls a tool and parses the JSON it answers with.
async function call_tool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content?.find((each) => each.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(`${name} failed: ${text}`)
  return JSON.parse(text)
}

// ============================================================================
// Reading a Trilium note
// ============================================================================

// Reads a note, its content and its template's attribute ids, and then its child notes the same way.
async function read_note(trilium, note_id, template_cache = new Map()) {
  const note = await call_tool(trilium, 'get_note', { noteId: note_id })
  const { content } = await call_tool(trilium, 'get_note_content', { noteId: note_id })
  const attributes = note.attributes?.results ?? []

  const template_ids = new Set()
  for (const attribute of attributes) {
    if (attribute.type !== 'relation' || attribute.name !== 'template') continue
    if (!template_cache.has(attribute.value)) {
      const template = await call_tool(trilium, 'get_note', { noteId: attribute.value })
      template_cache.set(attribute.value, (template.attributes?.results ?? []).map((each) => each.attributeId))
    }
    for (const id of template_cache.get(attribute.value)) template_ids.add(id)
  }

  const children = []
  for (const child of note.childNotes?.results ?? []) children.push(await read_note(trilium, child.noteId, template_cache))

  return { id: note.noteId, title: note.title, content: content ?? '', attributes, template_ids, children }
}

function label_of(note, name) {
  return note.attributes.find((each) => each.type === 'label' && each.name === name)?.value ?? null
}

function labels_of(note, name) {
  return note.attributes.filter((each) => each.type === 'label' && each.name === name).map((each) => each.value)
}

// ============================================================================
// Content
// ============================================================================

const CHECKLIST_LINE = /^(\s*)[-*] \[([ xX])\]\s?(.*)$/
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g
const HEADING_LINE = /^#{1,6}\s/

// Splits an item's text into a title without bare links and the links it held.
function split_links(text) {
  const urls = []
  const title = text.replace(MARKDOWN_LINK, (_, link_text, url) => {
    urls.push(url)
    return link_text === url ? '' : link_text
  })
  const cleaned = title.replace(/\s+/g, ' ').replace(/[\s:-]+$/, '').trim()
  return { title: cleaned, urls }
}

// Turns markdown links into plain text that keeps the address.
function plain_links(text) {
  return text.replace(MARKDOWN_LINK, (_, link_text, url) => (link_text === url || !link_text ? url : `${link_text} (${url})`))
}

// Builds the nested checklist, keeping each item's depth by its indent.
function parse_checklist(lines) {
  const root = { children: [] }
  const stack = [{ indent: -1, item: root }]
  for (const line of lines) {
    const match = CHECKLIST_LINE.exec(line)
    if (!match) continue
    const indent = match[1].replace(/\t/g, '    ').length
    const { title, urls } = split_links(match[3])
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    if (!title) continue
    const item = { title, urls, is_done: match[2] !== ' ', children: [] }
    stack[stack.length - 1].item.children.push(item)
    stack.push({ indent, item })
  }
  return root.children
}

// The content outside the checklist, without headings that have nothing under them.
function parse_body(lines) {
  const kept = lines.filter((line) => !CHECKLIST_LINE.test(line)).map((line) => plain_links(line).trimEnd())
  const has_text_under = (index) => {
    for (const line of kept.slice(index + 1)) {
      if (HEADING_LINE.test(line)) return false
      if (line.trim()) return true
    }
    return false
  }
  return kept
    .filter((line, index) => !HEADING_LINE.test(line) || has_text_under(index))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ============================================================================
// Notes text
// ============================================================================

function describe_attribute(attribute) {
  const value = attribute.value === '' ? '(empty)' : attribute.value
  const line = attribute.type === 'relation' ? `${attribute.name} -> ${value}` : `${attribute.name} = ${value}`
  return attribute.isInheritable ? `${line} (inheritable)` : line
}

function attribute_section(heading, attributes) {
  return attributes.length === 0 ? [] : ['', `${heading}:`, ...attributes.map(describe_attribute)]
}

// The note's own text, then where it came from and every attribute it had.
function task_notes(note, body) {
  const own = note.attributes.filter((each) => !note.template_ids.has(each.attributeId))
  const inherited = note.attributes.filter((each) => note.template_ids.has(each.attributeId))
  const lines = [
    `Migrated from Trilium note ${note.id}, "${note.title}".`,
    ...attribute_section('Labels', own.filter((each) => each.type === 'label')),
    ...attribute_section('Relations', own.filter((each) => each.type === 'relation')),
    ...attribute_section('Labels from the template', inherited.filter((each) => each.type === 'label')),
    ...attribute_section('Relations from the template', inherited.filter((each) => each.type === 'relation'))
  ]
  return [body, lines.join('\n')].filter(Boolean).join('\n\n')
}

// ============================================================================
// Schedule
// ============================================================================

const TIME_OF_DAY_PARTS = new Set(['BYHOUR', 'BYMINUTE', 'BYSECOND'])

// The rule without its clock time, which the start and due dates already carry.
function rule_without_time(rule) {
  return rule
    .replace(/^RRULE:/, '')
    .split(';')
    .filter((part) => part && !TIME_OF_DAY_PARTS.has(part.split('=')[0].toUpperCase()))
    .join(';')
}

function parse_date(text) {
  const [day, time = '00:00'] = text.split('T')
  const [year, month, day_of_month] = day.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day_of_month, hours, minutes)
}

function format_date(date, with_time) {
  const pad = (number) => String(number).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return with_time ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

// Moves a date by whole milliseconds, keeping whether it has a time.
function shifted(text, milliseconds) {
  return text === null ? null : format_date(new Date(parse_date(text).getTime() + milliseconds), text.includes('T'))
}

// A repeating task whose dates have passed moves on to its first occurrence that has not.
function roll_forward(schedule, now = new Date()) {
  let { start_at, due_at, recurrence } = schedule
  const anchor_of = () => due_at ?? start_at
  for (let step = 0; recurrence && anchor_of() && parse_date(anchor_of()) < now && step < 10000; step++) {
    const anchor = anchor_of()
    const next = next_occurrence(recurrence, parse_date(anchor), { time_mode: 'floating', all_day: !anchor.includes('T') })
    if (!next) break
    const gap = next.next_date.getTime() - parse_date(anchor).getTime()
    start_at = shifted(start_at, gap)
    due_at = shifted(due_at, gap)
    recurrence = next.rule
  }
  return { start_at, due_at, recurrence }
}

function schedule_of(note) {
  const start_at = label_of(note, 'startDateTime') ?? label_of(note, 'startDate')
  const due_at = label_of(note, 'dueDateTime')
  const recurrence = rule_without_time(label_of(note, 'recurrence') ?? '')
  return roll_forward({ start_at, due_at, recurrence })
}

// ============================================================================
// Tags
// ============================================================================

function find_tag(groups, group_name, tag_name) {
  const group = groups.find((each) => each.name.toLowerCase() === group_name.toLowerCase())
  return group?.tags.find((each) => !each.is_rule_tag && each.name.toLowerCase() === tag_name.toLowerCase()) ?? null
}

// The X-Tasks tags matching the note's type, priority and area labels, with a warning for each that has none.
function tags_of(note, groups, warnings) {
  const tags = []
  const wanted = [
    ['Type', labels_of(note, 'type').map((value) => TYPE_TAGS[value.toLowerCase()]).find(Boolean)],
    ['Priority (MoSCoW)', PRIORITY_TAGS[label_of(note, 'priority') ?? '']],
    ['Area', label_of(note, 'area')?.replace(/^\d+-/, '')]
  ]
  for (const [group_name, tag_name] of wanted) {
    if (!tag_name) continue
    const tag = find_tag(groups, group_name, tag_name)
    if (tag) tags.push(tag)
    else warnings.push(`"${note.title}": no ${group_name} tag named ${tag_name}`)
  }
  return tags
}

// ============================================================================
// Planning tasks
// ============================================================================

const DURATION_SUFFIX = /\s*\(\s*\d+\s*[mhd](\s*\d+\s*m)?\s*\)\s*$/i

// The task a note becomes, with its checklist and child notes as subtasks.
function plan_note(note, groups, warnings) {
  const lines = note.content.split('\n')
  const { start_at, due_at, recurrence } = schedule_of(note)
  return {
    title: note.title.replace(DURATION_SUFFIX, '').trim() || note.title,
    notes: task_notes(note, parse_body(lines)),
    tags: tags_of(note, groups, warnings),
    start_at,
    due_at,
    recurrence,
    is_done: false,
    children: [
      ...parse_checklist(lines).map(plan_item),
      ...note.children.map((child) => plan_note(child, groups, warnings))
    ]
  }
}

function plan_item(item) {
  return {
    title: item.title,
    notes: item.urls.join('\n'),
    tags: [],
    start_at: null,
    due_at: null,
    recurrence: '',
    is_done: item.is_done,
    from_checklist: true,
    children: item.children.map(plan_item)
  }
}

function count_tasks(plan) {
  return 1 + plan.children.reduce((sum, child) => sum + count_tasks(child), 0)
}

function print_plan(plan, depth = 0) {
  const indent = '  '.repeat(depth)
  const dates = [plan.start_at && `start ${plan.start_at}`, plan.due_at && `due ${plan.due_at}`, plan.recurrence && `repeats ${plan.recurrence}`]
  const links = plan.from_checklist && plan.notes.split('\n')
  const details = [...dates, ...plan.tags.map((tag) => `#${tag.name}`), plan.is_done && 'done', ...(links || [])]
  console.log(`${indent}- ${plan.title}${details.some(Boolean) ? `  [${details.filter(Boolean).join(', ')}]` : ''}`)
  for (const child of plan.children) print_plan(child, depth + 1)
}

// ============================================================================
// Writing to X-Tasks
// ============================================================================

async function write_plan(x_tasks, plan, parent_id) {
  const task = await call_tool(x_tasks, 'add_task', {
    title: plan.title,
    ...(plan.notes && { notes: plan.notes }),
    ...(parent_id && { parent_id }),
    tag_ids: plan.tags.map((tag) => tag.id),
    ...(plan.start_at && { start_at: plan.start_at }),
    ...(plan.due_at && { due_at: plan.due_at }),
    ...(plan.recurrence && { recurrence: plan.recurrence })
  })
  for (const child of plan.children) await write_plan(x_tasks, child, task.id)
  if (plan.is_done) await call_tool(x_tasks, 'complete_task', { task_id: task.id })
  return task
}

// An open top-level task of the same title: an empty one is filled in, any other stops the import.
async function find_existing(x_tasks, title) {
  const tasks = await call_tool(x_tasks, 'list_tasks')
  const same = tasks.filter((each) => each.parent_id === null && each.title.toLowerCase() === title.toLowerCase())
  const empty = same.find((each) => !each.notes && !tasks.some((other) => other.parent_id === each.id))
  return { empty, other: same.find((each) => each !== empty) }
}

// Fills in an empty task already on the list, so the import adds no duplicate.
async function fill_existing(x_tasks, task, plan) {
  await call_tool(x_tasks, 'update_task', {
    task_id: task.id,
    notes: plan.notes,
    start_at: plan.start_at,
    due_at: plan.due_at,
    recurrence: plan.recurrence
  })
  for (const tag of plan.tags) await call_tool(x_tasks, 'tag_task', { task_id: task.id, tag_id: tag.id })
  for (const child of plan.children) await write_plan(x_tasks, child, task.id)
}

// ============================================================================
// Importing
// ============================================================================

async function import_note(note_id, { trilium, x_tasks, dry_run, allow_duplicate }) {
  const note = await read_note(trilium, note_id)
  const groups = await call_tool(x_tasks, 'list_tags')
  const warnings = []
  const plan = plan_note(note, groups, warnings)

  print_plan(plan)
  for (const warning of warnings) console.log(`  warning: ${warning}`)

  const { empty, other } = await find_existing(x_tasks, plan.title)
  if (other && !allow_duplicate) {
    console.log(`  skipped: "${plan.title}" is already on the list; rerun with --allow-duplicate to add it anyway`)
    return
  }
  if (dry_run) {
    console.log(`  dry run: would ${empty ? 'fill in the empty task' : 'add'} "${plan.title}" with ${count_tasks(plan) - 1} subtasks`)
    return
  }

  if (empty && !allow_duplicate) await fill_existing(x_tasks, empty, plan)
  else await write_plan(x_tasks, plan, null)
  console.log(`  ${empty ? 'filled in' : 'added'} "${plan.title}" with ${count_tasks(plan) - 1} subtasks`)
}

// Note ids from the command line, or else one at a time from the terminal until a blank line.
async function* note_ids(positionals) {
  if (positionals.length > 0) {
    yield* positionals
    return
  }
  // Reading lines as they arrive keeps ids pasted several at once.
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  let is_closed = false
  terminal.on('close', () => (is_closed = true))
  terminal.setPrompt('Trilium note id (blank to quit): ')
  terminal.prompt()
  try {
    for await (const line of terminal) {
      const answer = line.trim()
      if (!answer) return
      yield answer
      if (!is_closed) terminal.prompt()
    }
  } finally {
    terminal.close()
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'allow-duplicate': { type: 'boolean', default: false },
      'trilium-url': { type: 'string', default: process.env.TRILIUM_MCP_URL ?? DEFAULT_TRILIUM_URL },
      'x-tasks-url': { type: 'string', default: process.env.X_TASKS_MCP_URL ?? DEFAULT_X_TASKS_URL }
    }
  })

  const token = process.env.TRILIUM_ETAPI_TOKEN
  if (!token) {
    console.error('Set TRILIUM_ETAPI_TOKEN to an ETAPI token from Trilium (Options > ETAPI).')
    process.exit(1)
  }

  const trilium = await connect(values['trilium-url'], { Authorization: `Bearer ${token}` })
  const x_tasks = await connect(values['x-tasks-url'])
  const options = { trilium, x_tasks, dry_run: values['dry-run'], allow_duplicate: values['allow-duplicate'] }

  let failed = false
  try {
    for await (const note_id of note_ids(positionals)) {
      try {
        await import_note(note_id, options)
      } catch (error) {
        failed = true
        console.error(`  ${note_id}: ${error.message}`)
      }
    }
  } finally {
    await trilium.close()
    await x_tasks.close()
  }
  process.exit(failed ? 1 : 0)
}

await main()
