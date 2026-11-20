// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ContextMenus } from '@x-tech-laboratories/x-libs/web/react/menus'
import { DEFAULT_SETTINGS } from '../src/shared/settings.ts'
import type { Tag, Task } from '../src/shared/tasks.ts'
import { BoardView, DONE_COLUMN, NO_TAG_COLUMN, OPEN_COLUMN, date_columns, status_columns, tag_columns, type BoardColumn } from '../src/web/BoardView.tsx'
import { shown_ranges } from '../src/web/dates.ts'
import type { TaskActions } from '../src/web/TaskItem.tsx'
import type { TaskNode } from '../src/web/views.ts'
import { make_group, make_tag, make_task } from './fixtures.ts'

afterEach(cleanup)

// ============================================================================
// Setup
// ============================================================================

const NOW = '2026-11-11T14:30'
const RANGES = shown_ranges(DEFAULT_SETTINGS.date_ranges, NOW)

const projects = make_group({ id: 'projects', name: 'Project' })
const filters = make_group({ id: 'filters', name: 'Filter', is_rule: true })
const kitchen = make_tag({ id: 'kitchen', group_id: 'projects', name: 'Kitchen', color: '#e8a33d', icon: '🔨' })
const garden = make_tag({ id: 'garden', group_id: 'projects', name: 'Garden' })
const home = make_tag({ id: 'home', group_id: 'area', name: 'Home', color: '#3fb27f' })
const urgent = make_tag({ id: 'urgent', group_id: 'filters', name: 'Urgent' })
const tags = [kitchen, garden, home, urgent]

const node_of = (task: Task, children: TaskNode[] = []): TaskNode => ({ task, children })
const tags_of = (task: Task): Tag[] => tags.filter((tag) => task.tag_ids.includes(tag.id))

function make_actions(fields: Partial<TaskActions> = {}): TaskActions {
  return {
    tags, tag_groups: [projects, filters], tint_rows: false, date_field: 'due', can_add_subtasks: true, selected_task_id: null,
    on_select: vi.fn(), is_picking: false, is_picked: () => false, on_pick: vi.fn(), on_pick_range: vi.fn(), on_bulk_menu: vi.fn(),
    drag_count_of: () => 1, is_dragging_picked: false, on_toggle: vi.fn(), on_reschedule: vi.fn(), is_in_my_day: () => false,
    on_set_my_day: vi.fn(), on_remove: vi.fn(), on_add_subtask: vi.fn(), is_collapsed: () => false, on_set_collapsed: vi.fn(),
    on_untag: vi.fn(), rule_tags_of: () => [], streak_of: () => null, history_of: () => [], last_done_of: () => null,
    on_drag_start: vi.fn(), on_drag_end: vi.fn(), can_drop_on: () => false, can_drop_beside: false, on_drop: vi.fn(),
    is_timing: () => false, spent_seconds_of: () => 0, on_start_timer: vi.fn(), on_focus: vi.fn(), on_stop_timer: vi.fn(),
    ...fields
  }
}

function show_board(columns: BoardColumn[], actions = make_actions(), on_move = vi.fn(), column_group_id: string | null = null) {
  render(
    <>
      <ContextMenus />
      <BoardView columns={columns} actions={actions} column_group_id={column_group_id} open_dependency_count={() => 0} on_move={on_move} />
    </>
  )
  return { actions, on_move }
}

const card_of = (title: string) => screen.getByText(title).closest('li')!
const cells = () => screen.getAllByRole('gridcell')
const heads = () => screen.getAllByRole('columnheader')

// Starts a drag and lets the board take it up once the browser has pictured the card.
async function start_drag(card: HTMLElement, data_transfer = { setData: vi.fn() }): Promise<void> {
  fireEvent.dragStart(card, { dataTransfer: data_transfer })
  await act(() => new Promise((resolve) => setTimeout(resolve)))
}

// ============================================================================
// Columns
// ============================================================================

describe('tag_columns', () => {
  test('gives every tag of the group a column, puts a task under each tag it holds, and the untagged last', () => {
    const both = make_task({ id: 'both', tag_ids: ['kitchen', 'garden'] })
    const none = make_task({ id: 'none' })

    const columns = tag_columns([node_of(both), node_of(none)], projects, tags, tags_of)

    expect(columns.map((column) => [column.id, column.label, column.nodes.map((node) => node.task.id), column.accepts_drop])).toEqual([
      ['kitchen', '🔨 Kitchen', ['both'], true],
      ['garden', 'Garden', ['both'], true],
      [NO_TAG_COLUMN, 'No Project', ['none'], true]
    ])
  })

  test('refuses drops when the group is a filter group', () => {
    const columns = tag_columns([], filters, tags, tags_of)

    expect(columns.every((column) => !column.accepts_drop)).toBe(true)
  })
})

