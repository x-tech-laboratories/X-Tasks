import { all_of, any_of, empty_quick_add, finished_quick_add, none_of, tag_query, text_query, with_date, with_problem, with_tag_named } from './building'
import { add_days, day_of, read_task_date, today_of, VALUE_DATE_OPTIONS } from './dates'
import { read_repeat_value } from './repeats'
import type { QuickAdd, SearchQuery, Syntax, SyntaxContext } from './types'

// ============================================================================
// Values
// ============================================================================

// GTG's fuzzy dates have no place in a task's date here, so they are named back to the user instead.
const FUZZY_DATES = ['now', 'soon', 'someday', 'later']

// A value runs to the next space; a dash or underscore between letters stands for a space, so due:next-week means next week.
function value_text(value: string): string {
  return value.replace(/^"|"$/g, '').replace(/(?<=\p{L})[-_](?=\p{L})/gu, ' ')
}

// A GTG tag starts with @ and runs over letters, digits and the marks GTG allows in tag names.
const TAG_PATTERN = /@[\p{L}\p{N}_./:+-]+/gu

// ============================================================================
// Quick add
// ============================================================================

const TAG_KEYS = ['tags', 'tag']
const START_KEYS = ['start', 'starts', 'defer']
const DUE_KEYS = ['due']
const REPEAT_KEYS = ['every']

// Tags written as @tag stay in the title as GTG keeps them; key:value tokens set the rest and leave the title.
function parse_quick_add(text: string, context: SyntaxContext): QuickAdd {
  let result = empty_quick_add()
  let first_repeat_day: string | null = null

  for (const match of text.matchAll(TAG_PATTERN)) result = with_tag_named(result, match[0].slice(1).replace(/[.:]+$/, ''), context)

  const title = text.replace(/(^|\s)([\w-]+):\s*("[^"]*"|\S+)/g, (whole, space: string, key: string, value: string) => {
    const lower_key = key.toLowerCase()
    const wanted = value_text(value)

    if (TAG_KEYS.includes(lower_key)) {
      for (const name of value.split(',').filter(Boolean)) result = with_tag_named(result, name.replace(/^@/, ''), context)
      return space
    }

    if (START_KEYS.includes(lower_key) || DUE_KEYS.includes(lower_key)) {
      if (FUZZY_DATES.includes(wanted.toLowerCase())) {
        result = with_problem(result, `"${wanted}" is a GTG fuzzy date, which X-Tasks has no place for`)
        return whole
      }
      const date = read_task_date(wanted, VALUE_DATE_OPTIONS, context.now)
      if (!date) return whole
      result = with_date(result, START_KEYS.includes(lower_key) ? 'start' : 'due', date, context)
      return space
    }

    if (REPEAT_KEYS.includes(lower_key)) {
      const repeat = read_repeat_value(wanted, context.now)
      if (!repeat) return whole
      result = { ...result, recurrence: repeat.rule }
      first_repeat_day = repeat.first_day
      return space
    }

    return whole
  })

  return finished_quick_add(result, title, first_repeat_day, context)
}

// ============================================================================
// Search
// ============================================================================

type Element = { kind: 'command'; name: string } | { kind: 'word'; text: string }

function tokenize(text: string): Element[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((match) =>
    match[1] !== undefined ? { kind: 'word', text: match[1] } : match[2]!.startsWith('!') ? { kind: 'command', name: match[2]!.slice(1).toLowerCase() } : { kind: 'word', text: match[2]! }
  )
}

// GTG's dates are due dates, so its date commands look at the due date alone.
function due_on(day: Date): SearchQuery {
  return { kind: 'date', field: 'due', relation: 'on', day: day_of(day) }
}

// Elements all have to match, except two joined by !or, where either may; !not turns the next element around.
function parse_search(text: string, context: SyntaxContext) {
  const elements = tokenize(text)
  const problems: string[] = []
  const groups: SearchQuery[][] = []
  let position = 0
  let joins_previous = false

  function read_element(): SearchQuery | null {
    const element = elements[position]
    if (!element) return null
    position += 1

    if (element.kind === 'word') return element.text.startsWith('@') && element.text.length > 1 ? tag_query(element.text.slice(1), context, problems) : text_query(element.text)

    const today = today_of(context.now)
    switch (element.name) {
      case 'not': {
        const negated = read_element()
        return negated ? none_of(negated) : null
      }
      case 'today': return due_on(today)
      case 'tomorrow': return due_on(add_days(today, 1))
      case 'nodate': return { kind: 'has_date', field: 'due', is_set: false }
      case 'notag': return { kind: 'condition', condition: { kind: 'tagged', is_tagged: false } }
      case 'before':
      case 'after': {
        const value = elements[position]
        position += 1
        const date = value?.kind === 'word' ? read_task_date(value_text(value.text), VALUE_DATE_OPTIONS, context.now) : null
        if (!date) {
          problems.push(`!${element.name} needs a date after it`)
          return null
        }
        return { kind: 'date', field: 'due', relation: element.name, day: date.slice(0, 10) }
      }
      case 'now':
      case 'soon':
      case 'someday':
        problems.push(`!${element.name} looks for GTG's fuzzy dates, which X-Tasks has none of`)
        return { kind: 'nothing' }
      default:
        problems.push(`GTG has no !${element.name}`)
        return null
    }
  }

  while (position < elements.length) {
    const element = elements[position]!
    if (element.kind === 'command' && element.name === 'or') {
      position += 1
      joins_previous = groups.length > 0
      continue
    }
    const query = read_element()
    if (!query) continue
    if (joins_previous) groups[groups.length - 1]!.push(query)
    else groups.push([query])
    joins_previous = false
  }

  return { query: all_of(groups.map(any_of)), problems }
}

// ============================================================================
// Syntax
// ============================================================================

export const GTG_SYNTAX: Syntax = {
  id: 'gtg',
  name: 'GTG',
  summary: 'The Quick Add entry and search of Getting Things GNOME: @tags in the title, key:value for dates and repeats, and !commands to search.',
  quick_add_examples: [
    { text: 'Buy paper for the @Home office tags:Errands due:friday', meaning: 'Tagged Home and Errands, due Friday; "@Home" stays in the title' },
    { text: 'Write the report start:tomorrow due:next-week', meaning: 'Starts tomorrow and is due in a week' },
    { text: 'Pay my taxes every:year', meaning: 'Repeats yearly from today' },
    { text: 'Walk the dog every:day start:tomorrow', meaning: 'Repeats daily from tomorrow' }
  ],
  search_examples: [
    { text: '!today !or !tomorrow', meaning: 'Due today or tomorrow' },
    { text: '@Career @Finances', meaning: 'Tagged both Career and Finances' },
    { text: '@Career !before 2026-12-01', meaning: 'Career tasks due before December 1st' },
    { text: 'buy !not @Errands', meaning: '"buy" in the title or notes, and not tagged Errands' },
    { text: '!notag', meaning: 'Tasks with no tags' }
  ],
  parse_quick_add,
  parse_search
}
