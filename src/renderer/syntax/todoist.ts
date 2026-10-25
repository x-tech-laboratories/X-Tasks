import { format_task_date, parse_task_date } from '@shared/schedule'
import { all_of, any_of, empty_quick_add, finished_quick_add, none_of, priority_tag, tag_query, text_query, with_date, with_problem, with_tag, with_tag_named } from './building'
import { add_days, day_of, find_task_date, read_day, read_time, today_of, TITLE_DATE_OPTIONS, type DateOptions } from './dates'
import { find_repeat } from './repeats'
import type { DayRelation, QuickAdd, SearchQuery, Syntax, SyntaxContext } from './types'

// ============================================================================
// Quick add
// ============================================================================

// A word of the text, with its spelling kept for the title; a "quoted phrase" is one literal word the parser leaves alone.
interface Word {
  text: string
  lower: string
  is_literal: boolean
}

function split_title_words(text: string): Word[] {
  const words: Word[] = []
  for (const match of text.matchAll(/"([^"]*)"|(\S+)/g)) {
    if (match[1] !== undefined) words.push({ text: match[1], lower: match[1].toLowerCase(), is_literal: true })
    else words.push({ text: match[2]!, lower: match[2]!.toLowerCase(), is_literal: false })
  }
  return words
}

// "at 9am" or "9am" right after a repeat gives its days a time.
function time_after(words: string[], start: number): { hours: number; minutes: number; length: number } | null {
  const has_at = words[start] === 'at'
  const time = read_time(words[start + (has_at ? 1 : 0)] ?? '')
  return time ? { ...time, length: has_at ? 2 : 1 } : null
}

