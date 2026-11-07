import Gantt, { type GanttTask } from 'frappe-gantt'
import './gantt.css'
import { useEffect, useRef } from 'preact/hooks'

import type { GanttScale } from '@shared/settings'
import { days_between, parse_task_date } from '@shared/schedule'
import type { Task, TaskSchedule } from '@shared/tasks'
import { day_span_schedule, shifted_schedule, task_span } from './timeline'

// ============================================================================
// Gantt view
// ============================================================================

export const GANTT_SCALE_CHOICES: { value: GanttScale; label: string; mode: string }[] = [
  { value: 'day', label: 'Days', mode: 'Day' },
  { value: 'week', label: 'Weeks', mode: 'Week' },
  { value: 'month', label: 'Months', mode: 'Month' }
]

function mode_of(scale: GanttScale): string {
  return GANTT_SCALE_CHOICES.find((choice) => choice.value === scale)!.mode
}

interface GanttViewProps {
  // The rows on screen from top to bottom; those without dates are left off the chart.
  rows: Task[]
  // The ids of the tasks each task waits on, by task id.
  waits_on: Map<string, string[]>
  scale: GanttScale
  selected_task_id: string | null
  on_change_scale: (scale: GanttScale) => void
  on_select: (task: Task) => void
  on_set_schedule: (task: Task, schedule: TaskSchedule) => void
}

// A bar runs from each task's start to its due date, with arrows from the tasks it waits on; dragging a bar or its ends reschedules it.
export function GanttView(props: GanttViewProps) {
  const element = useRef<HTMLDivElement>(null)
  const gantt = useRef<Gantt | null>(null)
  // The scale the chart is drawn at, so switching back to it is not drawn twice.
  const drawn_scale = useRef(props.scale)
  // The chart keeps the callbacks it was made with, so they read the latest props through this.
  const latest = useRef(props)
  latest.current = props

  const bars = gantt_tasks(props.rows, props.waits_on, props.selected_task_id)
  const bars_key = JSON.stringify(bars)

  useEffect(() => {
    if (bars.length === 0) {
      gantt.current = null
      return
    }
    // Redrawing scrolls back to today, so an edit keeps the chart where it was instead.
    if (gantt.current) {
      const container = element.current!.querySelector('.gantt-container')
      const scroll_left = container?.scrollLeft ?? 0
      gantt.current.refresh(bars)
      if (container) container.scrollLeft = scroll_left
      return
    }

    element.current!.replaceChildren()
    drawn_scale.current = props.scale
    gantt.current = new Gantt(element.current!, bars, {
      view_mode: mode_of(props.scale),
      today_button: true,
      readonly_progress: true,
      popup: false,
      bar_height: 24,
      padding: 14,
      on_click: (bar) => {
        const task = latest.current.rows.find((each) => each.id === bar.id)
        if (task) latest.current.on_select(task)
      },
      on_date_change: (bar, start, end) => {
        const task = latest.current.rows.find((each) => each.id === bar.id)
        if (task) latest.current.on_set_schedule(task, moved_schedule(task, start, end))
      },
      on_view_change: (mode) => {
        const scale = GANTT_SCALE_CHOICES.find((choice) => choice.mode === mode.name)?.value
        if (scale && scale !== latest.current.scale) latest.current.on_change_scale(scale)
      }
    })
  }, [bars_key])

  useEffect(() => {
    if (!gantt.current || drawn_scale.current === props.scale) return
    drawn_scale.current = props.scale
    gantt.current.change_view_mode(mode_of(props.scale), true)
  }, [props.scale])

  if (bars.length === 0) return <p class="empty_message">No tasks here have a start or due date to chart.</p>
  return <div class="gantt_view" ref={element} />
}

// A dated task becomes a bar, and only the tasks it waits on that are also charted get arrows.
function gantt_tasks(rows: Task[], waits_on: Map<string, string[]>, selected_task_id: string | null): GanttTask[] {
  const charted = rows.filter((task) => task_span(task) !== null)
  const charted_ids = new Set(charted.map((task) => task.id))

  return charted.map((task) => {
    const span = task_span(task)!
    return {
      id: task.id,
      name: escape_html(task.title),
      start: span.start.replace('T', ' '),
      end: span.end.replace('T', ' '),
      progress: task.is_done ? 100 : 0,
      dependencies: (waits_on.get(task.id) ?? []).filter((id) => charted_ids.has(id)).join(','),
      custom_class: task.id === selected_task_id ? 'is_selected' : task.is_done ? 'is_done' : ''
    }
  })
}

// A bar dragged whole keeps its length and moves every date by the same days; pulling one end changes how long it runs.
function moved_schedule(task: Task, start: Date, end: Date): TaskSchedule {
  const span = task_span(task)!
  const old_start = parse_task_date(span.start)
  const is_same_length = days_between(old_start, parse_task_date(span.end)) === days_between(start, end)
  return is_same_length ? shifted_schedule(task, days_between(old_start, start)) : day_span_schedule(task, start, end)
}

function escape_html(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
