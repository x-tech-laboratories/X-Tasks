// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { App } from '../src/web/App.tsx'
import { AwayDialog } from '../src/web/TimeTracking.tsx'
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

  test('the theme row in the sidebar foot saves the next theme as a setting and sets it on the page', async () => {
    const { settings_api } = await show_app({ theme: 'system' })

    fireEvent.click(screen.getByRole('button', { name: 'System theme' }))

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
// Time tracking
// ============================================================================

describe('the timer', () => {
  test('starts from a row, shows in the top bar and stops from there', async () => {
    const { tasks_api } = await show_app()
    const row = screen.getByText('Buy milk').closest('.task')! as HTMLElement

    fireEvent.click(within(row).getByRole('button', { name: 'Start timer' }))

    const timer = await screen.findByRole('status', { name: 'Running timer' })
    expect(within(timer).getByText('Buy milk')).toBeTruthy()
    expect(tasks_api.start_timer).toHaveBeenCalledWith('milk', expect.any(String))

    fireEvent.click(within(timer).getByRole('button', { name: 'Stop timer' }))

    expect(screen.queryByRole('status', { name: 'Running timer' })).toBeNull()
    expect(tasks_api.stop_timer).toHaveBeenCalled()
  })

  test('keeps the first timer running when several are allowed, each stopped on its own', async () => {
    const { tasks_api } = await show_app({ allow_several_timers: true })
    const row_of = (title: string) => screen.getAllByText(title).map((each) => each.closest('.task')).find(Boolean) as HTMLElement

    fireEvent.click(within(row_of('Buy milk')).getByRole('button', { name: 'Start timer' }))
    fireEvent.click(within(row_of('Write report')).getByRole('button', { name: 'Start timer' }))

    await waitFor(() => expect(screen.getAllByRole('status', { name: 'Running timer' })).toHaveLength(2))
    fireEvent.click(within(row_of('Buy milk')).getByRole('button', { name: 'Stop timer' }))

    const timers = screen.getAllByRole('status', { name: 'Running timer' })
    expect(timers).toHaveLength(1)
    expect(within(timers[0]!).getByText('Write report')).toBeTruthy()
    expect(tasks_api.stop_timer).toHaveBeenCalledWith(expect.any(String), 'milk')
  })

  test('saves an estimate typed in the details, shown against the time spent on the row', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Buy milk'))

    const estimate = await screen.findByRole('textbox', { name: 'Estimate' })
    fireEvent.change(estimate, { target: { value: '1h 30m' } })
    fireEvent.blur(estimate)

    expect(tasks_api.set_task_estimate).toHaveBeenCalledWith('milk', 90)
    expect((estimate as HTMLInputElement).value).toBe('1h 30m')
    expect(screen.getByText('0m / 1h 30m')).toBeTruthy()
  })

  test('puts back the saved estimate when the typed one cannot be read', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Buy milk'))

    const estimate = await screen.findByRole('textbox', { name: 'Estimate' })
    fireEvent.change(estimate, { target: { value: 'soon' } })
    fireEvent.blur(estimate)

    expect(tasks_api.set_task_estimate).not.toHaveBeenCalled()
    expect((estimate as HTMLInputElement).value).toBe('')
  })

  test('stops when its task is marked done', async () => {
    const { tasks_api } = await show_app()
    const row = screen.getByText('Buy milk').closest('.task')! as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Start timer' }))
    await screen.findByRole('status', { name: 'Running timer' })

    fireEvent.click(within(row).getByRole('checkbox', { name: 'Mark as done' }))

    expect(screen.queryByRole('status', { name: 'Running timer' })).toBeNull()
    expect(tasks_api.stop_timer).toHaveBeenCalled()
  })
})

// ============================================================================
// Time away
// ============================================================================

describe('the time away dialog', () => {
  const span = { from: new Date(2026, 10, 17, 10, 0).getTime(), to: new Date(2026, 10, 17, 10, 40).getTime() }

  test('names the stretch and the tasks timed, and offers keep, discard, and discard and stop', () => {
    const calls: string[] = []
    render(<AwayDialog span={span} titles={['Write report']} on_keep={() => calls.push('keep')} on_discard={() => calls.push('discard')} on_discard_and_stop={() => calls.push('stop')} />)

    const dialog = screen.getByRole('dialog', { name: 'Time away' })
    expect(within(dialog).getByText(/40m, while timing Write report/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard and stop' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep' }))
    expect(calls).toEqual(['discard', 'stop', 'keep'])
  })
})

// ============================================================================
// Worklog
// ============================================================================

describe('the worklog', () => {
  test("shows this week's time per task and day from the sidebar, opening a task from its row", async () => {
    const started_at = new Date()
    started_at.setHours(9, 0, 0, 0)
    const ended_at = new Date(started_at.getTime() + 90 * 60_000)
    const bridge = install_fake_bridge({ tasks, tags, tag_groups: [group], settings: { launch_view: 'all' } })
    bridge.tasks_api.list_time_entries.mockResolvedValue([{ id: 'entry', task_id: 'report', started_at: started_at.toISOString(), ended_at: ended_at.toISOString() }])
    render(<App />)
    await screen.findByRole('heading', { name: 'All tasks' })

    fireEvent.click(screen.getByRole('link', { name: /Worklog/ }))

    const table = await screen.findByRole('table')
    const row = within(table).getByRole('button', { name: 'Write report' }).closest('tr')!
    expect(within(row).getAllByText('1h 30m')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Copy CSV' })).toBeTruthy()

    fireEvent.click(within(table).getByRole('button', { name: 'Write report' }))
    expect(await screen.findByRole('complementary', { name: 'Task details' })).toBeTruthy()
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
  test('Enter in the search bar opens the first task found', async () => {
    const { tasks_api } = await show_app()

    const search = screen.getByRole('searchbox', { name: 'Search, or type a task to add' })
    fireEvent.input(search, { target: { value: 'report' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(tasks_api.add_task).not.toHaveBeenCalled()
  })

  test('Enter in the search bar adds the typed task when nothing is found', async () => {
    const { tasks_api } = await show_app()

    const search = screen.getByRole('searchbox', { name: 'Search, or type a task to add' })
    fireEvent.input(search, { target: { value: 'Water the plants' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    await waitFor(() => expect(tasks_api.add_task).toHaveBeenCalledWith('Water the plants', null, [], null))
    expect(await screen.findByText('Water the plants')).toBeTruthy()
  })
})
