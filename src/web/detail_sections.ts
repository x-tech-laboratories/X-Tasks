import type { TagGroup } from '@shared/tasks'
import { ordered_columns } from '@x-tech-laboratories/x-libs/web/tables'

// ============================================================================
// Task detail sections
// ============================================================================

// A section of a task's details: one of the fixed ones, or "group:" and a filter group's id for that group's tags.
export type TaskDetailSection = 'my_day' | 'parent' | 'start' | 'duration' | 'due' | 'done' | 'reschedule' | 'repeat' | 'reminders' | 'relationships' | 'streak' | 'time' | 'notes' | `group:${string}`

const SECTION_NAMES: Record<string, string> = {
  my_day: 'My Day',
  parent: 'Parent',
  start: 'Start',
  duration: 'Duration',
  due: 'Due',
  done: 'Done',
  reschedule: 'Reschedule',
  repeat: 'Repeat',
  reminders: 'Reminders',
  relationships: 'Relationships',
  streak: 'Streak',
  time: 'Time spent',
  notes: 'Notes'
}

// Every section in its default order, with the tag groups just after My Day and the parent after them.
export function all_detail_sections(tag_groups: TagGroup[]): TaskDetailSection[] {
  const group_sections = tag_groups.map((group): TaskDetailSection => `group:${group.id}`)
  return ['my_day', ...group_sections, 'parent', 'start', 'duration', 'due', 'done', 'reschedule', 'repeat', 'reminders', 'relationships', 'streak', 'time', 'notes']
}

// Every section in its saved order, leaving out ones gone since and placing a new one just after the section before it.
export function ordered_detail_sections(saved_order: string[], tag_groups: TagGroup[]): TaskDetailSection[] {
  return ordered_columns(saved_order, all_detail_sections(tag_groups)) as TaskDetailSection[]
}

export function detail_section_name(section: TaskDetailSection, tag_groups: TagGroup[]): string {
  if (!section.startsWith('group:')) return SECTION_NAMES[section]!
  return tag_groups.find((group) => `group:${group.id}` === section)?.name ?? 'Removed group'
}
