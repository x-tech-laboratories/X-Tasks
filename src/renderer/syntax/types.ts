import type { SyntaxId, TaskDateField } from '@shared/settings'
import type { RuleCondition, Tag, TagGroup, Task } from '@shared/tasks'

// ============================================================================
// Context
// ============================================================================

// What a syntax needs to read text: the tags it can name, and the clock and date field that relative dates are read against.
export interface SyntaxContext {
  tags: Tag[]
  tag_groups: TagGroup[]
  // Which task date a date with no field named, such as Todoist's "tomorrow", sets or searches.
  date_field: TaskDateField
  now: Date
}

// ============================================================================
// Quick add
// ============================================================================

// A task read from the multibar: its title once the syntax has taken its tokens out, and what those tokens set.
export interface QuickAdd {
  title: string
  tag_ids: string[]
  start_at: string | null
  due_at: string | null
  // An RFC 5545 rule without the RRULE: prefix, or empty when the task does not repeat.
  recurrence: string
  // Things written in the syntax that could not be used, such as a tag name no tag has.
  problems: string[]
}

// ============================================================================
// Search
// ============================================================================

// A day as YYYY-MM-DD, compared against the day part of a task's date.
export type DayRelation = 'before' | 'on_or_before' | 'on' | 'not_on' | 'on_or_after' | 'after'

// The task date a date term looks at; 'date' is whichever date the settings make a task's date.
export type DateField = 'start' | 'due' | 'done' | 'date'

export type TextField = 'any' | 'title' | 'notes'

export type TextMatch = 'contains' | 'starts' | 'ends' | 'equals'

export type SearchQuery =
  | { kind: 'everything' }
  | { kind: 'nothing' }
  | { kind: 'and'; items: SearchQuery[] }
  | { kind: 'or'; items: SearchQuery[] }
  | { kind: 'not'; item: SearchQuery }
  | { kind: 'text'; text: string; field: TextField; match: TextMatch }
  // Any of the tags, or a tag inside one of them; rule tags count whenever their rule matches.
  | { kind: 'tag'; tag_ids: string[] }
  | { kind: 'date'; field: DateField; relation: DayRelation; day: string }
  | { kind: 'has_date'; field: DateField; is_set: boolean }
  // Not done and its date has passed, counting the time when it has one.
  | { kind: 'overdue'; field: DateField }
  | { kind: 'condition'; condition: RuleCondition }

export interface Search {
  query: SearchQuery
  // Parts of the text the syntax could not read; the rest of the query still applies.
  problems: string[]
}

// What a search is checked against besides the task itself.
export interface SearchContext {
  all_tasks: Task[]
  tags: Tag[]
  date_field: TaskDateField
  now: Date
}

// ============================================================================
// Syntax
// ============================================================================

// One line of a syntax's help: something to type and what it does.
export interface SyntaxExample {
  text: string
  meaning: string
}

export interface Syntax {
  id: SyntaxId
  name: string
  // A sentence on where the syntax comes from and how it reads.
  summary: string
  quick_add_examples: SyntaxExample[]
  search_examples: SyntaxExample[]
  parse_quick_add: (text: string, context: SyntaxContext) => QuickAdd
  parse_search: (text: string, context: SyntaxContext) => Search
}
