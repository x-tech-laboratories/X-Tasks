import type { Tag, TagGroup, Task } from '../src/shared/tasks.ts'

// ============================================================================
// Builders
// ============================================================================

export function make_task(fields: Partial<Task> & { id: string }): Task {
  return {
    title: fields.id,
    notes: '',
    is_done: false,
    done_at: null,
    start_at: null,
    due_at: null,
    recurrence: '',
    are_dates_linked: true,
    my_day_on: null,
    created_at: '2026-01-01T00:00:00.000Z',
    parent_id: null,
    position: 0,
    tag_ids: [],
    links: [],
    ...fields
  }
}

export function make_tag(fields: Partial<Tag> & { id: string; group_id: string }): Tag {
  return {
    name: fields.id,
    created_at: '2026-01-01T00:00:00.000Z',
    parent_id: null,
    position: 0,
    rule: null,
    color: null,
    icon: null,
    shows_on_rows: true,
    ...fields
  }
}

export function make_group(fields: Partial<TagGroup> & { id: string }): TagGroup {
  return {
    name: fields.id,
    created_at: '2026-01-01T00:00:00.000Z',
    position: 0,
    is_single_choice: false,
    is_rule: false,
    ...fields
  }
}
