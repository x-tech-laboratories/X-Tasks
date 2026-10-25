import { existsSync, realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { format_task_date } from '@shared/schedule'
import type { RuleCondition, TagRule } from '@shared/tasks'
import { open_task_database } from '../main/node_task_database'
import {
  add_tag, add_tag_group, add_task, close_task_database, list_tags, set_setting, set_task_done, set_task_notes, set_task_schedule
} from '../main/task_database'

// ============================================================================
// Configuration
// ============================================================================

const USAGE = `Usage: seed-database <file> [--reset]

Makes a development database filled with example tasks, tags and filters, dated around today.
  --reset   replace the file if it already exists`

// The desktop app's real database, which this script refuses to touch.
const REAL_DATABASE_PATH = join(homedir(), '.config', 'x-tasks', 'tasks.db')

function same_file(first: string, second: string): boolean {
  const real_path = (path: string) => (existsSync(path) ? realpathSync(path) : resolve(path))
  return real_path(first) === real_path(second)
}

function read_target(): { path: string; should_reset: boolean } {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { reset: { type: 'boolean' }, help: { type: 'boolean' } } })
  if (values.help || positionals.length !== 1) {
    console.log(USAGE)
    process.exit(values.help ? 0 : 1)
  }

  const path = resolve(positionals[0]!)
  if (same_file(path, REAL_DATABASE_PATH)) throw new Error(`refusing to seed the real database at ${path}`)
  return { path, should_reset: values.reset === true }
}

// The database goes together with its write-ahead log and shared memory.
function remove_database(path: string): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true })
}

// ============================================================================
// Dates
// ============================================================================

const now = new Date()

// A local day this many days from today, as the app stores it.
function day(offset: number): string {
  return format_task_date(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset), false)
}

// A local time on a day this many days from today.
function time(offset: number, hours: number, minutes = 0): string {
  return format_task_date(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes), true)
}

// The moment a task was ticked, this many days ago at the given hour.
function done_moment(days_ago: number, hours = 18): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days_ago, hours).toISOString()
}

// ============================================================================
// Example data
// ============================================================================

interface ExampleTask {
  title: string
  notes?: string
  // Tag names, each looked up across every plain tag.
  tags?: string[]
  start_at?: string
  due_at?: string
  recurrence?: string
  in_my_day?: boolean
  // Days ago the task was finished; a recurring task stays open and only logs these.
  done_days_ago?: number[]
  subtasks?: ExampleTask[]
}

const PROJECT_TAGS: { name: string; color: string; children?: string[] }[] = [
  { name: 'Kitchen renovation', color: '#e8a33d', children: ['Plumbing', 'Cabinets'] },
  { name: 'Side project', color: '#4f8fe6', children: ['Website', 'Launch'] },
  { name: 'Trip to the coast', color: '#3fb27f' }
]

