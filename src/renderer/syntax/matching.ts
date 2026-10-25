import { format_task_date, is_overdue, task_date_of } from '@shared/schedule'
import type { Task } from '@shared/tasks'
import { condition_holds } from '../rules'
import { chain_tag_ids_of, subtree_ids, task_has_tag } from '../views'
import type { DateField, DayRelation, SearchContext, SearchQuery, TextField, TextMatch } from './types'

// ============================================================================
// Terms
// ============================================================================

// The date a field names, as a local date or date and time; a done time is kept as an ISO time and read back as a local one.
function date_in(task: Task, field: DateField, context: SearchContext): string | null {
  if (field === 'start') return task.start_at
  if (field === 'due') return task.due_at
  if (field === 'done') return task.done_at === null ? null : format_task_date(new Date(task.done_at), true)
  return task_date_of(task, context.date_field)
}

function day_relation_holds(task_day: string, relation: DayRelation, day: string): boolean {
  switch (relation) {
    case 'before': return task_day < day
    case 'on_or_before': return task_day <= day
    case 'on': return task_day === day
    case 'not_on': return task_day !== day
    case 'on_or_after': return task_day >= day
    case 'after': return task_day > day
  }
}

function text_holds(task: Task, text: string, field: TextField, match: TextMatch): boolean {
  const wanted = text.toLowerCase()
  const fields = field === 'title' ? [task.title] : field === 'notes' ? [task.notes] : [task.title, task.notes]
  return fields.some((value) => {
    const lower = value.toLowerCase()
    if (match === 'starts') return lower.startsWith(wanted)
    if (match === 'ends') return lower.endsWith(wanted)
    if (match === 'equals') return lower === wanted
    return lower.includes(wanted)
  })
}

// ============================================================================
// Matching
// ============================================================================

// Whether the task is one the search finds; a tag term finds tasks with a tag inside the named one too.
export function query_matches(query: SearchQuery, task: Task, context: SearchContext): boolean {
  switch (query.kind) {
    case 'everything': return true
    case 'nothing': return false
    case 'and': return query.items.every((item) => query_matches(item, task, context))
    case 'or': return query.items.some((item) => query_matches(item, task, context))
    case 'not': return !query_matches(query.item, task, context)
    case 'text': return text_holds(task, query.text, query.field, query.match)
    case 'tag': {
      const chain_tag_ids = chain_tag_ids_of(task, context.all_tasks)
      return query.tag_ids.some((tag_id) =>
        [...subtree_ids(tag_id, context.tags)].some((id) => task_has_tag(task, id, context.all_tasks, chain_tag_ids, context.tags))
      )
    }
    case 'date': {
      const date = date_in(task, query.field, context)
      return date !== null && day_relation_holds(date.slice(0, 10), query.relation, query.day)
    }
    case 'has_date': return (date_in(task, query.field, context) !== null) === query.is_set
    case 'overdue': {
      const date = date_in(task, query.field, context)
      return !task.is_done && date !== null && is_overdue(date, context.now)
    }
    case 'condition':
      return condition_holds(query.condition, task, context.all_tasks, chain_tag_ids_of(task, context.all_tasks), context.tags, context.now)
  }
}
