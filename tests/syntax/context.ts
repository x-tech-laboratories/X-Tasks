import type { SyntaxContext } from '../../src/renderer/syntax/types.ts'
import { make_group, make_tag } from '../fixtures.ts'

// ============================================================================
// Shared context
// ============================================================================

// A Wednesday morning, so weekday words land on known days.
export const NOW = new Date(2026, 2, 11, 10, 0)

export const TAG_GROUPS = [make_group({ id: 'area', name: 'Area', position: 1 }), make_group({ id: 'priority', name: 'Priority', position: 2, is_single_choice: true })]

export const TAGS = [
  make_tag({ id: 'work', name: 'Work', group_id: 'area', position: 1 }),
  make_tag({ id: 'clients', name: 'Clients', group_id: 'area', parent_id: 'work', position: 1 }),
  make_tag({ id: 'home', name: 'Home', group_id: 'area', position: 2 }),
  make_tag({ id: 'errands', name: 'Errands', group_id: 'area', position: 3 }),
  make_tag({ id: 'high', name: 'High', group_id: 'priority', position: 1 }),
  make_tag({ id: 'medium', name: 'Medium', group_id: 'priority', position: 2 }),
  make_tag({ id: 'low', name: 'Low', group_id: 'priority', position: 3 })
]

export const CONTEXT: SyntaxContext = { tags: TAGS, tag_groups: TAG_GROUPS, date_field: 'due', now: NOW }
