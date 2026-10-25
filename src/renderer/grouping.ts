import type { TaskGrouping } from '@shared/settings'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import type { TaskGroup } from './dates'
import { tags_in_sidebar_order } from './table'
import { tag_path, with_icon, type TaskNode } from './views'

// ============================================================================
// Grouping choices
// ============================================================================

// The groupings the task list offers: none, the date, and each filter group.
export function grouping_choices(tag_groups: TagGroup[]): { value: TaskGrouping; label: string }[] {
  return [
    { value: 'none', label: 'Ungrouped' },
    { value: 'date', label: 'By date' },
    ...tag_groups.map((group) => ({ value: `group:${group.id}` as const, label: `By ${group.name}` }))
  ]
}

// The filter group the list is grouped by, or null when it goes by date, by nothing, or by a group since removed.
export function grouping_tag_group(grouping: TaskGrouping, tag_groups: TagGroup[]): TagGroup | null {
  return tag_groups.find((group) => grouping === `group:${group.id}`) ?? null
}

// ============================================================================
// Tag groups
// ============================================================================

// Puts each top task under every tag it has from the group, in sidebar order, with tasks holding none of them last.
export function group_by_tag(nodes: TaskNode[], tag_group: TagGroup, tags: Tag[], tags_of: (task: Task) => Tag[]): TaskGroup[] {
  const group_tags = tags_in_sidebar_order(tags.filter((tag) => tag.group_id === tag_group.id))
  const groups = group_tags.map((tag): TaskGroup => ({ key: tag.id, label: with_icon(tag, tag_path(tag, tags)), nodes: [], repeats: [] }))
  const untagged: TaskGroup = { key: 'none', label: `No ${tag_group.name}`, nodes: [], repeats: [] }

  for (const node of nodes) {
    const tag_ids = new Set(tags_of(node.task).map((tag) => tag.id))
    const held = groups.filter((group) => tag_ids.has(group.key))
    for (const group of held.length > 0 ? held : [untagged]) group.nodes.push(node)
  }

  return [...groups, untagged].filter((group) => group.nodes.length > 0)
}
