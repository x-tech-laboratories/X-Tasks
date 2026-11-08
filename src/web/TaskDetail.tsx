import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { DateTimeField, TreeSelect } from '@x-tech-laboratories/x-libs/web/react/controls'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { use_shortcuts } from '@x-tech-laboratories/x-libs/web/react/shortcuts'
import type { HistoryMark, RoutineStreak } from '@shared/streaks'
import { can_link, links_of, type SeenLink, type Tag, type TagGroup, type Task, type TaskSchedule } from '@shared/tasks'
import { RecurrencePicker } from './RecurrencePicker'
import { StreakStrip } from './StreakStrip'
import { TagChip } from './TagChip'
import type { TaskDateField, TaskDuration, TaskRelationship } from '@shared/settings'
import { format_local, has_time, parse_local } from '@x-tech-laboratories/x-libs/dates'
import {
  describe_recurrence, due_after, duration_between, duration_label, durations_for_start, moved_alongside, recurrence_anchor, start_before, with_recurrence
} from '@shared/schedule'
import type { TaskDetailSection } from './detail_sections'
import { tag_path } from './views'

// ============================================================================
// Task detail
// ============================================================================

// The Duration choices that are not listed durations.
const UNSET = 'unset'
const CUSTOM = 'custom'

interface TaskDetailProps {
  task: Task
  tag_groups: TagGroup[]
  tags: Tag[]
  date_field: TaskDateField
  // The sections shown, in the order shown.
  sections: TaskDetailSection[]
  subtask_count: number
  // Every task, for picking the ones this task is linked to.
  tasks: Task[]
  relationships: TaskRelationship[]
  // The task gets the relationship to the other, by its inverse name when is_inverse is set.
  on_link: (task: Task, other: Task, relationship_id: string, is_inverse: boolean) => void
  on_unlink: (task: Task, other: Task) => void
  durations: TaskDuration[]
  on_toggle: (task: Task) => void
  on_rename: (task: Task, title: string) => void
  on_set_notes: (task: Task, notes: string) => void
  on_tag: (task: Task, tag: Tag) => void
  on_untag: (task: Task, tag: Tag) => void
  on_set_schedule: (task: Task, schedule: TaskSchedule) => void
  on_set_done_at: (task: Task, done_at: string | null) => void
  streak: RoutineStreak | null
  history: HistoryMark[]
  on_reschedule: (task: Task) => void
  is_in_my_day: boolean
  on_set_my_day: (task: Task, is_added: boolean) => void
  on_remove: (task: Task) => void
  on_show_history: (task: Task) => void
  on_close: () => void
}

