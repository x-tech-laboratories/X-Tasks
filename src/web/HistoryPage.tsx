import { useEffect, useState } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { PageHeading } from '@x-tech-laboratories/x-libs/web/react/layout'
import type { Task } from '@shared/tasks'
import type { TaskVersion } from '@shared/versions'
import { version_summary } from './TaskHistory'

// ============================================================================
// History page
// ============================================================================

// How many of the latest changes the page lists.
const RECENT_LIMIT = 300

interface HistoryPageProps {
  // Every task, so the list loads again whenever one changes.
  tasks: Task[]
  on_open_history: (task_id: string, version_id: number) => void
}

// The latest changes to every task under the day each was made, deleted tasks included; picking one opens that task's history.
export function HistoryPage({ tasks, on_open_history }: HistoryPageProps) {
  const [versions, set_versions] = useState<TaskVersion[] | null>(null)

  useEffect(() => void window.x_tasks.list_recent_versions(RECENT_LIMIT).then(set_versions), [tasks])

  const days = new Map<string, TaskVersion[]>()
  for (const version of versions ?? []) {
    const day = new Date(version.changed_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    days.set(day, [...(days.get(day) ?? []), version])
  }
  const existing_ids = new Set(tasks.map((task) => task.id))

  return (
    <>
      <PageHeading title="History" />

      {versions?.length === 0 && <p className="empty">No changes yet.</p>}

      {[...days].map(([day, day_versions]) => (
        <section key={day} className="history_day" aria-label={day}>
          <h2 className="group_heading">{day}</h2>
          <ul className="history_list">
            {day_versions.map((version) => (
              <li key={version.id}>
                <button className="history_row" onClick={() => on_open_history(version.task_id, version.id)}>
                  <span className={cx('history_title', !existing_ids.has(version.task_id) && 'is_gone')}>{version.snapshot.title}</span>
                  <span className="history_summary">{version_summary(version)}</span>
                  <span className="muted small">
                    {new Date(version.changed_at).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                    {version.origin === 'elsewhere' && ' · from another device'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
