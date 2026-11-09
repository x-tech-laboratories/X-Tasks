import { useEffect, useState, type ReactNode } from 'react'
import { diffWordsWithSpace } from 'diff'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { has_time, parse_local } from '@x-tech-laboratories/x-libs/dates'
import { describe_recurrence } from '@shared/schedule'
import type { TaskDateField, TaskRelationship } from '@shared/settings'
import type { Tag, Task } from '@shared/tasks'
import { changed_fields, is_same_snapshot, SNAPSHOT_FIELDS, type SnapshotField, type SnapshotLink, type TaskSnapshot, type TaskVersion, type VersionKind } from '@shared/versions'
import { tag_path } from './views'

// ============================================================================
// Names
// ============================================================================

const FIELD_LABELS: Record<SnapshotField, string> = {
  title: 'Title',
  notes: 'Notes',
  is_done: 'Done',
  done_at: 'Done at',
  start_at: 'Start',
  due_at: 'Due',
  are_dates_linked: 'Dates move together',
  recurrence: 'Repeat',
  my_day_on: 'My Day',
  parent_id: 'Parent task',
  tag_ids: 'Tags',
  links: 'Relationships'
}

const KIND_LABELS: Record<VersionKind, string> = {
  created: 'Created',
  edited: 'Edited',
  deleted: 'Deleted',
  restored: 'Restored',
  first_seen: 'When history began'
}

// What the history needs to name the tags, tasks and relationships a snapshot points at.
export interface HistoryContext {
  tasks: Task[]
  tags: Tag[]
  relationships: TaskRelationship[]
  date_field: TaskDateField
}

// A line saying what a version did, such as "Changed title and due".
export function version_summary(version: TaskVersion): string {
  const fields = changed_fields(version.previous, version.snapshot).map((field) => FIELD_LABELS[field].toLowerCase())
  if (version.kind === 'edited') return fields.length > 0 ? `Changed ${joined(fields)}` : 'Edited'
  return KIND_LABELS[version.kind]
}