export function TaskDetail({
  task, tag_groups, tags, date_field, sections, subtask_count, tasks, relationships, on_link, on_unlink, durations, on_toggle, on_rename, on_set_notes, on_set_schedule, on_set_done_at, on_tag, on_untag, on_reschedule,
  is_in_my_day, on_set_my_day, on_remove, on_show_history, on_close, streak, history
}: TaskDetailProps) {
  const [title_draft, set_title_draft] = useState(task.title)
  const [notes_draft, set_notes_draft] = useState(task.notes)
  const [is_picking_recurrence, set_is_picking_recurrence] = useState(false)
  const schedule: TaskSchedule = { start_at: task.start_at, due_at: task.due_at, recurrence: task.recurrence }

  // Escape closes the panel even from its fields, each of which saves on blur first; a dialog open over it keeps Escape for itself.
  use_shortcuts([{ keys: 'escape', when: 'always', run: on_close }])

  // An emptied title puts the old one back rather than saving a blank task.
  function commit_title(): void {
    const title = title_draft.trim()
    if (!title) set_title_draft(task.title)
    else if (title !== task.title) on_rename(task, title)
  }

  function commit_notes(): void {
    if (notes_draft !== task.notes) on_set_notes(task, notes_draft)
  }

  // The start and due dates move together until Unset is picked, which frees them until a duration or Custom is picked again.
  const is_linked = task.are_dates_linked && task.start_at !== null && task.due_at !== null
  const duration = duration_between(durations, task.start_at, task.due_at)

  // Moving the start moves the due date with it: by the listed duration when one is in force, or else by the same distance.
  function change_start(start_at: string | null): void {
    if (!is_linked || !start_at) return on_set_schedule(task, { ...schedule, start_at })
    const listed_duration = duration && durations_for_start(durations, start_at).includes(duration) ? duration : null
    const due_at = listed_duration ? due_after(start_at, listed_duration) : moved_alongside(task.due_at!, task.start_at!, start_at)
    on_set_schedule(task, { ...schedule, start_at, due_at })
  }

  // And moving the due date moves the start back with it the same way.
  function change_due(due_at: string | null): void {
    if (!is_linked || !due_at) return on_set_schedule(task, { ...schedule, due_at })
    const start_at = (duration && start_before(due_at, duration, has_time(task.start_at!))) ?? moved_alongside(task.start_at!, task.due_at!, due_at)
    on_set_schedule(task, { ...schedule, start_at, due_at })
  }

  // Custom and Unset leave the due date as it is.
  function choose_duration(duration_id: string): void {
    const chosen = durations.find((each) => each.id === duration_id)
    const due_at = chosen && task.start_at ? due_after(task.start_at, chosen) : task.due_at
    on_set_schedule(task, { ...schedule, due_at, are_dates_linked: duration_id !== UNSET })
  }

  // The checkbox, title and close button sit in the top bar above the pane, so they stay put while the pane scrolls.
  const [topbar, set_topbar] = useState<Element | null>(null)
  useEffect(() => set_topbar(document.querySelector('.topbar')), [])
  const header = (
        <header className="task_detail_header">
          <input type="checkbox" checked={task.is_done} onChange={() => on_toggle(task)} aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'} />
          <input
            className="task_detail_title"
            value={title_draft}
            onChange={(event) => set_title_draft(event.currentTarget.value)}
            onBlur={commit_title}
            onKeyDown={(event) => (event.key === 'Enter' || event.key === 'Escape') && event.currentTarget.blur()}
            aria-label="Title"
          />
          <button className="icon remove" onClick={on_close} aria-label="Close details">
            ×
          </button>
        </header>
  )

  // One tag group's tags: a single choice for a one-tag-per-task group, or chips and a picker for adding more.
  function render_group(group: TagGroup): ReactNode {
    // Rule tags apply by themselves, so only plain tags are offered, and a group of nothing but rule tags is left out.
    const group_tags = tags.filter((tag) => tag.group_id === group.id && !tag.rule)
    if (group_tags.length === 0 && tags.some((tag) => tag.group_id === group.id)) return null
    const task_tags = group_tags.filter((tag) => task.tag_ids.includes(tag.id))
    const other_tags = group_tags.filter((tag) => !task.tag_ids.includes(tag.id))
    const tag_by_id = (tag_id: string) => group_tags.find((tag) => tag.id === tag_id)

    // A one-tag-per-task group is a single choice, with None to clear it.
    if (group.is_single_choice && task_tags.length <= 1) {
      const current_tag = task_tags[0]
      return (
        <label className="field">
          <span className="field-label">{group.name}</span>
          <TreeSelect
            label={group.name}
            items={group_tags}
            name_of={(tag) => tag.name}
            value={current_tag?.id ?? ''}
            blank_label="None"
            on_change={(tag_id) => {
              const chosen_tag = tag_by_id(tag_id)
              if (chosen_tag) on_tag(task, chosen_tag)
              else if (current_tag) on_untag(task, current_tag)
            }}
          />
        </label>
      )
    }

    return (
      <div className="field">
        <span className="field-label">{group.name}</span>
        {task_tags.length > 0 && (
          <div className="chips">
            {task_tags.map((tag) => <TagChip key={tag.id} tag={tag} label={tag_path(tag, tags)} on_remove={() => on_untag(task, tag)} />)}
          </div>
        )}
        {other_tags.length > 0 && (
          <TreeSelect
            label={`Add ${group.name} tag`}
            items={group_tags}
            name_of={(tag) => tag.name}
            value=""
            blank_label={`Add ${group.name.toLowerCase()} tag…`}
            disabled_ids={task.tag_ids}
            on_change={(tag_id) => {
              const tag = tag_by_id(tag_id)
              if (tag) on_tag(task, tag)
            }}
          />
        )}
      </div>
    )
  }

  function render_section(section: TaskDetailSection): ReactNode {
    if (section.startsWith('group:')) {
      const group = tag_groups.find((each) => `group:${each.id}` === section)
      return group ? render_group(group) : null
    }
    switch (section) {
      case 'my_day':
        return (
          <button className={cx('my_day_button', is_in_my_day && 'is_selected')} aria-pressed={is_in_my_day} onClick={() => on_set_my_day(task, !is_in_my_day)}>
            {is_in_my_day ? '☀ Added to My Day' : '☀ Add to My Day'}
          </button>
        )
      case 'start':
        return <DateTimeField label="Start" value={task.start_at} on_change={change_start} />
      case 'duration':
        return (
          task.start_at && (
            <label className="field">
              <span className="field-label">Duration</span>
              <select value={is_linked ? duration?.id ?? CUSTOM : UNSET} onChange={(event) => choose_duration(event.currentTarget.value)}>
                <option value={UNSET}>Unset</option>
                {task.due_at && <option value={CUSTOM}>Custom</option>}
                {durations_for_start(durations, task.start_at).map((each) => (
                  <option key={each.id} value={each.id}>
                    {duration_label(each)}
                  </option>
                ))}
              </select>
            </label>
          )
        )
      case 'due':
        return <DateTimeField label="Due" value={task.due_at} on_change={change_due} />
      case 'done':
        return (
          <DateTimeField
            label="Done"
            value={task.done_at && format_local(new Date(task.done_at), true)}
            on_change={(done_at) => on_set_done_at(task, done_at && parse_local(done_at).toISOString())}
          />
        )
      case 'reschedule':
        return <button onClick={() => on_reschedule(task)}>Reschedule…</button>
      case 'repeat':
        return (
          <div className="field">
            <span className="field-label">Repeat</span>
            <button className="recurrence_button" onClick={() => set_is_picking_recurrence(true)}>
              {describe_recurrence(schedule, date_field)}
            </button>
          </div>
        )
      case 'relationships':
        return (
          <RelationshipsField
            task={task}
            tasks={tasks}
            relationships={relationships}
            on_link={(other, relationship_id, is_inverse) => on_link(task, other, relationship_id, is_inverse)}
            on_unlink={(other) => on_unlink(task, other)}
          />
        )
      case 'streak':
        return (
          streak && (
            <div className="field">
              <span className="field-label">Streak</span>
              <span>
                {streak.current > 0 ? (
                  <>
                    <span className="streak_badge">🔥 {streak.current}</span> in a row {task.recurrence ? 'on time' : 'done with its routine'}
                  </>
                ) : (
                  'No streak'
                )}{' '}
                · best {streak.best}
              </span>
              {history.length > 0 && <StreakStrip history={history} limit={28} />}
            </div>
          )
        )
      case 'notes':
        return (
          <label className="field task_detail_notes">
            <span className="field-label">Notes</span>
            <textarea
              value={notes_draft}
              onChange={(event) => set_notes_draft(event.currentTarget.value)}
              onBlur={commit_notes}
              onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
              placeholder="Add notes"
            />
          </label>
        )
    }
  }

  return (
    <aside className="task_detail" aria-label="Task details">
      {topbar ? createPortal(header, topbar) : header}
      <div className="task_detail_body">
        {sections.map((section) => <Fragment key={section}>{render_section(section)}</Fragment>)}

        {is_picking_recurrence && (
          <RecurrencePicker
            recurrence={task.recurrence}
            anchor={recurrence_anchor(schedule, date_field)}
            on_save={(recurrence) => on_set_schedule(task, with_recurrence(schedule, recurrence, undefined, date_field))}
            on_close={() => set_is_picking_recurrence(false)}
          />
        )}

        <footer className="task_detail_footer">
          <span className="muted small">
            Created {new Date(task.created_at).toLocaleDateString()}
            {subtask_count > 0 && ` · ${subtask_count} ${subtask_count === 1 ? 'subtask' : 'subtasks'}`}
          </span>
          <span className="task_detail_actions">
            <button onClick={() => on_show_history(task)}>History</button>
            <button className="danger" onClick={() => on_remove(task)}>
              Delete
            </button>
          </span>
        </footer>
      </div>
    </aside>
  )
}

