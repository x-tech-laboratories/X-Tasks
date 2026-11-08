import type { Tag, TagGroup } from '@shared/tasks'
import type { QuickAdd, SearchQuery, SyntaxContext } from './types'

// ============================================================================
// Tag names
// ============================================================================

// Names match without case, spaces, dashes or underscores, so #kitchen_renovation finds "Kitchen renovation".
export function name_key(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '')
}

// Every tag with the name, plain tags first, in sidebar order; rule tags only when they are wanted.
export function tags_named(name: string, context: SyntaxContext, includes_rule_tags: boolean): Tag[] {
  const key = name_key(name)
  const group_order = (tag: Tag) => context.tag_groups.findIndex((group) => group.id === tag.group_id)
  return context.tags
    .filter((tag) => name_key(tag.name) === key && (includes_rule_tags || !tag.rule))
    .sort((first, second) => Number(Boolean(first.rule)) - Number(Boolean(second.rule)) || group_order(first) - group_order(second) || first.position - second.position)
}

export function group_named(name: string, context: SyntaxContext): TagGroup | null {
  return context.tag_groups.find((group) => name_key(group.name) === name_key(name)) ?? null
}

// The tag a priority number names, 1 the highest: the nth top-level tag of the first single-choice group called Priority.
export function priority_tag(rank: number, context: SyntaxContext): Tag | null {
  const group = context.tag_groups.find((each) => each.is_single_choice && /^priority/i.test(each.name))
  if (!group) return null
  const ranks = context.tags.filter((tag) => tag.group_id === group.id && tag.parent_id === null).sort((first, second) => first.position - second.position)
  return ranks[rank - 1] ?? null
}

// ============================================================================
// Quick add
// ============================================================================

export function empty_quick_add(): QuickAdd {
  return { title: '', tag_ids: [], start_at: null, due_at: null, recurrence: '', problems: [] }
}

// A tag from a single-choice group takes the place of any other tag from that group.
export function with_tag(result: QuickAdd, tag: Tag, context: SyntaxContext): QuickAdd {
  if (result.tag_ids.includes(tag.id)) return result
  const is_single_choice = context.tag_groups.find((group) => group.id === tag.group_id)?.is_single_choice ?? false
  const kept_ids = is_single_choice
    ? result.tag_ids.filter((tag_id) => context.tags.find((each) => each.id === tag_id)?.group_id !== tag.group_id)
    : result.tag_ids
  return { ...result, tag_ids: [...kept_ids, tag.id] }
}

// Gives the task the first plain tag with the name, or notes that none has it.
export function with_tag_named(result: QuickAdd, name: string, context: SyntaxContext): QuickAdd {
  const [tag] = tags_named(name, context, false)
  return tag ? with_tag(result, tag, context) : with_problem(result, `No tag is named ${name}`)
}

export function with_problem(result: QuickAdd, problem: string): QuickAdd {
  return { ...result, problems: [...result.problems, problem] }
}

// Sets the start or due date, or for 'date' whichever the settings make a task's date.
export function with_date(result: QuickAdd, field: 'start' | 'due' | 'date', date: string, context: SyntaxContext): QuickAdd {
  const is_start = field === 'start' || (field === 'date' && context.date_field === 'start')
  return is_start ? { ...result, start_at: date } : { ...result, due_at: date }
}

// A repeating task given no date starts on the repeat's first day, so the rule has a day to count from.
export function finished_quick_add(result: QuickAdd, title: string, first_repeat_day: string | null, context: SyntaxContext): QuickAdd {
  const tidy_title = title.replace(/\s+/g, ' ').trim()
  const is_undated = result.start_at === null && result.due_at === null
  const dated = result.recurrence && is_undated && first_repeat_day ? with_date(result, 'date', first_repeat_day, context) : result
  return { ...dated, title: tidy_title }
}

// ============================================================================
// Queries
// ============================================================================

export function all_of(items: SearchQuery[]): SearchQuery {
  const kept = items.filter((item) => item.kind !== 'everything')
  if (kept.length === 0) return { kind: 'everything' }
  return kept.length === 1 ? kept[0]! : { kind: 'and', items: kept }
}

export function any_of(items: SearchQuery[]): SearchQuery {
  if (items.length === 0) return { kind: 'nothing' }
  return items.length === 1 ? items[0]! : { kind: 'or', items }
}

export function none_of(item: SearchQuery): SearchQuery {
  return { kind: 'not', item }
}

export function text_query(text: string): SearchQuery {
  return { kind: 'text', text, field: 'any', match: 'contains' }
}

// Tasks holding any tag with the name, or nothing with a note when no tag has it.
export function tag_query(name: string, context: SyntaxContext, problems: string[]): SearchQuery {
  const tags = tags_named(name, context, true)
  if (tags.length === 0) {
    problems.push(`No tag is named ${name}`)
    return { kind: 'nothing' }
  }
  return { kind: 'tag', tag_ids: tags.map((tag) => tag.id) }
}

// A whole search read as words, as the Plain syntax and a search a syntax cannot read both do.
export function words_query(text: string): SearchQuery {
  const trimmed = text.trim()
  return trimmed ? text_query(trimmed) : { kind: 'everything' }
}
