import type { SyntaxId } from '@shared/settings'
import { GTG_SYNTAX } from './gtg'
import { PLAIN_SYNTAX } from './plain'
import { TODOIST_SYNTAX } from './todoist'
import { TRILIUM_SYNTAX } from './trilium'
import type { Syntax } from './types'

// ============================================================================
// Syntaxes
// ============================================================================

// Every syntax the multibar can read, in the order they are offered.
export const SYNTAXES: Syntax[] = [PLAIN_SYNTAX, TODOIST_SYNTAX, GTG_SYNTAX, TRILIUM_SYNTAX]

// A setting saved by a newer version can name a syntax this one lacks, which reads as Plain.
export function syntax_by_id(id: SyntaxId): Syntax {
  return SYNTAXES.find((syntax) => syntax.id === id) ?? PLAIN_SYNTAX
}

export { query_matches } from './matching'
export type { QuickAdd, Search, SearchContext, SearchQuery, Syntax, SyntaxContext, SyntaxExample } from './types'