const EXAMPLE_TASKS: ExampleTask[] = [
  {
    title: 'Renovate the kitchen',
    tags: ['Home', 'Goal', 'Kitchen renovation'],
    due_at: day(45),
    notes: 'Budget is set aside in the savings account.\nAim to finish before the holidays.',
    subtasks: [
      { title: 'Get three quotes from contractors', tags: ['Plumbing'], due_at: day(-2) },
      { title: 'Pick a sink and tap', tags: ['Plumbing'], due_at: day(3) },
      { title: 'Measure the cabinet wall', tags: ['Cabinets'], done_days_ago: [5] },
      { title: 'Order cabinet doors', tags: ['Cabinets', 'High'], start_at: day(7), due_at: day(14) }
    ]
  },
  {
    title: 'Launch the side project website',
    tags: ['Tech', 'Goal', 'Side project'],
    due_at: day(30),
    subtasks: [
      { title: 'Write the landing page copy', tags: ['Website'], due_at: day(1), in_my_day: true },
      { title: 'Set up the domain and TLS', tags: ['Website', 'High'], done_days_ago: [9] },
      { title: 'Draft the launch post', tags: ['Launch'], start_at: day(10), due_at: day(20) },
      {
        title: 'Collect feedback from beta testers',
        tags: ['Launch'],
        subtasks: [
          { title: 'Send the survey', done_days_ago: [2] },
          { title: 'Summarise the answers', due_at: day(4) }
        ]
      }
    ]
  },
  {
    title: 'Plan the trip to the coast',
    tags: ['Fun', 'Task', 'Trip to the coast'],
    start_at: day(-3),
    due_at: day(21),
    subtasks: [
      { title: 'Book the cabin', tags: ['High'], due_at: day(2) },
      { title: 'Ask a neighbour to water the plants', due_at: day(19) },
      { title: 'Pack the snorkel gear', due_at: day(20) }
    ]
  },
  { title: 'File the quarterly tax return', tags: ['Finances', 'Task', 'High'], due_at: day(-1), notes: 'Receipts are in the shoebox on the shelf.' },
  { title: 'Renew the car insurance', tags: ['Car', 'Task', 'Medium'], due_at: day(6) },
  { title: 'Book the car service', tags: ['Car', 'Task', 'Low'], due_at: day(12) },
  { title: 'Update the CV with the last project', tags: ['Career', 'Task', 'Medium'], in_my_day: true },
  { title: 'Prepare for the team review', tags: ['Career', 'Task', 'High'], due_at: time(0, 15, 30), in_my_day: true },
  { title: 'Read "The Pragmatic Programmer"', tags: ['Productivity', 'Task', 'Low'] },
  { title: 'Call the dentist to move the appointment', tags: ['Health', 'Task'], due_at: day(0), in_my_day: true },
  { title: 'Buy a birthday present for Sam', tags: ['Social', 'Task', 'Medium'], due_at: day(5) },
  { title: 'Back up the laptop', tags: ['Tech', 'Routine'], due_at: day(-3), recurrence: 'FREQ=WEEKLY;BYDAY=SU', done_days_ago: [10, 17, 24] },
  { title: 'Pay the rent', tags: ['Finances', 'Routine', 'High'], due_at: day(8), recurrence: 'FREQ=MONTHLY;BYMONTHDAY=1', done_days_ago: [23, 53] },
  { title: 'Water the plants', tags: ['Home', 'Routine'], due_at: day(0), recurrence: 'FREQ=WEEKLY;INTERVAL=1', done_days_ago: [7, 14, 21, 28] },
  { title: 'Morning run', tags: ['Fitness', 'Habit'], due_at: time(0, 7), recurrence: 'FREQ=DAILY', in_my_day: true, done_days_ago: [1, 2, 3, 5, 6, 7, 8, 10, 11, 13, 14, 15] },
  { title: 'Meditate for ten minutes', tags: ['Mental', 'Habit'], due_at: day(0), recurrence: 'FREQ=DAILY', done_days_ago: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { title: 'Floss', tags: ['Grooming', 'Habit'], due_at: day(0), recurrence: 'FREQ=DAILY', done_days_ago: [1, 4, 5, 9, 12] },
  { title: 'Clean out the garage', tags: ['Home', 'Task', 'Low'], done_days_ago: [3] },
  { title: 'Cancel the unused streaming subscription', tags: ['Finances', 'Task'], done_days_ago: [1] },
  { title: 'Fix the squeaky bedroom door', tags: ['Home', 'Task'], done_days_ago: [40] },
  { title: 'Look into a standing desk', tags: ['Productivity'] },
  { title: 'Idea: a board game night once a month' }
]

const PROJECTS_GROUP = 'Projects'

// Filters are rule tags: each finds the tasks its conditions match, written with tag and group names that are looked up below.
type ExampleCondition = RuleCondition | { kind: 'tag_named'; name: string; has_tag: boolean } | { kind: 'group_named'; name: string; has_tag: boolean }

const EXAMPLE_FILTERS: { name: string; color: string | null; match: TagRule['match']; conditions: ExampleCondition[] }[] = [
  { name: 'Overdue', color: '#e5484d', match: 'all', conditions: [{ kind: 'status', is_done: false }, { kind: 'due', when: 'overdue', days: 7 }] },
  { name: 'Due this week', color: '#e8a33d', match: 'all', conditions: [{ kind: 'status', is_done: false }, { kind: 'due', when: 'within_days', days: 7 }] },
  { name: 'Urgent', color: '#e5484d', match: 'any', conditions: [{ kind: 'tag_named', name: 'High', has_tag: true }, { kind: 'due', when: 'today', days: 7 }] },
  { name: 'Habits and routines', color: '#3fb27f', match: 'all', conditions: [{ kind: 'recurring', is_recurring: true }] },
  { name: 'Unscheduled', color: null, match: 'all', conditions: [{ kind: 'status', is_done: false }, { kind: 'due', when: 'none', days: 7 }, { kind: 'start', when: 'none' }] },
  { name: 'No project', color: null, match: 'all', conditions: [{ kind: 'status', is_done: false }, { kind: 'group_named', name: PROJECTS_GROUP, has_tag: false }, { kind: 'subtask', is_subtask: false }] },
  { name: 'Done this week', color: '#4f8fe6', match: 'all', conditions: [{ kind: 'completed_within', days: 7 }] }
]

// ============================================================================
// Seeding
// ============================================================================

function tag_id_named(name: string): string {
  const tag = list_tags().find((tag) => tag.name === name && tag.rule === null)
  if (!tag) throw new Error(`no example tag named ${name}`)
  return tag.id
}

function add_projects(): string {
  const group = add_tag_group(PROJECTS_GROUP, false)
  for (const project of PROJECT_TAGS) {
    const parent = add_tag(project.name, group.id, null, null, project.color)
    for (const child of project.children ?? []) add_tag(child, group.id, parent.id, null, null)
  }
  return group.id
}

// The day a one-off task was meant for: its due date, or its start date without one.
function occurrence_day(example: ExampleTask): string | null {
  return (example.due_at ?? example.start_at)?.slice(0, 10) ?? null
}

function add_example_task(example: ExampleTask, parent_id: string | null): void {
  const tag_ids = (example.tags ?? []).map(tag_id_named)
  const task = add_task(example.title, parent_id, tag_ids, example.in_my_day ? day(0) : null)

  if (example.notes) set_task_notes(task.id, example.notes)
  if (example.start_at || example.due_at || example.recurrence) {
    set_task_schedule(task.id, { start_at: example.start_at ?? null, due_at: example.due_at ?? null, recurrence: example.recurrence ?? '' })
  }

  // Oldest first, so the latest tick is the one the task remembers.
  for (const days_ago of [...(example.done_days_ago ?? [])].sort((first, second) => second - first)) {
    const is_recurring = Boolean(example.recurrence)
    set_task_done(task.id, !is_recurring, done_moment(days_ago), { kind: 'add', occurrence_on: is_recurring ? day(-days_ago) : occurrence_day(example) })
  }

  for (const subtask of example.subtasks ?? []) add_example_task(subtask, task.id)
}

function resolved_condition(condition: ExampleCondition, group_ids: Map<string, string>): RuleCondition {
  if (condition.kind === 'tag_named') return { kind: 'tag', tag_id: tag_id_named(condition.name), has_tag: condition.has_tag }
  if (condition.kind === 'group_named') return { kind: 'group', group_id: group_ids.get(condition.name)!, has_tag: condition.has_tag }
  return condition
}

function add_filters(group_ids: Map<string, string>): void {
  const group = add_tag_group('Filters', true)
  for (const filter of EXAMPLE_FILTERS) {
    const rule: TagRule = { match: filter.match, conditions: filter.conditions.map((condition) => resolved_condition(condition, group_ids)) }
    add_tag(filter.name, group.id, null, rule, filter.color)
  }
}

function seed(): void {
  const { path, should_reset } = read_target()
  if (existsSync(path)) {
    if (!should_reset) throw new Error(`${path} already exists; pass --reset to replace it`)
    remove_database(path)
  }

  // The schema's own migrations add the preset Area, Priority and Type groups.
  open_task_database(path)
  const projects_group_id = add_projects()
  for (const example of EXAMPLE_TASKS) add_example_task(example, null)
  add_filters(new Map([[PROJECTS_GROUP, projects_group_id]]))
  set_setting('auto_backup', false)
  close_task_database()

  console.log(`Seeded ${path}`)
}

seed()
