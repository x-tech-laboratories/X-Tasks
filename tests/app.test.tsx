// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

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

async function show_app(settings: Parameters<typeof install_fake_bridge>[0]['settings'] = {}, host: Parameters<typeof install_fake_bridge>[0]['host'] = 'desktop') {
  const bridge = install_fake_bridge({ tasks, tags, tag_groups: [group], settings: { launch_view: 'all', ...settings }, host })
  render(<App />)
  await screen.findByRole('heading', { name: 'All tasks' })
  // The page draws once its settings arrive, outside act, so its effects, such as the Shell setting the saved theme, settle before a test clicks.
  await act(async () => {})
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
// Board
// ============================================================================

describe('the board layout', () => {
  const board_card = (title: string) => within(screen.getByRole('grid', { name: 'Board' })).getByText(title).closest('li')!
  const board_cells = () => within(screen.getByRole('grid', { name: 'Board' })).getAllByRole('gridcell')

  // Starts a drag and lets the board take it up once the browser has pictured the card.
  async function drag_card(title: string): Promise<void> {
    fireEvent.dragStart(board_card(title), { dataTransfer: { setData: () => {} } })
    await act(() => new Promise((resolve) => setTimeout(resolve)))
  }

  test('moves every picked card dragged together into Done', async () => {
    const { tasks_api } = await show_app({ task_layout: 'board' })

    fireEvent.click(board_card('Buy milk'), { ctrlKey: true })
    fireEvent.click(board_card('Write report'), { ctrlKey: true })
    await drag_card('Buy milk')
    fireEvent.dragOver(board_cells()[1]!)
    fireEvent.drop(board_cells()[1]!)

    expect(tasks_api.set_task_done).toHaveBeenCalledWith('milk', true, expect.any(String), expect.anything())
    expect(tasks_api.set_task_done).toHaveBeenCalledWith('report', true, expect.any(String), expect.anything())
  })

  test('swaps the tag of a card moved between tag columns', async () => {
    const { tasks_api } = await show_app({ task_layout: 'board', task_grouping: 'group:context' })

    await drag_card('Buy milk')
    fireEvent.drop(board_cells()[1]!)

    expect(tasks_api.untag_task).toHaveBeenCalledWith('milk', 'home')
    expect(tasks_api.tag_task).toHaveBeenCalledWith('milk', 'work')
  })

  test('tags a card dropped on a tag in the sidebar', async () => {
    const { tasks_api } = await show_app({ task_layout: 'board' })

    await drag_card('Buy milk')
    const work_row = within(screen.getByRole('tree', { name: 'Tags' })).getByText('Work').closest('.tree-row')!
    fireEvent.dragOver(work_row, { dataTransfer: {} })
    fireEvent.drop(work_row, { dataTransfer: {} })

    expect(tasks_api.tag_task).toHaveBeenCalledWith('milk', 'work')
  })

  describe('on a phone-sized page', () => {
    const phone_query = (query: string) =>
      ({ matches: query.includes('max-width'), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList
    const phone_board = () => screen.getByRole('region', { name: 'Board' })
    const phone_card = (title: string) => within(phone_board()).getByText(title).closest('li')!
    const phone_column = (name: string) => within(phone_board()).getByRole('region', { name })

    afterEach(() => vi.restoreAllMocks())

    async function show_phone_board(settings: Parameters<typeof show_app>[0] = {}) {
      vi.spyOn(window, 'matchMedia').mockImplementation(phone_query)
      return show_app({ task_layout: 'board', ...settings })
    }

    async function drag_phone_card(title: string): Promise<void> {
      fireEvent.dragStart(phone_card(title), { dataTransfer: { setData: () => {} } })
      await act(() => new Promise((resolve) => setTimeout(resolve)))
    }

    test('stacks the columns and moves a card dragged onto another one', async () => {
      const { tasks_api } = await show_phone_board()

      expect(phone_card('Buy milk').draggable).toBe(true)
      await drag_phone_card('Buy milk')
      fireEvent.dragOver(phone_column('Done'))
      expect(phone_column('Done').className).toContain('drop-inside')
      fireEvent.drop(phone_column('Done'))

      expect(tasks_api.set_task_done).toHaveBeenCalledWith('milk', true, expect.any(String), expect.anything())
    })

    test('moves a card to the next column with Alt and the down arrow', async () => {
      const { tasks_api } = await show_phone_board({ task_grouping: 'group:context' })

      fireEvent.keyDown(phone_card('Buy milk'), { key: 'ArrowDown', altKey: true })

      expect(tasks_api.untag_task).toHaveBeenCalledWith('milk', 'home')
      expect(tasks_api.tag_task).toHaveBeenCalledWith('milk', 'work')
    })

    test('tags a card dropped on a tag in the sidebar', async () => {
      const { tasks_api } = await show_phone_board()

      await drag_phone_card('Buy milk')
      const work_row = within(screen.getByRole('tree', { name: 'Tags' })).getByText('Work').closest('.tree-row')!
      fireEvent.dragOver(work_row, { dataTransfer: {} })
      fireEvent.drop(work_row, { dataTransfer: {} })

      expect(tasks_api.tag_task).toHaveBeenCalledWith('milk', 'work')
    })
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

    await screen.findByText('Buy milk', { selector: '.task_title' })
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

  test('started with a task open, sits beside the search bar, ahead of the task details header', async () => {
    await show_app()
    fireEvent.click(screen.getByText('Buy milk'))
    const header = document.querySelector('.topbar > .side-pane-head')!
    expect(header).toBeTruthy()

    const row = screen.getAllByText('Buy milk').map((each) => each.closest('.task')).find(Boolean) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Start timer' }))

    const timer = await screen.findByRole('status', { name: 'Running timer' })
    expect(timer.parentElement).toBe(document.querySelector('.multibar')!.parentElement)
    expect(timer.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
// Reminders
// ============================================================================

describe('reminders of a task\'s own', () => {
  test('adds one from the task\'s details and removes it again', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Write report'))
    fireEvent.click(await screen.findByRole('button', { name: 'Add reminder' }))

    expect(tasks_api.set_task_reminders).toHaveBeenCalledWith('report', [expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)])
    fireEvent.click(screen.getByRole('button', { name: 'Remove reminder 1' }))
    expect(tasks_api.set_task_reminders).toHaveBeenLastCalledWith('report', [])
  })
})

// ============================================================================
// Focus mode
// ============================================================================

describe('focus mode', () => {
  test('shows one task from its details, with its subtasks, and runs a Pomodoro on it', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Write report'))
    fireEvent.click(await screen.findByRole('button', { name: 'Focus' }))

    const focus = screen.getByRole('dialog', { name: 'Write report' })
    expect(within(focus).getByRole('checkbox', { name: 'Outline' })).toBeTruthy()

    fireEvent.click(within(focus).getByRole('button', { name: 'Start Pomodoro' }))
    expect(await within(focus).findByText('Round 1')).toBeTruthy()
    expect(within(focus).getByText('25:00')).toBeTruthy()
    expect(tasks_api.start_timer).toHaveBeenCalledWith('report', expect.any(String))

    fireEvent.click(within(focus).getByRole('button', { name: 'Stop Pomodoro' }))
    expect(await within(focus).findByRole('button', { name: 'Start Pomodoro' })).toBeTruthy()
    expect(tasks_api.stop_pomodoro).toHaveBeenCalled()
  })

  test('in a browser, stops the timer and starts the break when a round ends', async () => {
    const { tasks_api } = await show_app({ pomodoro_work_minutes: 1 }, 'web')
    fireEvent.click(screen.getByText('Write report'))
    fireEvent.click(await screen.findByRole('button', { name: 'Focus' }))
    const focus = screen.getByRole('dialog', { name: 'Write report' })

    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
    try {
      fireEvent.click(within(focus).getByRole('button', { name: 'Start Pomodoro' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(within(focus).getByText('Round 1')).toBeTruthy()
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })

      expect(within(focus).getByText('Break')).toBeTruthy()
      expect(tasks_api.stop_timer).toHaveBeenCalledWith(expect.any(String), 'report')
      expect(screen.getByText(/Round 1 done\. Take 5m away from it\./)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  test('marking the task done ends focus mode', async () => {
    const { tasks_api } = await show_app()
    fireEvent.click(screen.getByText('Buy milk'))
    fireEvent.click(await screen.findByRole('button', { name: 'Focus' }))

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Buy milk' })).getByRole('button', { name: 'Mark as done' }))

    expect(screen.queryByRole('dialog', { name: 'Buy milk' })).toBeNull()
    expect(tasks_api.set_task_done).toHaveBeenCalledWith('milk', true, expect.any(String), expect.anything())
  })
})

// ============================================================================
// Break reminders
// ============================================================================

describe('break reminders', () => {
  test('in a browser, remind after the set minutes of work in a row, and stop every timer from the reminder', async () => {
    const started_at = new Date(Date.now() - 70 * 60_000).toISOString()
    const bridge = install_fake_bridge({ tasks, tags, tag_groups: [group], settings: { launch_view: 'all', break_reminder_minutes: 60 }, host: 'web' })
    bridge.tasks_api.list_time_entries.mockResolvedValue([{ id: 'entry', task_id: 'report', started_at, ended_at: null }])
    render(<App />)

    expect(await screen.findByText('You have worked 1h 10m without a break.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Take a break' }))

    expect(bridge.tasks_api.stop_timer).toHaveBeenCalledWith(expect.any(String), null)
    expect(screen.queryByRole('status', { name: 'Running timer' })).toBeNull()
  })

  test('stay quiet while turned off', async () => {
    const started_at = new Date(Date.now() - 70 * 60_000).toISOString()
    const bridge = install_fake_bridge({ tasks, tags, tag_groups: [group], settings: { launch_view: 'all' } })
    bridge.tasks_api.list_time_entries.mockResolvedValue([{ id: 'entry', task_id: 'report', started_at, ended_at: null }])
    render(<App />)

    await screen.findByRole('status', { name: 'Running timer' })
    expect(screen.queryByText(/without a break/)).toBeNull()
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
// Task details
// ============================================================================

describe('the task details', () => {
  test('open in the side pane, with the checkbox and editable title in the top bar, and close by button or Escape', async () => {
    const { tasks_api } = await show_app()

    fireEvent.click(screen.getByText('Buy milk'))
    const head = document.querySelector('.topbar > .side-pane-head') as HTMLElement
    const title = within(head).getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    expect(title.value).toBe('Buy milk')
    expect(within(head).getByRole('checkbox', { name: 'Mark as done' })).toBeTruthy()

    fireEvent.change(title, { target: { value: 'Buy oat milk' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    fireEvent.blur(title)
    await waitFor(() => expect(tasks_api.set_task_title).toHaveBeenCalledWith('milk', 'Buy oat milk'))

    fireEvent.click(within(head).getByRole('button', { name: 'Close details' }))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull())
    expect(document.querySelector('main.task_main')!.classList.contains('with-side-pane')).toBe(true)

    fireEvent.click(screen.getAllByText('Write report')[0]!)
    const details = await screen.findByRole('complementary', { name: 'Task details' })
    fireEvent.keyDown(within(details).getByRole('button', { name: 'Delete' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull())
  })

  test('resizing the pane by keyboard saves its width as the synced setting', async () => {
    const { settings_api } = await show_app({ detail_width: 400 })

    fireEvent.click(screen.getByText('Buy milk'))
    const handle = await screen.findByRole('separator', { name: 'Resize task details' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })

    await waitFor(() => expect(settings_api.set_setting).toHaveBeenCalledWith('detail_width', expect.any(Number)))
    const width = (settings_api.set_setting.mock.calls.find(([key]: unknown[]) => key === 'detail_width') as unknown[])[1] as number
    expect(width).toBeGreaterThan(400)
  })

  test("the Parent field moves a task under another one or to the top level, but never under itself", async () => {
    const { tasks_api } = await show_app()

    fireEvent.click(screen.getByText('Outline'))
    const details = await screen.findByRole('complementary', { name: 'Task details' })
    const parent = within(details).getByRole('combobox', { name: 'Parent' }) as HTMLSelectElement
    expect(parent.value).toBe('report')
    expect((within(parent).getByRole('option', { name: /Outline/ }) as HTMLOptionElement).disabled).toBe(true)

    fireEvent.change(parent, { target: { value: 'milk' } })
    await waitFor(() => expect(tasks_api.move_task).toHaveBeenLastCalledWith('outline', 'milk', 2))
    expect(parent.value).toBe('milk')

    fireEvent.change(parent, { target: { value: '' } })
    await waitFor(() => expect(tasks_api.move_task).toHaveBeenLastCalledWith('outline', null, expect.any(Number)))
    expect(parent.value).toBe('')
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

    await screen.findByText('Buy milk', { selector: '.task_title' })
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
