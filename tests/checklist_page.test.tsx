// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { format_local } from '@x-tech-laboratories/x-libs/dates'

import { App } from '../src/web/App.tsx'
import { install_fake_bridge } from './fake_bridge.ts'
import { make_task } from './fixtures.ts'

beforeEach(() => window.history.replaceState(null, '', '/?checklist'))
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

// ============================================================================
// Setup
// ============================================================================

const today = format_local(new Date(), false)
const tasks = [
  make_task({ id: 'milk', title: 'Buy milk', position: 1, my_day_on: today }),
  make_task({ id: 'eggs', title: 'Buy eggs', parent_id: 'milk', position: 1 }),
  make_task({ id: 'report', title: 'Write report', position: 2 }),
  make_task({ id: 'intro', title: 'Draft the intro', parent_id: 'report', position: 1 }),
  make_task({ id: 'sources', title: 'List sources', parent_id: 'report', position: 2, is_done: true }),
  make_task({ id: 'bread', title: 'Buy bread', position: 3, is_done: true })
]

async function show_checklist(settings: Parameters<typeof install_fake_bridge>[0]['settings'] = {}) {
  const bridge = install_fake_bridge({ tasks: tasks.map((task) => ({ ...task })), tags: [], tag_groups: [], settings: { launch_view: 'all', ...settings } })
  render(<App />)
  await screen.findByRole('heading', { name: /My Day/ })
  await act(async () => {})
  return bridge
}

function type_in_bar(text: string): HTMLInputElement {
  const bar = screen.getByRole('searchbox') as HTMLInputElement
  fireEvent.input(bar, { target: { value: text } })
  return bar
}

// ============================================================================
// Checklist page
// ============================================================================

describe('the checklist page', () => {
  test('shows My Day as checkboxes, subtasks under their parent, and nothing of the full app', async () => {
    await show_checklist()

    const list = screen.getAllByRole('list')[0]!
    expect(within(list).getByText('Buy milk')).toBeTruthy()
    expect(within(list).getByText('Buy eggs')).toBeTruthy()
    expect(within(list).queryByText('Write report')).toBeNull()
    expect(screen.getByText(/2 left/)).toBeTruthy()
    expect(screen.queryByRole('tree', { name: 'Tags' })).toBeNull()
  })

  test('ticking a task marks it done', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.click(within(screen.getByText('Buy milk').closest('li')!).getAllByRole('checkbox', { name: 'Mark as done' })[0]!)

    expect(tasks_api.set_task_done).toHaveBeenCalledWith('milk', true, expect.any(String), expect.anything())
  })

  test('the bar finds open tasks anywhere, and one found can be put into My Day', async () => {
    const { tasks_api } = await show_checklist()

    type_in_bar('report')
    const row = (await screen.findByText('Write report')).closest('li')!
    expect(screen.queryByText('Buy bread')).toBeNull()
    fireEvent.click(within(row).getAllByRole('button', { name: 'Add to My Day' })[0]!)

    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('report', today)
  })

  test('Enter puts the first task found into My Day', async () => {
    const { tasks_api } = await show_checklist()

    const bar = type_in_bar('report')
    await screen.findByText('Write report')
    fireEvent.keyDown(bar, { key: 'Enter' })

    await act(async () => {})
    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('report', today)
  })

  test('Enter adds the typed task to My Day when nothing is found', async () => {
    const { tasks_api } = await show_checklist()

    const bar = type_in_bar('Call the plumber')
    await screen.findByText('No open tasks match.')
    fireEvent.keyDown(bar, { key: 'Enter' })

    await act(async () => {})
    expect(tasks_api.add_task).toHaveBeenCalledWith('Call the plumber', null, [], today)
  })

  test('a task found keeps its open subtasks under it', async () => {
    await show_checklist()

    type_in_bar('report')
    const row = (await screen.findByText('Write report')).closest('li')!

    expect(within(row).getByText('Draft the intro')).toBeTruthy()
    expect(within(row).queryByText('List sources')).toBeNull()
  })

  test('the chevron collapses a task with subtasks, and a collapsed one shows none', async () => {
    const { settings_api } = await show_checklist()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(settings_api.set_setting).toHaveBeenCalledWith('collapsed_task_ids', ['milk'])

    cleanup()
    await show_checklist({ collapsed_task_ids: ['milk'] })
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy()
    expect(screen.queryByText('Buy eggs')).toBeNull()
  })

  test('a task put into My Day can be taken out', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.click(screen.getByRole('button', { name: 'Remove from My Day' }))

    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('milk', null)
  })
})
