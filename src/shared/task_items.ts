import { history_item_changes, item_calls, type ItemFields } from '@x-tech-laboratories/x-libs/items'

import { list_tags, list_tasks, open_database } from './task_database'
import { TASK_LINK_SCHEME, type Task } from './tasks'
import { task_history } from './task_versions'
import type { TaskSnapshot } from './versions'

// ============================================================================
// Items for other apps
// ============================================================================

// The read-only calls every X-app answers about its items, so another program reads X-Tasks without knowing its other
// calls: list_item_kinds, search_items, get_items and list_item_changes, each task an item of kind task, and
// get_item_texts, a task's whole notes as Markdown.

// What an item says about a task, whether it is read from the tasks as they are or from a version in the history.
type TaskFacts = Pick<TaskSnapshot, 'title' | 'notes' | 'is_done' | 'done_at' | 'start_at' | 'due_at' | 'recurrence' | 'my_day_on' | 'estimate_minutes' | 'parent_id' | 'tag_ids'>

// Notes are Markdown; the snippet is their text without the marks.
export function plain_notes(notes: string): string {
  return notes
    .replace(/^ {0,3}(```|~~~).*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Plain facts by name, each left out when the task has none.
function detail_of(task: TaskFacts, tag_names: Map<string, string>, task_titles: Map<string, string>): Record<string, string> {
  const facts: Record<string, string | null> = {
    due: task.due_at,
    start: task.start_at,
    repeats: task.recurrence || null,
    done_at: task.is_done ? task.done_at : null,
    my_day: task.my_day_on,
    estimate_minutes: task.estimate_minutes === null ? null : String(task.estimate_minutes),
    parent: task.parent_id === null ? null : (task_titles.get(task.parent_id) ?? null),
    tags: task.tag_ids.map((tag_id) => tag_names.get(tag_id)).filter((name) => name !== undefined).join(', ') || null
  }
  return Object.fromEntries(Object.entries(facts).filter((fact): fact is [string, string] => fact[1] !== null && fact[1] !== ''))
}

interface Names {
  tags: Map<string, string>
  tasks: Map<string, string>
}

function current_names(tasks: Task[]): Names {
  return { tags: new Map(list_tags().map((tag) => [tag.id, tag.name])), tasks: new Map(tasks.map((task) => [task.id, task.title])) }
}

function item_of(task: TaskFacts, names: Names): Omit<ItemFields, 'id' | 'kind' | 'changed_at'> {
  return { title: task.title, snippet: plain_notes(task.notes), status: task.is_done ? 'done' : '', detail: detail_of(task, names.tags, names.tasks) }
}

// When each task last changed, from its newest version; a task with none yet goes by when it was made.
function changed_times(): Map<string, string> {
  const rows = open_database().prepare('SELECT task_id, MAX(changed_at) AS changed_at FROM task_versions GROUP BY task_id').all() as { task_id: string; changed_at: string }[]
  return new Map(rows.map((row) => [row.task_id, row.changed_at]))
}

function task_items(tasks: Task[], all_tasks: Task[]): ItemFields[] {
  const names = current_names(all_tasks)
  const times = changed_times()
  return tasks.map((task) => ({ ...item_of(task, names), id: task.id, kind: 'task', changed_at: times.get(task.id) ?? task.created_at }))
}

// ============================================================================
// Search
// ============================================================================

// Lower case without accents, so "cafe" finds "Café".
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
}

// How well a task matches: every word must be in its title or notes; the title counts for more than the notes, the
// whole text in the title more than its words apart, and a title that is or starts with the text most of all.
function match_score(task: Task, phrase: string, words: string[]): number {
  const title = folded(task.title)
  const notes = folded(task.notes)
  let score = 0
  for (const word of words) {
    if (title.includes(word)) score += 10
    else if (notes.includes(word)) score += 3
    else return 0
  }
  if (title === phrase) score += 100
  else if (title.startsWith(phrase)) score += 60
  else if (title.includes(phrase)) score += 40
  else if (notes.includes(phrase)) score += 5
  return score
}

// Tasks whose title or notes hold the text, done ones included: the best match first, then open before done, then the
// most recently changed.
export function search_tasks(query: string, limit: number): ItemFields[] {
  const phrase = folded(query).replace(/\s+/g, ' ').trim()
  const words = [...new Set(phrase.split(' ').filter((word) => word !== ''))]
  if (words.length === 0) return []

  const all_tasks = list_tasks()
  const scored = all_tasks.map((task) => ({ task, score: match_score(task, phrase, words) })).filter(({ score }) => score > 0)
  const items = new Map(task_items(scored.map(({ task }) => task), all_tasks).map((item) => [item.id, item]))
  return scored
    .sort(
      (first, second) =>
        second.score - first.score ||
        Number(first.task.is_done) - Number(second.task.is_done) ||
        items.get(second.task.id)!.changed_at.localeCompare(items.get(first.task.id)!.changed_at)
    )
    .slice(0, limit)
    .map(({ task }) => items.get(task.id)!)
}

// ============================================================================
// The calls
// ============================================================================

export const task_item_calls = item_calls(
  {
    kinds: [{ kind: 'task', label: 'Task', has_text: true }],
    search: search_tasks,
    get: (ids) => {
      const all_tasks = list_tasks()
      const wanted = new Set(ids)
      return task_items(all_tasks.filter((task) => wanted.has(task.id)), all_tasks)
    },
    // From the task history, so a deleted task is listed as gone; tag and parent names are those of today.
    changes: (since, limit) => {
      const names = current_names(list_tasks())
      return history_item_changes<TaskSnapshot>([{ kind: 'task', history: task_history, item: (snapshot) => item_of(snapshot, names) }], open_database)(since, limit)
    },
    // A task's notes as written, Markdown; the title is the item's already. A task with no notes is left out.
    text: (ids) => {
      const wanted = new Set(ids)
      const tasks = list_tasks().filter((task) => wanted.has(task.id) && task.notes.trim() !== '')
      const times = changed_times()
      return tasks.map((task) => ({ id: task.id, text: task.notes, format: 'markdown' as const, changed_at: times.get(task.id) ?? task.created_at }))
    }
  },
  { scheme: TASK_LINK_SCHEME }
)

export const task_item_methods = task_item_calls.methods
