import type { Settings, TaskGrouping } from '@shared/settings'
import type { Tag, TagGroup, Task, View } from '@shared/tasks'
import type { TaskGroup } from './dates'
import { in_tree_order } from '@x-tech-laboratories/x-libs/web/tree'
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
// Groupings per view
// ============================================================================

// Names a view for its saved grouping, with a tag selection named by its tags in any order.
export function view_key(view: View): string {
  return view.kind === 'tag' ? `tag:${[...view.tag_ids].sort().join(',')}` : view.kind
}

// The view a saved grouping belongs to.
export function view_of_key(key: string): View {
  return key.startsWith('tag:') ? { kind: 'tag', tag_ids: key.slice(4).split(',') } : ({ kind: key } as View)
}

// The grouping saved for a view, or the default when it has none or every view shares one.
export function saved_grouping(settings: Settings, view: View): TaskGrouping {
  if (settings.grouping_memory === 'shared') return settings.task_grouping
  return settings.view_groupings[view_key(view)] ?? settings.task_grouping
}

// The saved groupings with this view's set to the one given, leaving it out when that matches the default.
export function with_view_grouping(settings: Settings, view: View, grouping: TaskGrouping): Record<string, TaskGrouping> {
  const { [view_key(view)]: _, ...others } = settings.view_groupings
  return grouping === settings.task_grouping ? others : { ...others, [view_key(view)]: grouping }
}

// ============================================================================
// Tag groups
// ============================================================================

// Puts each top task under every tag it has from the group, in sidebar order, with tasks holding none of them last.
export function group_by_tag(nodes: TaskNode[], tag_group: TagGroup, tags: Tag[], tags_of: (task: Task) => Tag[]): TaskGroup[] {
  const group_tags = in_tree_order(tags.filter((tag) => tag.group_id === tag_group.id))
  const groups = group_tags.map((tag): TaskGroup => ({ key: tag.id, label: with_icon(tag, tag_path(tag, tags)), nodes: [], repeats: [], drop_day: null }))
  const untagged: TaskGroup = { key: 'none', label: `No ${tag_group.name}`, nodes: [], repeats: [], drop_day: null }

  for (const node of nodes) {
    const tag_ids = new Set(tags_of(node.task).map((tag) => tag.id))
    const held = groups.filter((group) => tag_ids.has(group.key))
    for (const group of held.length > 0 ? held : [untagged]) group.nodes.push(node)
  }

  return [...groups, untagged].filter((group) => group.nodes.length > 0)
}
