import { Calendar, type EventChangeInfo, type EventInput } from 'fullcalendar'
import day_grid_plugin from 'fullcalendar/daygrid'
import interaction_plugin from 'fullcalendar/interaction'
import classic_theme_plugin from 'fullcalendar/themes/classic'
import time_grid_plugin from 'fullcalendar/timegrid'
import 'fullcalendar/skeleton.css'
import 'fullcalendar/themes/classic/theme.css'
import 'fullcalendar/themes/classic/palette.css'
import { useEffect, useRef, useState } from 'react'

import { Segmented } from '@x-tech-laboratories/x-libs/web/react/controls'
import type { CalendarSpan, TaskDateField } from '@shared/settings'
import { days_between, format_task_date, has_time } from '@shared/schedule'
import type { Tag, Task, TaskSchedule } from '@shared/tasks'
import { coming_repeats } from './dates'
import { day_after, day_span_schedule, shifted_schedule, task_span, timed_schedule } from './timeline'

// ============================================================================
// Calendar view
// ============================================================================

const VIEW_BY_SPAN: Record<CalendarSpan, string> = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay' }

const SPAN_CHOICES: { value: CalendarSpan; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' }
]

// Later dates of repeating tasks are drawn this far ahead at most, however far the calendar is paged.
const MOST_REPEAT_DAYS = 400

interface CalendarViewProps {
  tasks: Task[]
  tags_of: (task: Task) => Tag[]
  date_field: TaskDateField
  now: string
  span: CalendarSpan
  slot_minutes: number
  slot_label_minutes: number
  selected_task_id: string | null
  on_change_span: (span: CalendarSpan) => void
  on_select: (task: Task) => void
  on_set_schedule: (task: Task, schedule: TaskSchedule) => void
}

// Every dated task shows from its start to its due date; dragging moves it and pulling an edge changes how long it runs.
export function CalendarView(props: CalendarViewProps) {
  const element = useRef<HTMLDivElement>(null)
  const calendar = useRef<Calendar | null>(null)
  // The calendar keeps the callbacks it was made with, so they read the latest props through this.
  const latest = useRef(props)
  latest.current = props
  const [last_shown_day, set_last_shown_day] = useState(props.now.slice(0, 10))
  const [title, set_title] = useState('')

  useEffect(() => {
    const created = new Calendar(element.current!, {
      plugins: [day_grid_plugin, time_grid_plugin, interaction_plugin, classic_theme_plugin],
      initialView: VIEW_BY_SPAN[props.span],
      // The calendar's own toolbar is left off for one built from the app's buttons below.
      headerToolbar: false,
      height: '100%',
      slotDuration: { minutes: props.slot_minutes },
      slotHeaderInterval: { minutes: props.slot_label_minutes },
      editable: true,
      nowIndicator: true,
      dayMaxEvents: true,
      eventClick: (info) => {
        const task = latest.current.tasks.find((each) => each.id === info.event.extendedProps['task_id'])
        if (task) latest.current.on_select(task)
      },
      eventChange: (info) => move_task(info),
      // Paging or switching span saves the span and draws repeats out to the last day on screen.
      datesSet: (info) => {
        const span = (Object.keys(VIEW_BY_SPAN) as CalendarSpan[]).find((each) => VIEW_BY_SPAN[each] === info.view.type)
        if (span && span !== latest.current.span) latest.current.on_change_span(span)
        set_last_shown_day(format_task_date(info.end, false))
        set_title(info.view.title)
      }
    })
    created.render()
    calendar.current = created
    return () => created.destroy()
  }, [])

  // A drop can land a day or a time; a timed slot gives the task clock times, and a day cell keeps the ones it had.
  function move_task(info: EventChangeInfo): void {
    const task = latest.current.tasks.find((each) => each.id === info.event.extendedProps['task_id'])
    const { event, oldEvent: old_event } = info
    if (!task || !event.start) return info.revert()

    if (!event.allDay) return latest.current.on_set_schedule(task, timed_schedule(task, event.start, event.end))
    const last_day = event.end ? new Date(event.end.getFullYear(), event.end.getMonth(), event.end.getDate() - 1) : event.start
    const is_same_length = old_event.allDay && old_event.start && days_between(old_event.start, old_event.end ?? old_event.start) === days_between(event.start, event.end ?? event.start)
    const schedule = is_same_length ? shifted_schedule(task, days_between(old_event.start!, event.start)) : day_span_schedule(task, event.start, last_day)
    latest.current.on_set_schedule(task, schedule)
  }

  useEffect(() => {
    calendar.current?.setOption('slotDuration', { minutes: props.slot_minutes })
    calendar.current?.setOption('slotHeaderInterval', { minutes: props.slot_label_minutes })
  }, [props.slot_minutes, props.slot_label_minutes])

  useEffect(() => {
    if (calendar.current && calendar.current.view.type !== VIEW_BY_SPAN[props.span]) calendar.current.changeView(VIEW_BY_SPAN[props.span])
  }, [props.span])

  useEffect(() => {
    const repeat_days = Math.min(MOST_REPEAT_DAYS, days_between(new Date(), new Date(`${last_shown_day}T00:00`)))
    const repeats = coming_repeats(props.tasks, props.date_field, props.now, repeat_days)
    const events = [
      ...props.tasks.flatMap((task) => task_event(task, props.tags_of(task), props.selected_task_id)),
      ...repeats.map((repeat) => ({ ...task_event({ ...repeat.task, start_at: null, due_at: repeat.task_date }, props.tags_of(repeat.task), null)[0], id: `${repeat.task.id}@${repeat.task_date}`, editable: false, className: 'calendar_repeat' }))
    ]
    calendar.current?.setOption('events', events)
  }, [props.tasks, props.selected_task_id, props.now, last_shown_day])

  return (
    <div className="calendar_view">
      <div className="calendar_toolbar">
        <button onClick={() => calendar.current?.prev()} aria-label="Previous" title="Previous">
          ‹
        </button>
        <button onClick={() => calendar.current?.today()}>Today</button>
        <button onClick={() => calendar.current?.next()} aria-label="Next" title="Next">
          ›
        </button>
        <h2 className="calendar_title">{title}</h2>
        <Segmented label="Calendar span" choices={SPAN_CHOICES} value={props.span} on_change={props.on_change_span} />
      </div>
      <div className="calendar_grid" ref={element} />
    </div>
  )
}

// A task covering whole days fills them; one with a clock time sits at that time.
function task_event(task: Task, tags: Tag[], selected_task_id: string | null): EventInput[] {
  const span = task_span(task)
  if (!span) return []
  const is_all_day = !has_time(span.start) && !has_time(span.end)
  const is_single = span.start === span.end
  const class_names = [task.is_done ? 'is_done' : '', task.id === selected_task_id ? 'is_selected' : ''].filter(Boolean).join(' ')

  return [{
    id: task.id,
    title: task.title,
    start: span.start,
    end: is_single ? undefined : is_all_day ? day_after(span.end) : span.end,
    allDay: is_all_day,
    color: tags.find((tag) => tag.color)?.color ?? undefined,
    className: class_names,
    task_id: task.id
  }]
}
