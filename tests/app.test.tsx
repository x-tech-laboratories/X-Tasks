// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { App } from '../src/web/App.tsx'
import { install_fake_bridge } from './fake_bridge.ts'
import { make_group, make_tag, make_task } from './fixtures.ts'

afterEach(cleanup)

// ============================================================================
// Setup
// ============================================================================

const group = make_group({ id: 'context', name: 'Context' })
const tags = [make_tag({ id: 'home', group_id: 'context', name: 'Home', position: 1 }), make_tag({ id: 'work', group_id: 'context', name: 'Work', position: 2 })]
const tasks = [
  make_task({ id: 'milk', title: 'Buy milk', position: 1, tag_ids: ['home'], notes: 'Get the **oat** kind' }),
  make_task({ id: 'report', title: 'Write report', position: 2, tag_ids: ['work'], due_at: '2026-03-12' }),
  make_task({ id: 'outline', title: 'Outline', parent_id: 'report', position: 1 })
]

async function show_app(settings: Parameters<typeof install_fake_bridge>[0]['settings'] = {}) {
  const bridge = install_fake_bridge({ tasks, tags, tag_groups: [group], settings: { launch_view: 'all', ...settings } })
  render(<App />)
  await screen.findByRole('heading', { name: 'All tasks' })
  return bridge
}

// ============================================================================
// Frame
// ============================================================================

describe('the frame', () => {
  test('lists the views with their counts and the tags under their group', async () => {
    await show_app()

    const views = screen.getByRole('link', { name: /All tasks/ })
    expect(within(views).getByText('3')).toBeTruthy()
    const tree = screen.getByRole('tree', { name: 'Tags' })
    expect(within(tree).getByText('Context')).toBeTruthy()
    expect(within(tree).getByText('Home')).toBeTruthy()
    expect(within(tree).getByText('Work')).toBeTruthy()
  })

  test('selecting a tag shows only its tasks', async () => {
    await show_app()

    fireEvent.click(within(screen.getByRole('tree', { name: 'Tags' })).getByText('Home'))

    await screen.findByRole('heading', { name: 'Home' })
    expect(screen.getByText('Buy milk')).toBeTruthy()
    expect(screen.queryByText('Write report')).toBeNull()
  })

  test('the theme button saves the next theme as a setting and sets it on the page', async () => {
    const { settings_api } = await show_app({ theme: 'system' })

    fireEvent.click(screen.getByRole('button', { name: /Theme: system/ }))

    expect(settings_api.set_setting).toHaveBeenCalledWith('theme', 'light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  test('a task dropped on a tag in the sidebar gets that tag', async () => {
    const { tasks_api } = await show_app()

    fireEvent.dragStart(screen.getByText('Buy milk').closest('.task')!, { dataTransfer: { setData: () => {}, setDragImage: () => {} } })
    const work_row = within(screen.getByRole('tree', { name: 'Tags' })).getByText('Work').closest('.tree-row')!
    fireEvent.dragOver(work_row, { dataTransfer: {} })
    fireEvent.drop(work_row, { dataTransfer: {} })

    expect(tasks_api.tag_task).toHaveBeenCalledWith('milk', 'work')
  })
})

// ============================================================================
// Table
// ============================================================================

describe('the table layout', () => {
  test('shows the tasks as rows with subtasks nested, and a header click saves the sort', async () => {
    const { settings_api } = await show_app({ task_layout: 'table' })

    const table = screen.getByRole('table')
    expect(within(table).getByText('Write report')).toBeTruthy()
    expect(within(table).getByText('Outline')).toBeTruthy()

    fireEvent.click(within(table).getByRole('button', { name: /^Task/ }))

    expect(settings_api.set_setting).toHaveBeenCalledWith('table_sort', [{ column: 'title', is_descending: false }])
  })

  test('a table set to scroll sideways grows past its pane to keep the task its room', async () => {
    await show_app({ task_layout: 'table', scroll_table_sideways: true })

    const wrap = screen.getByRole('table').parentElement
    expect(wrap?.classList.contains('scrolls_sideways')).toBe(true)
    expect(wrap?.parentElement?.style.getPropertyValue('--table-scrolling-width')).toMatch(/^\d+px$/)
  })

  test('folding a task saves it among the collapsed tasks', async () => {
    const { settings_api } = await show_app({ task_layout: 'table' })

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Collapse' }))

    expect(settings_api.set_setting).toHaveBeenCalledWith('collapsed_task_ids', ['report'])
  })
})

// ============================================================================
// Removing
// ============================================================================

describe('removing a task', () => {
  test('takes it off at once and Undo brings it back without deleting it', async () => {
    const { tasks_api } = await show_app()

    fireEvent.click(screen.getByText('Buy milk'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(screen.queryByText('Buy milk')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    await screen.findByText('Buy milk')
    expect(tasks_api.remove_task).not.toHaveBeenCalled()
  })

  test('deletes it for good once a newer removal starts', async () => {
    const { tasks_api } = await show_app()

    fireEvent.click(screen.getByText('Buy milk'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByText('Write report'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(tasks_api.remove_task).toHaveBeenCalledWith('milk'))
    expect(tasks_api.remove_task).not.toHaveBeenCalledWith('report')
    await act(async () => undefined)
  })
})

// ============================================================================
// Notes
// ============================================================================

describe('notes', () => {
  test('show their Markdown formatted in the details', async () => {
    await show_app()

    fireEvent.click(screen.getByText('Buy milk'))

    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    expect(within(notes).getByText('oat').tagName).toBe('STRONG')
  })

  test('open in a dialog whose edits are saved when it closes', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Buy milk'))

    fireEvent.click(await screen.findByRole('button', { name: 'Open notes in a dialog' }))
    const dialog = screen.getByRole('dialog', { name: 'Notes' })
    act(() => { fireEvent.click(within(dialog).getByRole('button', { name: 'Heading' })) })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
    expect(tasks_api.set_task_notes).toHaveBeenCalledWith('milk', '## Get the **oat** kind')
  })
})

// ============================================================================
// Shortcuts
// ============================================================================

describe('shortcuts', () => {
  test('Ctrl+A picks every row on screen and Escape lets them go', async () => {
    await show_app()

    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(await screen.findByText('3 selected')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('3 selected')).toBeNull())
  })

  test('Ctrl+Z brings back the task just removed', async () => {
    const { tasks_api } = await show_app()

    fireEvent.click(screen.getByText('Buy milk'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })

    await screen.findByText('Buy milk')
    expect(tasks_api.remove_task).not.toHaveBeenCalled()
  })
})
