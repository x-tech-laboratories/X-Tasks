import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { CommitInput, Select, Switch } from '@x-tech-laboratories/x-libs/web/react/controls'
import { PageHeading, Section, Stack } from '@x-tech-laboratories/x-libs/web/react/layout'
import { open_context_menu } from '@x-tech-laboratories/x-libs/web/react/menus'

import { REPORT_DAYS_RANGE, type ReportWidget, type ReportWidgetKind } from '@shared/settings'
import { parse_local } from '@x-tech-laboratories/x-libs/dates'
import type { Completion, Tag, TagGroup, Task } from '@shared/tasks'
import { StreakStrip } from './StreakStrip'
import {
  day_offset, first_report_day, streak_rows, tasks_for_widget, ticks_per_day, ticks_per_tag, ticks_per_week, week_start_of
} from './reports'
import { tag_color_style, tag_path, with_icon } from './views'

// ============================================================================
// Choices
// ============================================================================

const WIDGET_KINDS: { kind: ReportWidgetKind; label: string; days: number }[] = [
  { kind: 'streaks', label: 'Routine streaks', days: 30 },
  { kind: 'calendar', label: 'Ticks per day', days: 182 },
  { kind: 'weekly', label: 'Ticks per week', days: 84 },
  { kind: 'by_tag', label: 'Ticks by tag', days: 30 }
]

// The calendar shades a day by how its ticks compare with the busiest day shown.
const CALENDAR_LEVELS = 4