// ============================================================================
// Relationships
// ============================================================================

// One way of reading a relationship, as offered in the dialog: its name, or its inverse name when that differs.
interface RelationshipSide {
  key: string
  label: string
  relationship: TaskRelationship
  is_inverse: boolean
}

function relationship_sides(relationships: TaskRelationship[]): RelationshipSide[] {
  return relationships.flatMap((relationship) => [
    { key: `${relationship.id}:forward`, label: relationship.name, relationship, is_inverse: false },
    ...(relationship.inverse_name === relationship.name ? [] : [{ key: `${relationship.id}:inverse`, label: relationship.inverse_name, relationship, is_inverse: true }])
  ])
}

// The name a link reads by from this task's side; a symmetric relationship reads the same both ways.
function side_label(link: SeenLink, relationships: TaskRelationship[]): string {
  const relationship = relationships.find((each) => each.id === link.relationship_id)
  if (!relationship) return 'Removed relationship'
  return link.is_inverse ? relationship.inverse_name : relationship.name
}

interface RelationshipsFieldProps {
  task: Task
  tasks: Task[]
  relationships: TaskRelationship[]
  on_link: (other: Task, relationship_id: string, is_inverse: boolean) => void
  on_unlink: (other: Task) => void
}

// The task's links as chips under the name each reads by, and a button that opens the dialog for a new one.
function RelationshipsField({ task, tasks, relationships, on_link, on_unlink }: RelationshipsFieldProps) {
  const [is_adding, set_is_adding] = useState(false)
  const links = links_of(task, tasks)
  const labels = [...new Set(links.map((link) => side_label(link, relationships)))]

  return (
    <div className="field">
      <span className="field-label">Relationships</span>
      {labels.map((label) => (
        <div key={label} className="relationship_group">
          <span className="muted small">{label}</span>
          <div className="chips">
            {links
              .filter((link) => side_label(link, relationships) === label)
              .map(({ other }) => (
                <span key={other.id} className={other.is_done ? 'chip dependency_chip is_done' : 'chip dependency_chip'}>
                  {other.title}
                  <button type="button" className="icon remove" onClick={() => on_unlink(other)} aria-label={`Remove ${label.toLowerCase()} ${other.title}`}>
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      ))}
      {relationships.length > 0 && (
        <button onClick={() => set_is_adding(true)}>
          Add relationship…
        </button>
      )}
      {is_adding && <RelationshipDialog task={task} tasks={tasks} relationships={relationships} on_link={on_link} on_close={() => set_is_adding(false)} />}
    </div>
  )
}

interface RelationshipDialogProps {
  task: Task
  tasks: Task[]
  relationships: TaskRelationship[]
  on_link: (other: Task, relationship_id: string, is_inverse: boolean) => void
  on_close: () => void
}

const RELATIONSHIP_FORM_ID = 'relationship_dialog_form'

// A relationship and an open task side by side; a task already linked to this one gets the new relationship in place of its old one.
function RelationshipDialog({ task, tasks, relationships, on_link, on_close }: RelationshipDialogProps) {
  const sides = relationship_sides(relationships)
  const [side_key, set_side_key] = useState(sides[0]?.key ?? '')
  const [other_id, set_other_id] = useState('')

  const side = sides.find((each) => each.key === side_key)
  const offered = side
    ? tasks
        .filter((each) => !each.is_done && can_link(task.id, each.id, side.relationship, side.is_inverse, tasks, relationships))
        .sort((first, second) => first.title.localeCompare(second.title))
    : []
  const other = offered.find((each) => each.id === other_id)

  function save(event: FormEvent): void {
    event.preventDefault()
    if (!side || !other) return
    on_link(other, side.relationship.id, side.is_inverse)
    on_close()
  }

  return (
    <Dialog
      title="Add relationship"
      class_name="relationship_dialog"
      on_close={on_close}
      buttons={
        <>
          <button type="button" onClick={on_close}>Cancel</button>
          <button type="submit" form={RELATIONSHIP_FORM_ID} className="accent solid" disabled={!other}>Add</button>
        </>
      }
    >
      <form id={RELATIONSHIP_FORM_ID} className="dialog_form" onSubmit={save}>
        <p className="setting-hint">{task.title}</p>
        <span className="inline_fields">
          <select value={side_key} onChange={(event) => set_side_key(event.currentTarget.value)} aria-label="Relationship">
            {sides.map((each) => (
              <option key={each.key} value={each.key}>
                {each.label}
              </option>
            ))}
          </select>
          <select value={other ? other_id : ''} onChange={(event) => set_other_id(event.currentTarget.value)} aria-label="Task" autoFocus>
            <option value="">Choose a task…</option>
            {offered.map((each) => (
              <option key={each.id} value={each.id}>
                {each.title}
              </option>
            ))}
          </select>
        </span>
      </form>
    </Dialog>
  )
}