describe('date_columns', () => {
  test('takes drops only on columns for a single day, and keys those by the day', () => {
    const late = make_task({ id: 'late', due_at: '2026-11-01' })
    const today = make_task({ id: 'today', due_at: '2026-11-11' })
    const undated = make_task({ id: 'undated' })

    const columns = date_columns([late, today, undated].map((task) => node_of(task)), 'due', NOW, false, RANGES)

    const overdue = columns.find((column) => column.id === 'overdue')!
    const today_column = columns.find((column) => column.nodes.some((node) => node.task.id === 'today'))!
    expect(overdue.accepts_drop).toBe(false)
    expect(today_column.id).toBe('2026-11-11')
    expect(today_column.accepts_drop).toBe(true)
  })
})

describe('status_columns', () => {
  test('splits open tasks from done ones, both taking drops', () => {
    const columns = status_columns([node_of(make_task({ id: 'a' })), node_of(make_task({ id: 'b', is_done: true }))])

    expect(columns.map((column) => [column.id, column.label, column.nodes.map((node) => node.task.id), column.accepts_drop])).toEqual([
      [OPEN_COLUMN, 'To do', ['a'], true],
      [DONE_COLUMN, 'Done', ['b'], true]
    ])
  })
})

// ============================================================================
// Board
// ============================================================================

