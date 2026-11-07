import type { Settings, TaskLayout, ViewLayout } from '@shared/settings'
import type { View } from '@shared/tasks'
import { view_key } from './grouping'

// ============================================================================
// Choices
// ============================================================================

export const TASK_LAYOUT_CHOICES: { value: TaskLayout; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'board', label: 'Board' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'gantt', label: 'Gantt' }
]

// ============================================================================
// Layouts per view
// ============================================================================

export function default_layout(settings: Settings): ViewLayout {
  return { layout: settings.task_layout, calendar_span: settings.calendar_span, gantt_scale: settings.gantt_scale }
}

export function is_same_layout(first: ViewLayout, second: ViewLayout): boolean {
  return first.layout === second.layout && first.calendar_span === second.calendar_span && first.gantt_scale === second.gantt_scale
}

// The layout saved for a view, or the default when it has none or every view shares one.
export function saved_layout(settings: Settings, view: View): ViewLayout {
  if (settings.layout_memory === 'shared') return default_layout(settings)
  return settings.view_layouts[view_key(view)] ?? default_layout(settings)
}

// The saved layouts with this view's set to the one given, leaving it out when that matches the default.
export function with_view_layout(settings: Settings, view: View, layout: ViewLayout): Record<string, ViewLayout> {
  const { [view_key(view)]: _, ...others } = settings.view_layouts
  return is_same_layout(layout, default_layout(settings)) ? others : { ...others, [view_key(view)]: layout }
}