function short_day(day: string): string {
  return parse_local(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// ============================================================================
// Reports page
// ============================================================================

interface ReportsPageProps {
  widgets: ReportWidget[]
  tasks: Task[]
  completions: Completion[]
  tags: Tag[]
  tag_groups: TagGroup[]
  today: string
  on_change_widgets: (widgets: ReportWidget[]) => void
  on_select_task: (task: Task) => void
}

export function ReportsPage({ widgets, tasks, completions, tags, tag_groups, today, on_change_widgets, on_select_task }: ReportsPageProps) {
  const [editing_id, set_editing_id] = useState<string | null>(null)

  function add_widget(kind: ReportWidgetKind): void {
    const choice = WIDGET_KINDS.find((each) => each.kind === kind)!
    const widget: ReportWidget = { id: crypto.randomUUID(), kind, title: choice.label, tag_ids: [], days: choice.days, group_id: tag_groups[0]?.id ?? '' }
    on_change_widgets([...widgets, widget])
    set_editing_id(widget.id)
  }

  function update_widget(widget: ReportWidget): void {
    on_change_widgets(widgets.map((each) => (each.id === widget.id ? widget : each)))
  }

  function move_widget(widget: ReportWidget, offset: number): void {
    const moved = widgets.filter((each) => each.id !== widget.id)
    moved.splice(widgets.indexOf(widget) + offset, 0, widget)
    on_change_widgets(moved)
  }

  function open_widget_menu(event: ReactMouseEvent, widget: ReportWidget, index: number): void {
    open_context_menu(event, [
      { label: 'Edit…', run: () => set_editing_id(widget.id) },
      ...(index > 0 ? [{ label: 'Move up', run: () => move_widget(widget, -1) }] : []),
      ...(index < widgets.length - 1 ? [{ label: 'Move down', run: () => move_widget(widget, 1) }] : []),
      { label: 'Remove', danger: true, run: () => on_change_widgets(widgets.filter((each) => each.id !== widget.id)) }
    ])
  }

  return (
    <>
      <PageHeading
        title="Reports"
        actions={
          <button onClick={(event) => open_context_menu(event, WIDGET_KINDS.map(({ kind, label }) => ({ label, run: () => add_widget(kind) })))}>
            Add card
          </button>
        }
      />

      {widgets.length === 0 && <p className="empty">No cards yet. Add one to see your streaks and ticks.</p>}

      <Stack>
        {widgets.map((widget, index) => {
          const widget_tasks = tasks_for_widget(widget, tasks, tags)
          const filter_names = widget.tag_ids.flatMap((tag_id) => tags.find((tag) => tag.id === tag_id)?.name ?? [])
          const tools = (
            <>
              <span className="report_card_caption">
                Last {plural(widget.days, 'day')}
                {filter_names.length > 0 && ` · ${filter_names.join(', ')}`}
              </span>
              <button className="icon" onClick={(event) => open_widget_menu(event, widget, index)} aria-label={`Options for ${widget.title}`}>
                ⋯
              </button>
            </>
          )

          return (
            <div key={widget.id} onContextMenu={(event) => open_widget_menu(event, widget, index)}>
              <Section title={widget.title} tools={tools} class_name="report_card">
                {editing_id === widget.id && (
                  <WidgetEditor widget={widget} tags={tags} tag_groups={tag_groups} on_change={update_widget} on_close={() => set_editing_id(null)} />
                )}

                {widget.kind === 'streaks' && (
                  <StreakTable widget={widget} widget_tasks={widget_tasks} completions={completions} tasks={tasks} today={today} on_select_task={on_select_task} />
                )}
                {widget.kind === 'calendar' && <TickCalendar widget={widget} counts={ticks_per_day(widget, widget_tasks, completions, today)} today={today} />}
                {widget.kind === 'weekly' && <WeeklyBars weeks={ticks_per_week(widget, widget_tasks, completions, today)} />}
                {widget.kind === 'by_tag' && (
                  <TagBars rows={ticks_per_tag(widget, widget_tasks, completions, tasks, tags, today)} tags={tags} group={tag_groups.find((group) => group.id === widget.group_id)} />
                )}
              </Section>
            </div>
          )
        })}
      </Stack>
    </>
  )
}

// ============================================================================
// Editor
// ============================================================================

interface WidgetEditorProps {
  widget: ReportWidget
  tags: Tag[]
  tag_groups: TagGroup[]
  on_change: (widget: ReportWidget) => void
  on_close: () => void
}

function WidgetEditor({ widget, tags, tag_groups, on_change, on_close }: WidgetEditorProps) {
  const chosen_tags = widget.tag_ids.flatMap((tag_id) => tags.find((tag) => tag.id === tag_id) ?? [])

  function set_days(text: string): void {
    const days = Math.round(Number(text))
    if (Number.isFinite(days)) on_change({ ...widget, days: Math.min(REPORT_DAYS_RANGE.max, Math.max(REPORT_DAYS_RANGE.min, days)) })
  }

  return (
    <div className="report_editor">
      <label className="field">
        <span className="field-label">Title</span>
        <CommitInput value={widget.title} on_commit={(event) => on_change({ ...widget, title: event.currentTarget.value.trim() || widget.title })} />
      </label>

      <label className="field">
        <span className="field-label">Days</span>
        <CommitInput type="number" min={REPORT_DAYS_RANGE.min} max={REPORT_DAYS_RANGE.max} value={widget.days} on_commit={(event) => set_days(event.currentTarget.value)} />
      </label>

      {widget.kind === 'streaks' && (
        <label className="check report_editor_check">
          <Switch label="Show subtasks under each routine" checked={!widget.hide_subtasks} on_change={(on) => on_change({ ...widget, hide_subtasks: !on })} />
          Show subtasks under each routine
        </label>
      )}

      {widget.kind === 'by_tag' && (
        <Select
          label="Split by"
          options={tag_groups.map((group): [string, string] => [group.id, group.name])}
          value={widget.group_id}
          on_change={(group_id) => on_change({ ...widget, group_id })}
        />
      )}

      <div className="field report_editor_tags">
        <span className="field-label">Only tasks tagged</span>
        {chosen_tags.length > 0 && (
          <div className="tag_chips">
            {chosen_tags.map((tag) => (
              <span key={tag.id} className="tag_chip">
                {tag_path(tag, tags)}
                <button onClick={() => on_change({ ...widget, tag_ids: widget.tag_ids.filter((tag_id) => tag_id !== tag.id) })} aria-label={`Remove tag ${tag.name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <select value="" onChange={(event) => event.currentTarget.value && on_change({ ...widget, tag_ids: [...widget.tag_ids, event.currentTarget.value] })} aria-label="Add tag">
          <option value="">{chosen_tags.length > 0 ? 'Add another tag…' : 'Any task'}</option>
          {tag_groups.map((group) => (
            <optgroup key={group.id} label={group.name}>
              {tags
                .filter((tag) => tag.group_id === group.id && !widget.tag_ids.includes(tag.id))
                .map((tag) => <option key={tag.id} value={tag.id}>{tag_path(tag, tags)}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <button className="report_editor_done" onClick={on_close}>Done</button>
    </div>
  )
}

// ============================================================================
// Routine streaks
// ============================================================================

interface StreakTableProps {
  widget: ReportWidget
  widget_tasks: Task[]
  completions: Completion[]
  tasks: Task[]
  today: string
  on_select_task: (task: Task) => void
}

// A subtask's streak and share count the routine's ticks it was done in, so the ones often left undone stand out.
function StreakTable({ widget, widget_tasks, completions, tasks, today, on_select_task }: StreakTableProps) {
  const rows = streak_rows(widget, widget_tasks, completions, tasks, today)
  if (rows.length === 0) return <p className="report_empty">No repeating tasks here.</p>

  return (
    <table className="report_table">
      <thead>
        <tr>
          <th>Routine</th>
          <th className="report_strip_cell">Recent</th>
          <th className="is_number">Streak</th>
          <th className="is_number">Best</th>
          <th className="is_number" title="Routines: share of occurrences done on time. Subtasks: share of the routine's ticks they were done in.">
            Done
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ task, depth, streak, record, history }) => (
          <tr key={task.id} className={depth > 0 ? 'is_subtask' : ''}>
            <td style={{ '--depth': depth } as CSSProperties}>
              <button className="report_task_link" onClick={() => on_select_task(task)}>{task.title}</button>
            </td>
            <td className="report_strip_cell">
              <StreakStrip history={history} limit={14} />
            </td>
            <td className="is_number">{streak.current > 0 ? <span className="streak_badge">🔥 {streak.current}</span> : '0'}</td>
            <td className="is_number">{streak.best}</td>
            <td className="is_number" title={depth > 0 ? `Done in ${record.on_time} of the routine's ${record.due} ticks` : `${record.on_time} of ${record.due} done on time`}>
              {record.due > 0 ? `${Math.round((record.on_time / record.due) * 100)}%` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ============================================================================
// Ticks per day
// ============================================================================

interface TickCalendarProps {
  widget: ReportWidget
  counts: Map<string, number>
  today: string
}

// One column per week, Monday at the top, shaded deeper the more ticks a day had.
function TickCalendar({ widget, counts, today }: TickCalendarProps) {
  const first_day = first_report_day(widget, today)
  const busiest = Math.max(1, ...counts.values())
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  const weeks: string[] = []
  for (let week = week_start_of(first_day); week <= today; week = day_offset(week, 7)) weeks.push(week)

  return (
    <div className="report_calendar_scroll">
      <div className="report_calendar" style={{ '--week-count': weeks.length } as CSSProperties}>
        {weeks.map((week) => {
          const month_starts = week === weeks[0] || parse_local(day_offset(week, -7)).getMonth() !== parse_local(week).getMonth()
          return (
            <span key={`month-${week}`} className="report_calendar_month">
              {month_starts ? parse_local(week).toLocaleDateString(undefined, { month: 'short' }) : ''}
            </span>
          )
        })}
        {[0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
          weeks.map((week) => {
            const day = day_offset(week, weekday)
            if (day < first_day || day > today) return <span key={day} className="report_calendar_day is_outside" />
            const count = counts.get(day) ?? 0
            const level = count === 0 ? 0 : Math.ceil((count / busiest) * CALENDAR_LEVELS)
            return <span key={day} className={`report_calendar_day level_${level}`} title={`${plural(count, 'tick')} on ${short_day(day)}`} />
          })
        )}
      </div>
      <p className="report_card_caption">{plural(total, 'tick')} in all</p>
    </div>
  )
}

// ============================================================================
// Ticks per week
// ============================================================================

function WeeklyBars({ weeks }: { weeks: { week: string; count: number }[] }) {
  const busiest = Math.max(1, ...weeks.map(({ count }) => count))
  const latest = weeks.at(-1)

  return (
    <div className="report_weeks">
      <div className="report_week_bars">
        {weeks.map(({ week, count }) => (
          <span key={week} className="report_week" title={`${plural(count, 'tick')} in the week of ${short_day(week)}`}>
            <span className="report_week_bar" style={{ height: `${(count / busiest) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="report_week_axis">
        <span>{weeks[0] && short_day(weeks[0].week)}</span>
        <span>{latest && `This week: ${plural(latest.count, 'tick')}`}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Ticks by tag
// ============================================================================

interface TagBarsProps {
  rows: { tag: Tag | null; count: number }[]
  tags: Tag[]
  group: TagGroup | undefined
}

function TagBars({ rows, tags, group }: TagBarsProps) {
  if (!group) return <p className="report_empty">Pick a tag group to split by.</p>
  if (rows.length === 0) return <p className="report_empty">No ticks in these days.</p>
  const busiest = Math.max(...rows.map(({ count }) => count))

  return (
    <div className="report_tag_bars">
      {rows.map(({ tag, count }) => (
        <div key={tag?.id ?? 'none'} className="report_tag_row">
          <span className="report_tag_name">{tag ? with_icon(tag, tag_path(tag, tags)) : `No ${group.name.toLowerCase()}`}</span>
          <span className="report_tag_track">
            <span className="report_tag_bar" style={{ ...(tag && tag_color_style(tag)), width: `${(count / busiest) * 100}%` }} />
          </span>
          <span className="report_tag_count">{count}</span>
        </div>
      ))}
    </div>
  )
}
