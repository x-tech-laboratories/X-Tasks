import { format_task_date } from '@shared/schedule'
import { all_of, any_of, empty_quick_add, finished_quick_add, group_named, name_key, none_of, tag_query, tags_named, text_query, with_date, with_problem, with_tag, with_tag_named } from './building'
import { add_days, day_of, read_task_date, today_of, VALUE_DATE_OPTIONS } from './dates'
import type { DateField, DayRelation, QuickAdd, SearchQuery, Syntax, SyntaxContext, TextMatch } from './types'

// ============================================================================
// Labels
// ============================================================================

// The labels X-Tasks's Trilium import reads, so notes and tasks name dates the same way.
const DATE_LABELS: Record<string, DateField> = {
  startdate: 'start', startdatetime: 'start', duedate: 'due', duedatetime: 'due', donedate: 'done'
}

// A Trilium smart value such as TODAY, TODAY+7 or NOW-1, or a written date; a label ending in Time keeps the time.
function read_value_date(value: string, keeps_time: boolean, context: SyntaxContext): string | null {
  const smart = /^(TODAY|NOW)([+-]\d+)?$/i.exec(value)
  if (smart) {
    const offset = Number(smart[2] ?? 0)
    if (smart[1]!.toUpperCase() === 'NOW') return format_task_date(new Date(context.now.getTime() + offset * 1000), true)
    return day_of(add_days(today_of(context.now), offset))
  }
  const date = read_task_date(value.replace(/(?<=\p{L})[-_](?=\p{L})/gu, ' '), VALUE_DATE_OPTIONS, context.now)
  if (!date) return null
  return keeps_time || date.length === 10 ? date : date.slice(0, 10)
}

function unquoted(value: string): string {
  return /^(["'`]).*\1$/.test(value) ? value.slice(1, -1) : value
}

// ============================================================================
// Quick add
// ============================================================================

// #tag gives a tag, #group=tag a tag of that group, and #dueDate, #startDate and #recurrence set the schedule.
function parse_quick_add(text: string, context: SyntaxContext): QuickAdd {
  let result = empty_quick_add()

  const title = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)(?:=("[^"]*"|'[^']*'|\S+))?/gu, (whole, space: string, label: string, raw_value: string | undefined) => {
    const key = label.toLowerCase()
    const value = raw_value === undefined ? null : unquoted(raw_value)

    if (value === null) {
      result = with_tag_named(result, label, context)
      return space
    }

    const date_field = DATE_LABELS[key]
    if (date_field === 'start' || date_field === 'due') {
      const date = read_value_date(value, key.endsWith('time'), context)
      if (!date) {
        result = with_problem(result, `Cannot read the date in #${label}`)
        return whole
      }
      result = with_date(result, date_field, date, context)
      return space
    }

    if (key === 'recurrence') {
      result = { ...result, recurrence: value.replace(/^RRULE:/i, '') }
      return space
    }

    const group = group_named(label, context)
    if (!group) {
      result = with_problem(result, `No filter group is named ${label}`)
      return whole
    }
    const tag = tags_named(value.replace(/^\d+-/, ''), context, false).find((each) => each.group_id === group.id)
    if (tag) result = with_tag(result, tag, context)
    else result = with_problem(result, `${group.name} has no tag named ${value}`)
    return space
  })

  return finished_quick_add(result, title, day_of(today_of(context.now)), context)
}

// ============================================================================
// Search tokens
// ============================================================================

type Token =
  | { kind: 'open' | 'close' }
  | { kind: 'keyword'; word: 'and' | 'or' | 'not' }
  | { kind: 'operator'; operator: string }
  | { kind: 'word'; text: string; is_quoted: boolean }

