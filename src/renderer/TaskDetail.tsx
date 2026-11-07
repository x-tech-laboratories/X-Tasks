import { useEffect, useRef, useState } from 'preact/hooks'

import type { HistoryMark, RoutineStreak } from '@shared/streaks'
import { can_link, links_of, type SeenLink, type Tag, type TagGroup, type Task, type TaskSchedule } from '@shared/tasks'
import { RecurrencePicker } from './RecurrencePicker'
import { StreakStrip } from './StreakStrip'
import type { TaskDateField, TaskDuration, TaskRelationship } from '@shared/settings'
import {
  describe_recurrence, due_after, duration_between, duration_label, durations_for_start, format_task_date, parse_task_date, recurrence_anchor,
  with_recurrence
} from '@shared/schedule'
import { children_of, tag_color_style, tag_path, with_icon } from './views'

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

  // Each field saves on blur, which happens before this closes the panel.
  useEffect(() => {
    function close_on_escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') on_close()
    }
    window.addEventListener('keydown', close_on_escape)
    return () => window.removeEventListener('keydown', close_on_escape)
  }, [on_close])

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
  function choose_duration(event: Event): void {
    const chosen = durations.find((each) => each.id === (event.currentTarget as HTMLSelectElement).value)
    if (chosen && task.start_at) on_set_schedule(task, { ...schedule, due_at: due_after(task.start_at, chosen) })
  }

  function add_tag(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement
    const tag = tags.find((each) => each.id === select.value)
    if (tag) on_tag(task, tag)
    select.value = ''
  }

  return (
    <aside class="task_detail">
      <header class="task_detail_header">
        <input
          type="checkbox"
          checked={task.is_done}
          onChange={() => on_toggle(task)}
          aria-label={task.is_done ? 'Mark as not done' : 'Mark as done'}
        />
        <input
          class="task_detail_title"
          value={title_draft}
          onInput={(event) => set_title_draft(event.currentTarget.value)}
          onBlur={commit_title}
          onKeyDown={(event) => (event.key === 'Enter' || event.key === 'Escape') && event.currentTarget.blur()}
          aria-label="Title"
        />
        <button class="remove_button" onClick={on_close} aria-label="Close details">
          ×
        </button>
      </header>

      <button class={is_in_my_day ? 'my_day_button is_selected' : 'my_day_button'} onClick={() => on_set_my_day(task, !is_in_my_day)}>
        {is_in_my_day ? '☀ Added to My Day' : '☀ Add to My Day'}
      </button>

      {tag_groups.map((group) => {
        // Rule tags apply by themselves, so only plain tags are offered, and a group of nothing but rule tags is left out.
        const group_tags = tags.filter((tag) => tag.group_id === group.id && !tag.rule)
        if (group_tags.length === 0 && tags.some((tag) => tag.group_id === group.id)) return null
        const task_tags = group_tags.filter((tag) => task.tag_ids.includes(tag.id))
        const other_tags = group_tags.filter((tag) => !task.tag_ids.includes(tag.id))

        // A one-tag-per-task group is a single choice, with None to clear it.
        if (group.is_single_choice && task_tags.length <= 1) {
          const current_tag = task_tags[0]

          function choose(event: Event): void {
            const chosen_tag = group_tags.find((tag) => tag.id === (event.currentTarget as HTMLSelectElement).value)
            if (chosen_tag) on_tag(task, chosen_tag)
            else if (current_tag) on_untag(task, current_tag)
          }

          return (
            <label key={group.id} class="task_detail_field">
              <span class="sidebar_heading">{group.name}</span>
              <TagTreeSelect value={current_tag?.id ?? ''} blank_label="None" group_tags={group_tags} tags={tags} on_change={choose} />
            </label>
          )
        }

        return (
          <div key={group.id} class="task_detail_field">
            <span class="sidebar_heading">{group.name}</span>
            {task_tags.length > 0 && (
              <div class="tag_chips">
                {task_tags.map((tag) => (
                  <span key={tag.id} class={tag.color ? 'tag_chip has_color' : 'tag_chip'} style={tag_color_style(tag)}>
                    {with_icon(tag, tag_path(tag, tags))}
                    <button onClick={() => on_untag(task, tag)} aria-label={`Remove tag ${tag.name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {other_tags.length > 0 && (
              <TagTreeSelect
                value=""
                blank_label={`Add ${group.name.toLowerCase()} tag…`}
                group_tags={group_tags}
                tags={tags}
                held_ids={task.tag_ids}
                on_change={add_tag}
                aria_label={`Add ${group.name} tag`}
              />
            )}
          </div>
        )
      })}

      <DateField label="Start" value={task.start_at} on_change={change_start} />
      {task.start_at && (
        <label class="task_detail_field">
          <span class="sidebar_heading">Duration</span>
          <select value={duration?.id ?? ''} onChange={choose_duration}>
            <option value="">{task.due_at ? 'Custom' : 'None'}</option>
            {durations_for_start(durations, task.start_at).map((each) => (
              <option key={each.id} value={each.id}>
                {duration_label(each)}
              </option>
            ))}
          </select>
        </label>
      )}
      <DateField label="Due" value={task.due_at} on_change={(due_at) => on_set_schedule(task, { ...schedule, due_at })} />
      <DateField
        label="Done"
        value={task.done_at && format_task_date(new Date(task.done_at), true)}
        on_change={(done_at) => on_set_done_at(task, done_at && parse_task_date(done_at).toISOString())}
      />
      <button class="reschedule_button" onClick={() => on_reschedule(task)}>
        Reschedule…
      </button>

      <div class="task_detail_field">
        <span class="sidebar_heading">Repeat</span>
        <button class="recurrence_button" onClick={() => set_is_picking_recurrence(true)}>
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
        <div class="task_detail_field">
          <span class="sidebar_heading">Streak</span>
          <span class="streak_summary">
            {streak.current > 0 ? (
              <>
                <span class="streak_badge">🔥 {streak.current}</span> in a row {task.recurrence ? 'on time' : 'done with its routine'}
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

      <label class="task_detail_field task_detail_notes">
        <span class="sidebar_heading">Notes</span>
        <textarea
          value={notes_draft}
          onInput={(event) => set_notes_draft(event.currentTarget.value)}
          onBlur={commit_notes}
          onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
          placeholder="Add notes"
        />
      </label>

      <footer class="task_detail_footer">
        <span>
          Created {new Date(task.created_at).toLocaleDateString()}
          {subtask_count > 0 && ` · ${subtask_count} ${subtask_count === 1 ? 'subtask' : 'subtasks'}`}
        </span>
        <button class="danger_button" onClick={() => on_remove(task)}>
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
    <div class="task_detail_field">
      <span class="sidebar_heading">Relationships</span>
      {labels.map((label) => (
        <div key={label} class="relationship_group">
          <span class="relationship_label">{label}</span>
          <div class="tag_chips">
            {links
              .filter((link) => side_label(link, relationships) === label)
              .map(({ other }) => (
                <span key={other.id} class={other.is_done ? 'tag_chip dependency_chip is_done' : 'tag_chip dependency_chip'}>
                  {other.title}
                  <button onClick={() => on_unlink(other)} aria-label={`Remove ${label.toLowerCase()} ${other.title}`}>
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      ))}
      {relationships.length > 0 && (
        <button class="recurrence_button" onClick={() => set_is_adding(true)}>
          Add relationship…
        </button>
      )}
      {is_adding && (
        <RelationshipDialog task={task} tasks={tasks} relationships={relationships} on_link={on_link} on_close={() => set_is_adding(false)} />
      )}
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

// A relationship and an open task side by side; a task already linked to this one gets the new relationship in place of its old one.
function RelationshipDialog({ task, tasks, relationships, on_link, on_close }: RelationshipDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const sides = relationship_sides(relationships)
  const [side_key, set_side_key] = useState(sides[0]?.key ?? '')
  const [other_id, set_other_id] = useState('')

  useEffect(() => dialog_ref.current?.showModal(), [])

  const side = sides.find((each) => each.key === side_key)
  const offered = side
    ? tasks
        .filter((each) => !each.is_done && can_link(task.id, each.id, side.relationship, side.is_inverse, tasks, relationships))
        .sort((first, second) => first.title.localeCompare(second.title))
    : []
  const other = offered.find((each) => each.id === other_id)

  function save(event: Event): void {
    event.preventDefault()
    if (!side || !other) return
    on_link(other, side.relationship.id, side.is_inverse)
    on_close()
  }

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      class="recurrence_dialog relationship_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <form onSubmit={save}>
        <h2 class="recurrence_dialog_heading">Add relationship</h2>
        <p class="setting_hint">{task.title}</p>

        <div class="relationship_dialog_row">
          <select value={side_key} onChange={(event) => set_side_key(event.currentTarget.value)} aria-label="Relationship">
            {sides.map((each) => (
              <option key={each.key} value={each.key}>
                {each.label}
              </option>
            ))}
          </select>
          <select value={other ? other_id : ''} onChange={(event) => set_other_id(event.currentTarget.value)} aria-label="Task" autofocus>
            <option value="">Choose a task…</option>
            {offered.map((each) => (
              <option key={each.id} value={each.id}>
                {each.title}
              </option>
            ))}
          </select>
        </div>

        <footer class="recurrence_dialog_footer">
          <button type="button" onClick={on_close}>
            Cancel
          </button>
          <button type="submit" class="primary_button" disabled={!other}>
            Add
          </button>
        </footer>
      </form>
    </dialog>
  )
}

// ============================================================================
// Tag tree select
// ============================================================================

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      selectedcontent: HTMLAttributes<HTMLElement>
    }
  }
}

interface TagTreeSelectProps {
  value: string
  blank_label: string
  group_tags: Tag[]
  tags: Tag[]
  held_ids?: string[]
  on_change: (event: Event) => void
  aria_label?: string
}

// The open list shows the group as an indented tree, while the closed select shows the chosen tag's whole branch.
function TagTreeSelect({ value, blank_label, group_tags, tags, held_ids = [], on_change, aria_label }: TagTreeSelectProps) {
  const group_ids = new Set(group_tags.map((tag) => tag.id))

  // Tags the task already holds stay in the tree, greyed out, so their children keep their place under them.
  function branch(tag: Tag, depth: number): preact.JSX.Element[] {
    return [
      <option key={tag.id} value={tag.id} disabled={held_ids.includes(tag.id)} style={{ '--depth': depth }}>
        <span class="tree_option_name">{tag.name}</span>
        <span class="tree_option_path">{tag_path(tag, tags)}</span>
      </option>,
      ...children_of(tag.id, group_tags).flatMap((child) => branch(child, depth + 1))
    ]
  }

  return (
    <select class="tree_select" value={value} onChange={on_change} aria-label={aria_label}>
      <button>
        <selectedcontent />
      </button>
      <option value="">{blank_label}</option>
      {group_tags.filter((tag) => !group_ids.has(tag.parent_id ?? '')).flatMap((tag) => branch(tag, 0))}
    </select>
  )
}

// ============================================================================
// Date field
// ============================================================================

interface DateFieldProps {
  label: string
  value: string | null
  on_change: (value: string | null) => void
}

// The time is optional, and clearing the date clears the time with it.
function DateField({ label, value, on_change }: DateFieldProps) {
  const [day = '', time = ''] = value?.split('T') ?? []

  function change(new_day: string, new_time: string): void {
    if (!new_day) on_change(null)
    else on_change(new_time ? `${new_day}T${new_time}` : new_day)
  }

  return (
    <div class="task_detail_field">
      <span class="sidebar_heading">{label}</span>
      <div class="date_field">
        <input
          type="date"
          value={day}
          onChange={(event) => change(event.currentTarget.value, time)}
          aria-label={`${label} date`}
        />
        {day && (
          <input
            type="time"
            value={time}
            onChange={(event) => change(day, event.currentTarget.value)}
            aria-label={`${label} time`}
          />
        )}
        {day && (
          <button class="remove_button" onClick={() => on_change(null)} aria-label={`Clear ${label.toLowerCase()} date`}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
