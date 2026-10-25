import { empty_quick_add, finished_quick_add, words_query } from './building'
import type { Syntax } from './types'

// ============================================================================
// Plain
// ============================================================================

// Reads nothing special: the whole text is the new task's title, and a search finds it in titles and notes.
export const PLAIN_SYNTAX: Syntax = {
  id: 'plain',
  name: 'Plain',
  summary: 'The text is the task title as typed, and a search finds the text in titles and notes.',
  quick_add_examples: [{ text: 'Call the bank about the card', meaning: 'Adds a task with exactly that title' }],
  search_examples: [{ text: 'bank card', meaning: 'Tasks whose title or notes contain "bank card"' }],
  parse_quick_add: (text, context) => finished_quick_add(empty_quick_add(), text, null, context),
  parse_search: (text) => ({ query: words_query(text), problems: [] })
}
