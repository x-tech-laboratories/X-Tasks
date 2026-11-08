import { useState, type FormEvent } from 'react'

import { DateTimeField, TreeSelect } from '@x-tech-laboratories/x-libs/web/react/controls'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { use_shortcuts } from '@x-tech-laboratories/x-libs/web/react/shortcuts'
import type { HistoryMark, RoutineStreak } from '@shared/streaks'
import { can_link, links_of, type SeenLink, type Tag, type TagGroup, type Task, type TaskSchedule } from '@shared/tasks'
import { RecurrencePicker } from './RecurrencePicker'
import { StreakStrip } from './StreakStrip'
import { TagChip } from './TagChip'
import type { TaskDateField, TaskDuration, TaskRelationship } from '@shared/settings'
import { format_local, parse_local } from '@x-tech-laboratories/x-libs/dates'
import {
  describe_recurrence, due_after, duration_between, duration_label, durations_for_start, recurrence_anchor, with_recurrence
} from '@shared/schedule'
import { tag_path } from './views'

// ============================================================================
// Task detail
// ============================================================================

interface TaskDetailProps {
  task: Task
  tag_groups: TagGroup[]
  tags: Tag[]
  date_field: TaskDateField
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
  on_close: () => void
}

export function TaskDetail({
  task, tag_groups, tags, date_field, subtask_count, tasks, relationships, on_link, on_unlink, durations, on_toggle, on_rename, on_set_notes, on_set_schedule, on_set_done_at, on_tag, on_untag, on_reschedule,
  is_in_my_day, on_set_my_day, on_remove, on_close, streak, history
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

  const duration = duration_between(durations, task.start_at, task.due_at)

  // While a listed duration is in force, moving the start moves the due date with it.
  function change_start(start_at: string | null): void {
    const listed_duration = start_at && duration && durations_for_start(durations, start_at).includes(duration) ? duration : null
    const due_at = start_at && listed_duration ? due_after(start_at, listed_duration) : task.due_at
    on_set_schedule(task, { ...schedule, start_at, due_at })
  }

  // Custom leaves the due date as it is.
  function choose_duration(duration_id: string): void {
    const chosen = durations.find((each) => each.id === duration_id)
    if (chosen && task.start_at) on_set_schedule(task, { ...schedule, due_at: due_after(task.start_at, chosen) })
  }

  return (
    <aside className="task_detail" aria-label="Task details">
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
        <button className="icon" onClick={on_close} aria-label="Close details">
          ×
        </button>
      </header>

      <button className={is_in_my_day ? 'accent solid' : undefined} aria-pressed={is_in_my_day} onClick={() => on_set_my_day(task, !is_in_my_day)}>
        {is_in_my_day ? '☀ Added to My Day' : '☀ Add to My Day'}
      </button>

      {tag_groups.map((group) => {
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
            <label key={group.id} className="field">
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
          <div key={group.id} className="field">
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
      })}

      <DateTimeField label="Start" value={task.start_at} on_change={change_start} />
      {task.start_at && (
        <label className="field">
          <span className="field-label">Duration</span>
          <select value={duration?.id ?? ''} onChange={(event) => choose_duration(event.currentTarget.value)}>
            <option value="">{task.due_at ? 'Custom' : 'None'}</option>
            {durations_for_start(durations, task.start_at).map((each) => (
              <option key={each.id} value={each.id}>
                {duration_label(each)}
              </option>
            ))}
          </select>
        </label>
      )}
      <DateTimeField label="Due" value={task.due_at} on_change={(due_at) => on_set_schedule(task, { ...schedule, due_at })} />
      <DateTimeField
        label="Done"
        value={task.done_at && format_local(new Date(task.done_at), true)}
        on_change={(done_at) => on_set_done_at(task, done_at && parse_local(done_at).toISOString())}
      />
      <button className="fit-content" onClick={() => on_reschedule(task)}>
        Reschedule…
      </button>

      <div className="field">
        <span className="field-label">Repeat</span>
        <button className="fit-content" onClick={() => set_is_picking_recurrence(true)}>
          {describe_recurrence(schedule, date_field)}
        </button>
      </div>

      <RelationshipsField
        task={task}
        tasks={tasks}
        relationships={relationships}
        on_link={(other, relationship_id, is_inverse) => on_link(task, other, relationship_id, is_inverse)}
        on_unlink={(other) => on_unlink(task, other)}
      />

      {streak && (
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
      )}

      {is_picking_recurrence && (
        <RecurrencePicker
          recurrence={task.recurrence}
          anchor={recurrence_anchor(schedule, date_field)}
          on_save={(recurrence) => on_set_schedule(task, with_recurrence(schedule, recurrence, undefined, date_field))}
          on_close={() => set_is_picking_recurrence(false)}
        />
      )}

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

      <footer className="task_detail_footer">
        <span className="muted small">
          Created {new Date(task.created_at).toLocaleDateString()}
          {subtask_count > 0 && ` · ${subtask_count} ${subtask_count === 1 ? 'subtask' : 'subtasks'}`}
        </span>
        <button className="danger" onClick={() => on_remove(task)}>
          Delete
        </button>
      </footer>
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
                  <button type="button" className="icon" onClick={() => on_unlink(other)} aria-label={`Remove ${label.toLowerCase()} ${other.title}`}>
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      ))}
      {relationships.length > 0 && (
        <button className="fit-content" onClick={() => set_is_adding(true)}>
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