// Takes #tag and @label for tags, p1 to p4 for priority, a date anywhere, and a repeat such as "every monday"; other words make the title.
function parse_quick_add(text: string, context: SyntaxContext): QuickAdd {
  const words = split_title_words(text)
  // Quoted phrases never read as dates, so they stand in as a word no date or repeat contains.
  const lowers = words.map((word) => (word.is_literal ? '"' : word.lower))
  const title_words: string[] = []
  let result = empty_quick_add()
  let first_repeat_day: string | null = null
  let has_date = false

  for (let index = 0; index < words.length; ) {
    const word = words[index]!
    if (word.is_literal) {
      title_words.push(word.text)
      index += 1
      continue
    }

    if (/^[#@].+/.test(word.text)) {
      result = with_tag_named(result, word.text.slice(1), context)
      index += 1
      continue
    }

    const priority = /^p([1-4])$/.exec(word.lower)
    if (priority) {
      const tag = priority_tag(Number(priority[1]), context)
      if (tag) result = with_tag(result, tag, context)
      else if (priority[1] !== '4') result = with_problem(result, `No priority tag for ${word.text}`)
      index += 1
      continue
    }

    const repeat = result.recurrence ? null : find_repeat(lowers, index, context.now)
    if (repeat) {
      result = { ...result, recurrence: repeat.rule }
      first_repeat_day = repeat.first_day
      index += repeat.length
      const time = time_after(lowers, index)
      if (time && !has_date) {
        const day = parse_task_date(repeat.first_day)
        day.setHours(time.hours, time.minutes)
        result = with_date(result, 'date', format_task_date(day, true), context)
        has_date = true
        index += time.length
      }
      continue
    }

    const date = has_date ? null : find_task_date(lowers, index, TITLE_DATE_OPTIONS, context.now)
    if (date) {
      result = with_date(result, 'date', date.date, context)
      has_date = true
      index += date.length
      continue
    }

    title_words.push(word.text)
    index += 1
  }

  return finished_quick_add(result, title_words.join(' '), first_repeat_day, context)
}

// ============================================================================
// Search
// ============================================================================

type Token = { kind: 'and' | 'or' | 'not' | 'open' | 'close' | 'list' } | { kind: 'term'; text: string }

const OPERATORS: Record<string, Token['kind']> = { '&': 'and', '|': 'or', '!': 'not', '(': 'open', ')': 'close', ',': 'list' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let term = ''
  const end_term = (): void => {
    if (term.trim()) tokens.push({ kind: 'term', text: term.trim() })
    term = ''
  }

  for (const character of text) {
    const operator = OPERATORS[character]
    if (operator) {
      end_term()
      tokens.push({ kind: operator } as Token)
    } else {
      term += character
    }
  }
  end_term()
  return tokens
}

// Day words in a filter may be short, such as "fri", since a filter holds no ordinary sentences.
const FILTER_DATE_OPTIONS: DateOptions = { allows_bare_numbers: false, allows_short_forms: true }

function day_from(text: string, context: SyntaxContext): string | null {
  const day = read_day(text.toLowerCase().split(/\s+/).filter(Boolean), FILTER_DATE_OPTIONS, context.now)
  return day ? day_of(day) : null
}

const DATE_PREFIXES: { pattern: RegExp; relation: DayRelation }[] = [
  { pattern: /^(?:due|date) before:\s*(.+)$/, relation: 'before' },
  { pattern: /^(?:due|date) after:\s*(.+)$/, relation: 'after' },
  { pattern: /^(?:due|date):\s*(.+)$/, relation: 'on' }
]

// One filter term, such as today, overdue, #Work, @waiting, p1, "7 days", "due before: friday" or "search: invoice".
function term_query(text: string, context: SyntaxContext, problems: string[]): SearchQuery {
  const lower = text.toLowerCase().replace(/\s+/g, ' ')
  const today = today_of(context.now)

  if (lower === 'today' || lower === 'tod') return { kind: 'date', field: 'date', relation: 'on', day: day_of(today) }
  if (lower === 'tomorrow' || lower === 'tom') return { kind: 'date', field: 'date', relation: 'on', day: day_of(add_days(today, 1)) }
  if (lower === 'yesterday') return { kind: 'date', field: 'date', relation: 'on', day: day_of(add_days(today, -1)) }
  if (lower === 'overdue' || lower === 'od') return { kind: 'overdue', field: 'date' }
  if (lower === 'no date' || lower === 'no due date') return { kind: 'has_date', field: 'date', is_set: false }
  if (lower === 'recurring') return { kind: 'condition', condition: { kind: 'recurring', is_recurring: true } }
  if (lower === 'subtask') return { kind: 'condition', condition: { kind: 'subtask', is_subtask: true } }
  if (lower === 'no labels') return { kind: 'condition', condition: { kind: 'tagged', is_tagged: false } }

  const days_ahead = /^(?:next )?(\d+) days$/.exec(lower)
  if (days_ahead) {
    const last_day = day_of(add_days(today, Math.max(0, Number(days_ahead[1]) - 1)))
    return all_of([{ kind: 'date', field: 'date', relation: 'on_or_after', day: day_of(today) }, { kind: 'date', field: 'date', relation: 'on_or_before', day: last_day }])
  }

  const priority = /^p([1-4])$/.exec(lower)
  if (priority) {
    const tag = priority_tag(Number(priority[1]), context)
    if (tag) return { kind: 'tag', tag_ids: [tag.id] }
    const group = context.tag_groups.find((each) => each.is_single_choice && /^priority/i.test(each.name))
    // p4 is Todoist's "no priority", the rank past the last one a group has.
    if (group && priority[1] === '4') return { kind: 'condition', condition: { kind: 'group', group_id: group.id, has_tag: false } }
    problems.push(`No priority tag for ${text}`)
    return { kind: 'nothing' }
  }

  const tag = /^#{1,2}(.+)$|^@(.+)$/.exec(text)
  if (tag) return tag_query((tag[1] ?? tag[2])!, context, problems)

  const search = /^search:\s*(.*)$/.exec(lower)
  if (search) return text_query(text.slice(text.indexOf(':') + 1).trim())

  for (const { pattern, relation } of DATE_PREFIXES) {
    const match = pattern.exec(lower)
    if (!match) continue
    const day = day_from(match[1]!, context)
    if (day) return { kind: 'date', field: 'date', relation, day }
    problems.push(`Cannot read the date in "${text}"`)
    return { kind: 'nothing' }
  }

  const day = day_from(lower, context)
  if (day) return { kind: 'date', field: 'date', relation: 'on', day }

  // Any other words are looked for in titles and notes, so a plain search still works.
  return text_query(text)
}

// Commas split a filter into lists, which together find what any of them finds; | binds looser than &, and ! tightest.
function parse_search(text: string, context: SyntaxContext) {
  const tokens = tokenize(text)
  const problems: string[] = []
  let position = 0

  const peek = (): Token | undefined => tokens[position]

  function parse_list(): SearchQuery {
    const items = [parse_or()]
    while (peek()?.kind === 'list') {
      position += 1
      items.push(parse_or())
    }
    return any_of(items)
  }

  function parse_or(): SearchQuery {
    const items = [parse_and()]
    while (peek()?.kind === 'or') {
      position += 1
      items.push(parse_and())
    }
    return any_of(items)
  }

  function parse_and(): SearchQuery {
    const items = [parse_unary()]
    while (peek()?.kind === 'and') {
      position += 1
      items.push(parse_unary())
    }
    return all_of(items)
  }

  function parse_unary(): SearchQuery {
    const token = peek()
    if (!token) return { kind: 'everything' }
    position += 1
    if (token.kind === 'not') return none_of(parse_unary())
    if (token.kind === 'open') {
      const inner = parse_list()
      if (peek()?.kind === 'close') position += 1
      else problems.push('A bracket is not closed')
      return inner
    }
    if (token.kind === 'term') return term_query(token.text, context, problems)
    problems.push(`Unexpected "${Object.entries(OPERATORS).find(([, kind]) => kind === token.kind)?.[0]}"`)
    return { kind: 'everything' }
  }

  const query = parse_list()
  if (position < tokens.length) problems.push('Some of the filter could not be read')
  return { query, problems }
}

// ============================================================================
// Syntax
// ============================================================================

export const TODOIST_SYNTAX: Syntax = {
  id: 'todoist',
  name: 'Todoist',
  summary: 'The quick add and filters of Todoist, which Planify follows too: #tag and @label, p1 to p4, and dates written as words.',
  quick_add_examples: [
    { text: 'Pay rent every 1st #Finances', meaning: 'Repeats on the 1st of each month, tagged Finances' },
    { text: 'Call Sam tomorrow at 5pm #Career p1', meaning: 'Dated tomorrow 17:00, tagged Career, top priority' },
    { text: 'Water the plants every mon, wed and fri', meaning: 'Repeats on those weekdays from the next one' },
    { text: 'Book "Monday Club" tickets next week @Social', meaning: 'Quotes keep words from being read as a date' }
  ],
  search_examples: [
    { text: 'today | overdue', meaning: 'Tasks dated today or overdue' },
    { text: '#Career & p1', meaning: 'Career tasks at top priority' },
    { text: '7 days & !@Waiting', meaning: 'Dated in the next 7 days and not tagged Waiting' },
    { text: 'no date, recurring', meaning: 'Undated tasks, and repeating ones' },
    { text: 'due before: friday', meaning: 'Dated before this coming Friday' },
    { text: 'search: invoice', meaning: 'Title or notes contain "invoice"' }
  ],
  parse_quick_add,
  parse_search
}