const OPERATOR_PATTERN = /^(\*=\*|!=|<=|>=|=\*|\*=|%=|=|<|>)/

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let rest = text

  while ((rest = rest.trimStart())) {
    if (rest[0] === '(' || rest[0] === ')') {
      tokens.push({ kind: rest[0] === '(' ? 'open' : 'close' })
      rest = rest.slice(1)
      continue
    }
    const operator = OPERATOR_PATTERN.exec(rest)
    if (operator) {
      tokens.push({ kind: 'operator', operator: operator[1]! })
      rest = rest.slice(operator[1]!.length)
      continue
    }
    const quoted = /^(["'`])(.*?)\1/.exec(rest)
    if (quoted) {
      tokens.push({ kind: 'word', text: quoted[2]!, is_quoted: true })
      rest = rest.slice(quoted[0].length)
      continue
    }
    // A word runs to a space, a bracket or an operator; the ! of #!label and the - of TODAY-7 stay inside it.
    const word = /^(?:#!?)?[^\s()=<>*%"'`!]+(?:[!*][^\s()=<>*%"'`!]+)*/.exec(rest)?.[0] ?? rest[0]!
    const lower = word.toLowerCase()
    tokens.push(lower === 'and' || lower === 'or' || lower === 'not' ? { kind: 'keyword', word: lower } : { kind: 'word', text: word, is_quoted: false })
    rest = rest.slice(word.length)
  }
  return tokens
}

// ============================================================================
// Search terms
// ============================================================================

const DAY_RELATIONS: Record<string, DayRelation> = { '=': 'on', '!=': 'not_on', '<': 'before', '<=': 'on_or_before', '>': 'after', '>=': 'on_or_after' }

const TEXT_MATCHES: Record<string, TextMatch> = { '*=*': 'contains', '=*': 'starts', '*=': 'ends', '=': 'equals' }

// #label alone tests that a task has it, #!label that it lacks it, and #label with an operator compares its value.
function label_query(label: string, operator: string | null, value: string | null, context: SyntaxContext, problems: string[]): SearchQuery {
  const is_negated = label.startsWith('!')
  const name = is_negated ? label.slice(1) : label
  const key = name.toLowerCase()
  const negated = (query: SearchQuery) => (is_negated ? none_of(query) : query)

  if (operator === null || value === null) {
    const date_field = DATE_LABELS[key]
    if (date_field) return negated({ kind: 'has_date', field: date_field, is_set: true })
    if (key === 'done') return negated({ kind: 'condition', condition: { kind: 'status', is_done: true } })
    if (key === 'recurrence') return negated({ kind: 'condition', condition: { kind: 'recurring', is_recurring: true } })
    const group = group_named(name, context)
    if (group && tags_named(name, context, true).length === 0) {
      return negated({ kind: 'condition', condition: { kind: 'group', group_id: group.id, has_tag: true } })
    }
    return negated(tag_query(name, context, problems))
  }

  const date_field = DATE_LABELS[key]
  if (date_field) {
    const relation = DAY_RELATIONS[operator]
    const date = read_value_date(value, false, context)
    if (!relation || !date) {
      problems.push(`Cannot compare #${name} ${operator} ${value}`)
      return { kind: 'nothing' }
    }
    return negated({ kind: 'date', field: date_field, relation, day: date.slice(0, 10) })
  }

  // #area=Career, or #area *=* car for every Area tag whose name holds "car".
  const group = group_named(name, context)
  if (!group) {
    problems.push(`No filter group is named ${name}`)
    return { kind: 'nothing' }
  }
  const match = TEXT_MATCHES[operator === '!=' ? '=' : operator]
  if (!match) {
    problems.push(`#${name} cannot use ${operator}`)
    return { kind: 'nothing' }
  }
  const wanted = name_key(value)
  const found = context.tags.filter((tag) => {
    if (tag.group_id !== group.id) return false
    const tag_key = name_key(tag.name)
    return match === 'equals' ? tag_key === wanted : match === 'starts' ? tag_key.startsWith(wanted) : match === 'ends' ? tag_key.endsWith(wanted) : tag_key.includes(wanted)
  })
  const query: SearchQuery = found.length > 0 ? { kind: 'tag', tag_ids: found.map((tag) => tag.id) } : { kind: 'nothing' }
  return negated(operator === '!=' ? none_of(query) : query)
}

// note.title and note.content compare a task's title and notes; other note properties have nothing to compare here.
function property_query(property: string, operator: string, value: string, problems: string[]): SearchQuery {
  const field = property === 'note.title' ? 'title' : property === 'note.content' || property === 'note.text' ? 'notes' : null
  const match = TEXT_MATCHES[operator === '!=' ? '=' : operator]
  if (!field || !match) {
    problems.push(`Cannot search ${property} ${operator}`)
    return { kind: 'nothing' }
  }
  const query: SearchQuery = { kind: 'text', text: value, field, match }
  return operator === '!=' ? none_of(query) : query
}

// ============================================================================
// Search
// ============================================================================

// Terms side by side must all match; OR binds looser than AND, and NOT(...) turns a bracketed part around.
function parse_search(text: string, context: SyntaxContext) {
  const tokens = tokenize(text)
  const problems: string[] = []
  let position = 0
  const peek = (): Token | undefined => tokens[position]
  const is_keyword = (word: string) => {
    const token = peek()
    return token?.kind === 'keyword' && token.word === word
  }

  function parse_or(): SearchQuery {
    const items = [parse_and()]
    while (is_keyword('or')) {
      position += 1
      items.push(parse_and())
    }
    return any_of(items)
  }

  function parse_and(): SearchQuery {
    const items: SearchQuery[] = []
    while (peek() && peek()!.kind !== 'close' && !is_keyword('or')) {
      if (is_keyword('and')) {
        position += 1
        continue
      }
      const item = parse_unary()
      if (item) items.push(item)
    }
    return all_of(items)
  }

  function parse_unary(): SearchQuery | null {
    const token = tokens[position]!
    position += 1

    if (token.kind === 'keyword' && token.word === 'not') {
      if (peek()?.kind !== 'open') {
        problems.push('NOT needs a bracketed part after it, as in NOT(#done)')
        return null
      }
      return none_of(parse_unary() ?? { kind: 'everything' })
    }
    if (token.kind === 'open') {
      const inner = parse_or()
      if (peek()?.kind === 'close') position += 1
      else problems.push('A bracket is not closed')
      return inner
    }
    if (token.kind !== 'word') {
      problems.push(token.kind === 'operator' ? `${token.operator} needs something to compare before it` : 'Unexpected word')
      return null
    }

    // A label or property followed by an operator takes the next word as its value.
    const next = peek()
    const compares = next?.kind === 'operator' && tokens[position + 1]?.kind === 'word'
    const operator = compares ? (next as { operator: string }).operator : null
    const value = compares ? (tokens[position + 1] as { text: string }).text : null
    if (compares) position += 2

    if (!token.is_quoted && token.text.startsWith('#') && token.text.length > 1) return label_query(token.text.slice(1), operator, value, context, problems)
    if (!token.is_quoted && token.text.toLowerCase().startsWith('note.')) {
      if (operator === null || value === null) {
        problems.push(`${token.text} needs an operator and a value`)
        return null
      }
      return property_query(token.text.toLowerCase(), operator, value, problems)
    }
    if (!token.is_quoted && token.text.startsWith('~')) {
      problems.push('X-Tasks has no relations to search with ~')
      return { kind: 'nothing' }
    }
    return text_query(token.text)
  }

  const query = parse_or()
  if (position < tokens.length) problems.push('A closing bracket has no opening one')
  return { query, problems }
}

// ============================================================================
// Syntax
// ============================================================================

export const TRILIUM_SYNTAX: Syntax = {
  id: 'trilium',
  name: 'Trilium',
  summary: "Trilium's label attributes and search: #tag, #group=tag, the dueDate and startDate labels the Trilium import reads, and AND, OR and NOT().",
  quick_add_examples: [
    { text: 'Renew the passport #area=Admin #dueDate=TODAY+30', meaning: 'Tagged Admin, due 30 days from today' },
    { text: 'Stand-up #Career #startDateTime=2026-11-02T09:30 #recurrence=FREQ=WEEKLY', meaning: 'Starts Nov 2nd at 9:30 and repeats weekly' },
    { text: 'Read #type=Habit #recurrence=FREQ=DAILY', meaning: 'A daily habit, dated today' }
  ],
  search_examples: [
    { text: '#area=Career #!done', meaning: 'Open Career tasks' },
    { text: '#dueDate <= TODAY+7', meaning: 'Due within the next week, or earlier' },
    { text: '#Errands OR #Shopping', meaning: 'Tagged either Errands or Shopping' },
    { text: 'note.title *=* invoice', meaning: 'Title contains "invoice"' },
    { text: 'NOT(#recurrence) #dueDate', meaning: 'One-off tasks with a due date' }
  ],
  parse_quick_add,
  parse_search
}
