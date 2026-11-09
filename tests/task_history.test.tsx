// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { TasksApi } from '../src/shared/tasks.ts'
import type { TaskSnapshot, TaskVersion } from '../src/shared/versions.ts'
import { TaskHistoryDialog, type HistoryContext } from '../src/web/TaskHistory.tsx'
import { make_tag } from './fixtures.ts'

afterEach(cleanup)

// ============================================================================
// Setup
// ============================================================================

const context: HistoryContext = {
  tasks: [],
  tags: [make_tag({ id: 'home', group_id: 'context', name: 'Home' })],
  relationships: [],
  date_field: 'due'
}

const first: TaskSnapshot = {
  title: 'Buy milk', notes: '', is_done: false, done_at: null, start_at: null, due_at: null, recurrence: '', are_dates_linked: true, my_day_on: null,
  parent_id: null, created_at: '2026-01-01T00:00:00.000Z', tag_ids: [], links: []
}
const second: TaskSnapshot = { ...first, title: 'Buy oat milk', tag_ids: ['home'] }

function version(number: number, kind: TaskVersion['kind'], snapshot: TaskSnapshot, previous: TaskSnapshot | null, restored_from: string | null = null): TaskVersion {
  return { id: `v${number}`, task_id: 'milk', changed_at: `2026-01-0${number}T10:00:00.000Z`, kind, origin: 'here', restored_from, snapshot, previous }
}

function install_versions(versions: TaskVersion[]) {
  const shown = [...versions]
  const api = {
    list_task_versions: vi.fn(async () => [...shown]),
    restore_task_version: vi.fn(async (version_id: string) => {
      const restored = shown.find((each) => each.id === version_id)!
      shown.unshift(version(shown.length + 1, 'restored', restored.snapshot, shown[0]!.snapshot, version_id))
    })
  }
  window.x_tasks = api as unknown as TasksApi
  return api
}

// ============================================================================
// History dialog
// ============================================================================

describe('the history dialog', () => {
  test('shows the words and tags the picked version changed', async () => {
    install_versions([version(2, 'edited', second, first), version(1, 'created', first, null)])
    render(<TaskHistoryDialog task_id="milk" version_id={null} context={context} on_restored={() => undefined} on_close={() => undefined} />)

    const changes = await screen.findByRole('region', { name: 'Changes' })

    expect(within(changes).getByText('oat')).toHaveProperty('className', 'diff_added')
    expect(within(changes).getByText('Home')).toHaveProperty('className', 'chip diff_added')
    expect(screen.getByRole('button', { name: 'Restore this version' })).toHaveProperty('disabled', true)
  })

  test('restores an older version as a new one at the top', async () => {
    const api = install_versions([version(2, 'edited', second, first), version(1, 'created', first, null)])
    const on_restored = vi.fn()
    render(<TaskHistoryDialog task_id="milk" version_id="v1" context={context} on_restored={on_restored} on_close={() => undefined} />)
    await screen.findByRole('region', { name: 'Changes' })

    fireEvent.click(screen.getByRole('button', { name: 'Compared with now' }))
    const changes = screen.getByRole('region', { name: 'Changes' })
    expect(within(changes).getByText('oat')).toHaveProperty('className', 'diff_removed')
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }))

    await waitFor(() => expect(on_restored).toHaveBeenCalled())
    expect(api.restore_task_version).toHaveBeenCalledWith('v1')
    const rows = within(screen.getByRole('list', { name: 'Versions' })).getAllByRole('button')
    expect(rows.map((row) => row.querySelector('.version_summary')?.textContent)).toEqual(['Restored', 'Changed title and tags', 'Created'])
  })
})
