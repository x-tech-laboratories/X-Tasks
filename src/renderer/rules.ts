import type { RuleCondition, Tag, TagRule, Task } from '@shared/tasks'
import { days_between, is_overdue, parse_task_date } from '@shared/schedule'
import { subtree_ids } from './views'

// ============================================================================
// Conditions
// ============================================================================

export type ConditionKind = RuleCondition['kind']

export const CONDITION_CHOICES: { kind: ConditionKind; label: string }[] = [
  { kind: 'status', label: 'Status' },
  { kind: 'tag', label: 'Tag' },
  { kind: 'due', label: 'Due date' },
  { kind: 'start', label: 'Start date' },
  { kind: 'completed_within', label: 'Completed in the last' },
  { kind: 'recurring', label: 'Repeats' },
  { kind: 'subtask', label: 'Nesting' },
  { kind: 'title', label: 'Title contains' }
]

// The condition a row starts as when its kind is picked; a tag condition starts on the first plain tag.
export function default_condition(kind: ConditionKind, tags: Tag[]): RuleCondition {
  switch (kind) {
    case 'status': return { kind, is_done: true }
    case 'tag': return { kind, tag_id: tags.find((tag) => !tag.rule)?.id ?? '', has_tag: true }
    case 'due': return { kind, when: 'overdue', days: 7 }
    case 'start': return { kind, when: 'started' }
    case 'completed_within': return { kind, days: 7 }
    case 'recurring': return { kind, is_recurring: true }
    case 'subtask': return { kind, is_subtask: false }
    case 'title': return { kind, text: '' }
  }
}

export const EMPTY_RULE: TagRule = { match: 'all', conditions: [] }

// ============================================================================
// Matching
// ============================================================================

// A tag condition looks at the task's own tags and those of the tasks above it, as tag filters do.
function condition_holds(condition: RuleCondition, task: Task, chain_tag_ids: Set<string>, tags: Tag[], now: Date): boolean {
  switch (condition.kind) {
    case 'status': return task.is_done === condition.is_done
    case 'tag': {
      const tag_ids = subtree_ids(condition.tag_id, tags)
      const has_tag = [...tag_ids].some((id) => chain_tag_ids.has(id))
      return has_tag === condition.has_tag
    }
    case 'due': {
      if (condition.when === 'none') return task.due_at === null
      if (task.due_at === null) return false
      if (condition.when === 'overdue') return is_overdue(task.due_at, now)
      const day_offset = days_between(now, parse_task_date(task.due_at))
      if (condition.when === 'today') return day_offset === 0
      if (condition.when === 'within_days') return day_offset >= 0 && day_offset <= condition.days
      return true
    }
    case 'start': {
      if (condition.when === 'none') return task.start_at === null
      const has_started = task.start_at !== null && parse_task_date(task.start_at) <= now
      return condition.when === 'started' ? has_started : !has_started
    }
    case 'completed_within':
      return task.is_done && task.done_at !== null && days_between(new Date(task.done_at), now) < condition.days
    case 'recurring': return (task.recurrence !== '') === condition.is_recurring
    case 'subtask': return (task.parent_id !== null) === condition.is_subtask
    case 'title': return task.title.toLowerCase().includes(condition.text.trim().toLowerCase())
  }
}

export function rule_matches(rule: TagRule, task: Task, chain_tag_ids: Set<string>, tags: Tag[], now = new Date()): boolean {
  const holds = (condition: RuleCondition) => condition_holds(condition, task, chain_tag_ids, tags, now)
  return rule.match === 'all' ? rule.conditions.every(holds) : rule.conditions.length === 0 || rule.conditions.some(holds)
}