describe('BoardView', () => {
  test('heads each column with its label and count, the overdue one in the bad tone', () => {
    const late = make_task({ id: 'late', title: 'Pay the bill', due_at: '2026-11-01' })
    show_board(date_columns([node_of(late)], 'due', NOW, false, RANGES))

    const head = heads()[0]!
    expect(head.textContent).toContain('Overdue')
    expect(head.textContent).toContain('1')
    expect(head.className).toContain('tone-bad')
  })

  test('leaves other column heads untoned', () => {
    show_board(status_columns([node_of(make_task({ id: 'a' }))]))

    expect(heads().map((head) => head.className.includes('tone-bad'))).toEqual([false, false])
  })

  test('draws a card with its checkbox, title, date, marks, subtasks and chips, leaving out the column group', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink', due_at: '2026-11-11', recurrence: 'every day', notes: 'Some', tag_ids: ['kitchen', 'home'] })
    const child = make_task({ id: 'child', parent_id: 'a', is_done: true })
    show_board(tag_columns([node_of(task, [node_of(child)])], projects, tags, tags_of), make_actions(), vi.fn(), 'projects')

    const card = within(card_of('Fit the sink'))
    expect(card.getByRole('checkbox', { name: 'Mark as done' })).toBeTruthy()
    expect(card.getByTitle('Repeats')).toBeTruthy()
    expect(card.getByTitle('Has notes')).toBeTruthy()
    expect(card.getByTitle('Subtasks done').textContent).toBe('1/1')
    expect(card.getByText('Home')).toBeTruthy()
    expect(card.queryByText('Kitchen')).toBeNull()
  })

  test('ticks a task from its checkbox without opening it', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]))

    fireEvent.click(within(card_of('Fit the sink')).getByRole('checkbox'))

    expect(actions.on_toggle).toHaveBeenCalledWith(task)
    expect(actions.on_select).not.toHaveBeenCalled()
  })

  test('marks done, selected and picked cards', () => {
    const done = make_task({ id: 'done', title: 'Done one', is_done: true })
    const selected = make_task({ id: 'selected', title: 'Selected one' })
    const picked = make_task({ id: 'picked', title: 'Picked one' })
    show_board(status_columns([done, selected, picked].map((task) => node_of(task))), make_actions({ selected_task_id: 'selected', is_picked: (task) => task.id === 'picked' }))

    expect(card_of('Done one').className).toContain('is_done')
    expect(card_of('Selected one').className).toContain('selected')
    expect(card_of('Picked one').className).toContain('picked')
    expect(card_of('Selected one').className).not.toContain('is_done')
  })

  test('tints a card by its first coloured tag only when rows are tinted', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink', tag_ids: ['home'] })
    show_board(status_columns([node_of(task)]), make_actions({ tint_rows: true }))

    const card = card_of('Fit the sink')
    expect(card.className).toContain('has-tint')
    expect(card.style.getPropertyValue('--item-color')).toBe('#3fb27f')
  })

  test('leaves a card plain when rows are not tinted', () => {
    show_board(status_columns([node_of(make_task({ id: 'a', title: 'Fit the sink', tag_ids: ['home'] }))]))

    const card = card_of('Fit the sink')
    expect(card.className).not.toContain('has-tint')
    expect(card.style.getPropertyValue('--item-color')).toBe('')
  })

  test('opens a card on a click, and picks it with Ctrl or Shift', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]))

    fireEvent.click(card_of('Fit the sink'))
    fireEvent.click(card_of('Fit the sink'), { ctrlKey: true })
    fireEvent.click(card_of('Fit the sink'), { shiftKey: true })

    expect(actions.on_select).toHaveBeenCalledWith(task)
    expect(actions.on_pick).toHaveBeenCalledWith(task, true)
    expect(actions.on_pick_range).toHaveBeenCalledWith(task)
  })

  test('opens a card with Enter', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]))

    fireEvent.keyDown(card_of('Fit the sink'), { key: 'Enter' })

    expect(actions.on_select).toHaveBeenCalledWith(task)
  })

  test("opens a task's own menu on a right-click", async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]))

    fireEvent.contextMenu(card_of('Fit the sink'))
    fireEvent.click(await screen.findByText('Open details'))

    expect(actions.on_select).toHaveBeenCalledWith(task)
  })

  test('opens the bulk menu on a right-click of a picked card', () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]), make_actions({ is_picked: () => true }))

    fireEvent.contextMenu(card_of('Fit the sink'))

    expect(actions.on_bulk_menu).toHaveBeenCalled()
  })

  test('tells the app a task is dragged, naming it for drops outside the board, and when the drag ends', async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { actions } = show_board(status_columns([node_of(task)]))
    const set_data = vi.fn()

    await start_drag(card_of('Fit the sink'), { setData: set_data })
    fireEvent.dragEnd(card_of('Fit the sink'))

    expect(set_data).toHaveBeenLastCalledWith('text/plain', 'Fit the sink')
    expect(actions.on_drag_start).toHaveBeenCalledWith(task)
    expect(actions.on_drag_end).toHaveBeenCalled()
  })

  test('moves a card dropped on another column that takes drops', async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { on_move } = show_board(status_columns([node_of(task)]))

    await start_drag(card_of('Fit the sink'))
    fireEvent.dragOver(cells()[1]!)
    expect(cells()[1]!.className).toContain('drop-inside')
    fireEvent.drop(cells()[1]!)

    expect(on_move).toHaveBeenCalledWith(task, OPEN_COLUMN, DONE_COLUMN)
  })

  test('refuses a drop on the column the card came from', async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink' })
    const { on_move } = show_board(status_columns([node_of(task)]))

    await start_drag(card_of('Fit the sink'))
    fireEvent.dragOver(cells()[0]!)
    fireEvent.drop(cells()[0]!)

    expect(cells()[0]!.className).not.toContain('drop-inside')
    expect(on_move).not.toHaveBeenCalled()
  })

  test('refuses a drop on a column that takes none, such as overdue', async () => {
    const late = make_task({ id: 'late', due_at: '2026-11-01' })
    const today = make_task({ id: 'today', title: 'Water the plants', due_at: '2026-11-11' })
    const columns = date_columns([node_of(late), node_of(today)], 'due', NOW, false, RANGES)
    const { on_move } = show_board(columns)
    const overdue_cell = cells()[columns.findIndex((column) => column.id === 'overdue')]!

    await start_drag(card_of('Water the plants'))
    fireEvent.dragOver(overdue_cell)
    fireEvent.drop(overdue_cell)

    expect(overdue_cell.className).not.toContain('drop-inside')
    expect(on_move).not.toHaveBeenCalled()
  })

  test('moves a card between tag columns by their tag ids', async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink', tag_ids: ['kitchen'] })
    const { on_move } = show_board(tag_columns([node_of(task)], projects, tags, tags_of), make_actions(), vi.fn(), 'projects')

    await start_drag(card_of('Fit the sink'))
    fireEvent.drop(cells()[2]!)

    expect(on_move).toHaveBeenCalledWith(task, 'kitchen', NO_TAG_COLUMN)
  })

  test('refuses every drop between columns of a filter group', async () => {
    const task = make_task({ id: 'a', title: 'Fit the sink', tag_ids: ['urgent'] })
    const { on_move } = show_board(tag_columns([node_of(task)], filters, tags, tags_of), make_actions(), vi.fn(), 'filters')

    await start_drag(card_of('Fit the sink'))
    fireEvent.dragOver(cells()[1]!)
    fireEvent.drop(cells()[1]!)

    expect(on_move).not.toHaveBeenCalled()
  })

  test('moves a card to a day column with Alt and an arrow', () => {
    const today = make_task({ id: 'today', title: 'Water the plants', due_at: '2026-11-11' })
    const tomorrow = make_task({ id: 'tomorrow', due_at: '2026-11-12' })
    const columns = date_columns([node_of(today), node_of(tomorrow)], 'due', NOW, false, RANGES)
    const next_day = columns.slice(1).find((column) => column.accepts_drop)!
    const { on_move } = show_board(columns)

    fireEvent.keyDown(card_of('Water the plants'), { key: 'ArrowRight', altKey: true })

    expect(columns[0]!.id).toBe('2026-11-11')
    expect(on_move).toHaveBeenCalledWith(today, '2026-11-11', next_day.id)
  })
})
