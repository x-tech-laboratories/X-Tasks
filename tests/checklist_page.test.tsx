// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(within(list).getByDisplayValue('Buy milk')).toBeTruthy()
    expect(within(list).getByDisplayValue('Buy eggs')).toBeTruthy()
    expect(within(list).queryByDisplayValue('Write report')).toBeNull()
    expect(screen.getByText(/2 left/)).toBeTruthy()
    expect(screen.queryByRole('tree', { name: 'Tags' })).toBeNull()
  })

  test('ticking a task marks it done', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.click(within(screen.getByDisplayValue('Buy milk').closest('li')!).getAllByRole('checkbox', { name: 'Mark as done' })[0]!)

    expect(tasks_api.set_task_done).toHaveBeenCalledWith('milk', true, expect.any(String), expect.anything())
  })

  test('the bar finds open tasks anywhere, and one found can be put into My Day', async () => {
    const { tasks_api } = await show_checklist()

    type_in_bar('report')
    const row = (await screen.findByDisplayValue('Write report')).closest('li')!
    expect(screen.queryByDisplayValue('Buy bread')).toBeNull()
    fireEvent.click(within(row).getAllByRole('button', { name: 'Add to My Day' })[0]!)

    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('report', today)
  })

  test('Enter puts the first task found into My Day', async () => {
    const { tasks_api } = await show_checklist()

    const bar = type_in_bar('report')
    await screen.findByDisplayValue('Write report')
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
    const row = (await screen.findByDisplayValue('Write report')).closest('li')!

    expect(within(row).getByDisplayValue('Draft the intro')).toBeTruthy()
    expect(within(row).queryByDisplayValue('List sources')).toBeNull()
  })

  test('the chevron collapses a task with subtasks, and a collapsed one shows none', async () => {
    const { settings_api } = await show_checklist()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(settings_api.set_setting).toHaveBeenCalledWith('collapsed_task_ids', ['milk'])

    cleanup()
    await show_checklist({ collapsed_task_ids: ['milk'] })
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy()
    expect(screen.queryByDisplayValue('Buy eggs')).toBeNull()
  })

  test('a task put into My Day can be taken out', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.click(screen.getByRole('button', { name: 'Remove from My Day' }))

    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('milk', null)
  })
})

// ============================================================================
// Editing like a note
// ============================================================================

function title_field(title: string): HTMLTextAreaElement {
  return screen.getByDisplayValue(title) as HTMLTextAreaElement
}

describe('editing the checklist like a note', () => {
  test('a title is typed into in place and saved when the caret leaves it', async () => {
    const { tasks_api } = await show_checklist()

    const field = title_field('Buy milk')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'Buy oat milk' } })
    fireEvent.blur(field)

    expect(tasks_api.set_task_title).toHaveBeenCalledWith('milk', 'Buy oat milk')
  })

  test('Enter adds an empty task to My Day right below the row, with the caret in it', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.keyDown(title_field('Buy milk'), { key: 'Enter' })

    await waitFor(() => expect(tasks_api.move_task).toHaveBeenCalledWith('added-6', null, 1.5))
    expect(tasks_api.add_task).toHaveBeenCalledWith('', null, [], today)
    const fields = screen.getAllByRole('textbox', { name: 'Title' }) as HTMLTextAreaElement[]
    expect(fields.map((field) => field.value)).toEqual(['Buy milk', 'Buy eggs', ''])
    expect(document.activeElement).toBe(fields[2])
  })

  test('Shift+Tab brings a subtask out after its parent and into My Day, and Tab nests it back', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.keyDown(title_field('Buy eggs'), { key: 'Tab', shiftKey: true })
    expect(tasks_api.move_task).toHaveBeenLastCalledWith('eggs', null, 1.5)
    expect(tasks_api.set_task_my_day).toHaveBeenCalledWith('eggs', today)
    expect(document.activeElement).toBe(title_field('Buy eggs'))

    fireEvent.keyDown(title_field('Buy eggs'), { key: 'Tab' })
    expect(tasks_api.move_task).toHaveBeenLastCalledWith('eggs', 'milk', 2)
  })

  test('Tab does nothing to the first row, which has nothing above to nest under', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.keyDown(title_field('Buy milk'), { key: 'Tab' })

    expect(tasks_api.move_task).not.toHaveBeenCalled()
  })

  test('Backspace on an emptied row deletes it and puts the caret at the end of the row above', async () => {
    await show_checklist()

    const field = title_field('Buy eggs')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.keyDown(field, { key: 'Backspace' })

    expect(screen.queryByDisplayValue('Buy eggs')).toBeNull()
    expect(document.activeElement).toBe(title_field('Buy milk'))
    expect(await screen.findByText('Deleted "Buy eggs"')).toBeTruthy()
  })

  test('a new row left blank goes away', async () => {
    const { tasks_api } = await show_checklist()

    fireEvent.keyDown(title_field('Buy milk'), { key: 'Enter' })
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Title'))
    const blank = document.activeElement as HTMLTextAreaElement
    expect(blank.value).toBe('')
    title_field('Buy milk').focus()
    fireEvent.blur(blank)

    await waitFor(() => expect(tasks_api.remove_task).toHaveBeenCalledWith('added-6'))
    expect(screen.getAllByRole('textbox', { name: 'Title' })).toHaveLength(2)
  })

  test('the arrow keys walk the rows', async () => {
    await show_checklist()

    fireEvent.keyDown(title_field('Buy milk'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(title_field('Buy eggs'))
    fireEvent.keyDown(title_field('Buy eggs'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(title_field('Buy milk'))
  })
})