function joined(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

export function version_time(version: TaskVersion): string {
  return new Date(version.changed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// ============================================================================
// Values
// ============================================================================

function local_date(value: string): string {
  return parse_local(value).toLocaleString(undefined, has_time(value) ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function task_title(task_id: string, context: HistoryContext): string {
  return context.tasks.find((task) => task.id === task_id)?.title ?? 'A deleted task'
}

function tag_name(tag_id: string, context: HistoryContext): string {
  const tag = context.tags.find((each) => each.id === tag_id)
  return tag ? tag_path(tag, context.tags) : 'A deleted tag'
}

function link_name(link: SnapshotLink, context: HistoryContext): string {
  const relationship = context.relationships.find((each) => each.id === link.relationship_id)
  const label = relationship ? (link.is_inverse ? relationship.inverse_name : relationship.name) : 'Removed relationship'
  return `${label}: ${task_title(link.other_id, context)}`
}

// A field's value as words, or empty when it has none.
function value_text(field: SnapshotField, snapshot: TaskSnapshot, context: HistoryContext): string {
  switch (field) {
    case 'title': return snapshot.title
    case 'notes': return snapshot.notes
    case 'is_done': return snapshot.is_done ? 'Yes' : 'No'
    case 'done_at': return snapshot.done_at ? new Date(snapshot.done_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
    case 'start_at': return snapshot.start_at ? local_date(snapshot.start_at) : ''
    case 'due_at': return snapshot.due_at ? local_date(snapshot.due_at) : ''
    case 'are_dates_linked': return snapshot.are_dates_linked ? 'Yes' : 'No'
    case 'recurrence': return snapshot.recurrence ? describe_recurrence(snapshot, context.date_field) : ''
    case 'my_day_on': return snapshot.my_day_on ? local_date(snapshot.my_day_on) : ''
    case 'parent_id': return snapshot.parent_id ? task_title(snapshot.parent_id, context) : ''
    case 'tag_ids': return snapshot.tag_ids.map((tag_id) => tag_name(tag_id, context)).join(', ')
    case 'links': return snapshot.links.map((link) => link_name(link, context)).join(', ')
  }
}

// The names in a list field, for showing which were added and which taken away.
function value_items(field: 'tag_ids' | 'links', snapshot: TaskSnapshot, context: HistoryContext): string[] {
  return field === 'tag_ids' ? snapshot.tag_ids.map((tag_id) => tag_name(tag_id, context)) : snapshot.links.map((link) => link_name(link, context))
}

// ============================================================================
// Diffs
// ============================================================================

const EMPTY = <span className="muted">None</span>

// Words taken out are struck through and words put in are marked, in place.
function TextDiff({ before, after }: { before: string; after: string }) {
  return (
    <span className="text_diff">
      {diffWordsWithSpace(before, after).map((part, index) => (
        <span key={index} className={cx(part.added && 'diff_added', part.removed && 'diff_removed')}>
          {part.value}
        </span>
      ))}
    </span>
  )
}

function ListDiff({ before, after }: { before: string[]; after: string[] }) {
  const kept = after.filter((item) => before.includes(item))
  return (
    <span className="chips">
      {before.filter((item) => !after.includes(item)).map((item) => <span key={`removed:${item}`} className="chip diff_removed">{item}</span>)}
      {after.filter((item) => !before.includes(item)).map((item) => <span key={`added:${item}`} className="chip diff_added">{item}</span>)}
      {kept.map((item) => <span key={`kept:${item}`} className="chip">{item}</span>)}
    </span>
  )
}

function FieldDiff({ field, before, after, context }: { field: SnapshotField; before: TaskSnapshot; after: TaskSnapshot; context: HistoryContext }) {
  if (field === 'title' || field === 'notes') return <TextDiff before={before[field]} after={after[field]} />
  if (field === 'tag_ids' || field === 'links') return <ListDiff before={value_items(field, before, context)} after={value_items(field, after, context)} />

  const old_text = value_text(field, before, context)
  const new_text = value_text(field, after, context)
  return (
    <span className="value_diff">
      <span className="diff_removed">{old_text || 'None'}</span>
      <span aria-hidden="true">→</span>
      <span className="diff_added">{new_text || 'None'}</span>
    </span>
  )
}

// Each field that differs between the two snapshots, with what it was and what it became.
export function SnapshotDiff({ before, after, context }: { before: TaskSnapshot; after: TaskSnapshot; context: HistoryContext }) {
  const fields = changed_fields(before, after)
  if (fields.length === 0) return <p className="empty">No differences.</p>

  return (
    <dl className="snapshot_fields">
      {fields.map((field) => (
        <div key={field}>
          <dt>{FIELD_LABELS[field]}</dt>
          <dd><FieldDiff field={field} before={before} after={after} context={context} /></dd>
        </div>
      ))}
    </dl>
  )
}

// Every field the snapshot gives a value, for a version with nothing before it to compare.
function SnapshotFields({ snapshot, context }: { snapshot: TaskSnapshot; context: HistoryContext }) {
  return (
    <dl className="snapshot_fields">
      {SNAPSHOT_FIELDS.map((field) => {
        const text = value_text(field, snapshot, context)
        if (!text && field !== 'title') return null
        return (
          <div key={field}>
            <dt>{FIELD_LABELS[field]}</dt>
            <dd className={field === 'notes' ? 'text_diff' : undefined}>{text || EMPTY}</dd>
          </div>
        )
      })}
    </dl>
  )
}

// ============================================================================
// History dialog
// ============================================================================

type Comparison = 'previous' | 'current'

interface TaskHistoryDialogProps {
  task_id: string
  // The version picked when the dialog opens; the newest one otherwise.
  version_id: string | null
  context: HistoryContext
  on_restored: () => void
  on_close: () => void
}

// A task's versions down one side, and the picked one's changes on the other, against the version before it or against the task as it is now.
export function TaskHistoryDialog({ task_id, version_id, context, on_restored, on_close }: TaskHistoryDialogProps) {
  const [versions, set_versions] = useState<TaskVersion[] | null>(null)
  const [selected_id, set_selected_id] = useState(version_id)
  const [comparison, set_comparison] = useState<Comparison>('previous')
  const [is_restoring, set_is_restoring] = useState(false)

  function load(): Promise<TaskVersion[]> {
    return window.x_tasks.list_task_versions(task_id).then((loaded) => {
      set_versions(loaded)
      return loaded
    })
  }

  useEffect(() => void load(), [task_id])

  const latest = versions?.[0]
  const selected = versions?.find((version) => version.id === selected_id) ?? latest
  const is_gone = latest?.kind === 'deleted'
  const is_current = !!selected && !!latest && !is_gone && is_same_snapshot(selected.snapshot, latest.snapshot)
  const restored_source = versions?.find((version) => version.id === selected?.restored_from)

  async function restore(): Promise<void> {
    if (!selected) return
    set_is_restoring(true)
    try {
      await window.x_tasks.restore_task_version(selected.id)
      const loaded = await load()
      set_selected_id(loaded[0]?.id ?? null)
      set_comparison('previous')
      on_restored()
    } finally {
      set_is_restoring(false)
    }
  }

  function render_changes(version: TaskVersion): ReactNode {
    if (comparison === 'current' && latest) {
      if (is_current) return <p className="empty">This is how the task is now.</p>
      return (
        <>
          <p className="setting-hint">{is_gone ? 'Restoring brings the task back as shown.' : 'Restoring makes these changes to the task as it is now.'}</p>
          {is_gone ? <SnapshotFields snapshot={version.snapshot} context={context} /> : <SnapshotDiff before={latest.snapshot} after={version.snapshot} context={context} />}
        </>
      )
    }
    if (version.kind === 'deleted') {
      return (
        <>
          <p className="setting-hint">The task was deleted. It was last like this:</p>
          <SnapshotFields snapshot={version.snapshot} context={context} />
        </>
      )
    }
    if (!version.previous) return <SnapshotFields snapshot={version.snapshot} context={context} />
    return <SnapshotDiff before={version.previous} after={version.snapshot} context={context} />
  }

  const title = latest?.snapshot.title ?? task_title(task_id, context)

  return (
    <Dialog
      title="History"
      subtitle={title}
      wide
      class_name="history_dialog"
      on_close={on_close}
      buttons={
        <>
          <button type="button" onClick={on_close}>Close</button>
          <button
            type="button"
            className="accent solid"
            disabled={!selected || is_current || is_restoring}
            title={is_current ? 'This is how the task is now' : undefined}
            onClick={() => void restore()}
          >
            {is_gone ? 'Restore task as this version' : 'Restore this version'}
          </button>
        </>
      }
    >
      {versions === null ? (
        <p className="empty">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="empty">This task has no history.</p>
      ) : (
        <div className="version_history">
          <ol className="version_list" aria-label="Versions">
            {versions.map((version) => (
              <li key={version.id}>
                <button className={cx('version_row', version.id === selected?.id && 'is_selected')} aria-current={version.id === selected?.id} onClick={() => set_selected_id(version.id)}>
                  <span className="version_summary">{version_summary(version)}</span>
                  <span className="muted small">
                    {version_time(version)}
                    {version.origin === 'elsewhere' && ' · from another device'}
                    {version.id === latest?.id && !is_gone && ' · now'}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {selected && (
            <section className="version_detail" aria-label="Changes">
              <div className="segmented" role="group" aria-label="Compare">
                <button aria-pressed={comparison === 'previous'} onClick={() => set_comparison('previous')}>
                  What this version changed
                </button>
                <button aria-pressed={comparison === 'current'} onClick={() => set_comparison('current')}>
                  {is_gone ? 'Restoring it' : 'Compared with now'}
                </button>
              </div>
              {restored_source && <p className="setting-hint">Brought back from the version of {version_time(restored_source)}.</p>}
              {render_changes(selected)}
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
