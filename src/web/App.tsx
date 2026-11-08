import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { theme_choice, type Theme } from '@x-tech-laboratories/x-libs/web/theme'
import { SearchBox, Segmented } from '@x-tech-laboratories/x-libs/web/react/controls'
import { PageHeading, SelectionBar } from '@x-tech-laboratories/x-libs/web/react/layout'
import { open_context_menu, type MenuItem } from '@x-tech-laboratories/x-libs/web/react/menus'
import { use_shortcuts } from '@x-tech-laboratories/x-libs/web/react/shortcuts'
import { toggled, with_range } from '@x-tech-laboratories/x-libs/web/selection'
import { use_now } from '@x-tech-laboratories/x-libs/web/react/time'
import { Shell } from '@x-tech-laboratories/x-libs/web/react/shell'
import { ResizeHandle } from '@x-tech-laboratories/x-libs/web/react/split'
import { undoable, type Undoable } from '@x-tech-laboratories/x-libs/web/react/toasts'
import { DEFAULT_SETTINGS, DETAIL_WIDTH_RANGE, SIDEBAR_WIDTH_RANGE, type Settings, type TaskGrouping, type TaskRelationship, type ViewLayout } from '@shared/settings'
import { EMPTY_RULE, can_link, waits_on_by_task, type Completion, type CompletionLogChange, type Tag, type TagGroup, type TagRule, type Task, type TaskSchedule } from '@shared/tasks'
import { completions_after, task_history, task_streak, type RoutineStreak } from '@shared/streaks'
import { BACK_EVENT } from './back_navigation'
import { BoardView, DONE_COLUMN, NO_TAG_COLUMN, OPEN_COLUMN, date_columns, status_columns, tag_columns } from './BoardView'
import { CalendarView } from './CalendarView'
import { ReportsPage } from './ReportsPage'
import { ReschedulePopup } from './ReschedulePopup'
import { UntrustedCertificatePrompt } from './CertificateDialog'
import { FilterDialog } from './FilterDialog'
import { GANTT_SCALE_CHOICES, GanttView } from './GanttView'
import { TASK_LAYOUT_CHOICES, is_same_layout, saved_layout, with_view_layout } from './layouts'
import { AddTaskRow, SyntaxPreview } from './SyntaxHelp'
import { query_matches, syntax_by_id, type SyntaxContext } from './syntax'
import { GroupDialog } from './GroupDialog'
import { SettingsPage } from './SettingsPage'
import { Sidebar, SidebarFoot } from './Sidebar'
import { TaskDetail } from './TaskDetail'
import { ordered_detail_sections } from './detail_sections'
import { RepeatItem, TaskItem, type TaskActions } from './TaskItem'
import { TaskTable } from './TaskTable'
import { coming_repeats, group_by_date } from './dates'
import { group_by_tag, grouping_choices, grouping_tag_group, saved_grouping, view_key, with_view_grouping } from './grouping'
import { format_local, parse_local } from '@x-tech-laboratories/x-libs/dates'
import { next_schedule, overdue_repeat_schedule, recurrence_anchor, rescheduled, task_date_of, with_recurrence } from '@shared/schedule'
import {
  EMPTY_TABLE_FILTERS, has_table_filters, ordered_columns, sort_task_tree, tag_ranks, task_passes_filters, without_column_filter, type LastDoneOf, type SortContext, type StreakOf,
  type TableColumn, type TableFilters
} from './table'
import { by_position, children_of, in_tree_order, moves_for_drop, subtree_ids, type DropPlacement, type TreeMove } from '@x-tech-laboratories/x-libs/web/tree'
import {
  comes_due_between, falls_after_today, is_due_by, is_in_my_day, launch_view, my_day_for_new_task, my_day_since, nest_tasks, rule_tags_of, tag_ids_for_new_task, tag_path, task_is_in_view, view_from_address, view_title, view_with_tag_toggled, view_without_tags, type TaskNode, type View
} from './views'

// ============================================================================
// Choices
// ============================================================================

// A phone's keyboard covers half the screen, so the search box only takes focus at launch where there is a mouse.
const IS_TOUCH_SCREEN = window.matchMedia('(pointer: coarse)').matches

// Removed tasks wait this long before the database deletes them, so the removal can be undone.
const UNDO_DELAY_MS = 8000

// ============================================================================
// App
// ============================================================================

// The tag open in the filter dialog: an existing one, or a new rule tag about to be added at a spot in a group.
type FilterEditing = { tag: Tag } | { group_id: string; parent_id: string | null }

// Tasks taken off the screen but not yet deleted, everything under them included, and the toast that deletes them unless undone.
type PendingRemoval = { tasks: Task[]; toast: Undoable }

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [completions, set_completions] = useState<Completion[]>([])
  const [has_loaded_tasks, set_has_loaded_tasks] = useState(false)
  const [tag_groups, set_tag_groups] = useState<TagGroup[]>([])
  const [tags, set_tags] = useState<Tag[]>([])
  const [settings, set_settings] = useState<Settings | null>(null)
  const [selected_view, set_selected_view] = useState<View>({ kind: 'all' })
  const [is_settings_open, set_is_settings_open] = useState(false)
  // On a phone the sidebar is a drawer over the tasks, open only while this is set.
  const [is_sidebar_open, set_is_sidebar_open] = useState(false)
  const [multibar_text, set_multibar_text] = useState('')
  const [dragged_task, set_dragged_task] = useState<Task | null>(null)
  const [selected_task_id, set_selected_task_id] = useState<string | null>(null)
  // Tasks picked for a bulk action, apart from the one whose details are open.
  const [picked_task_ids, set_picked_task_ids] = useState<string[]>([])
  // The row a Shift+click picks from: the last one picked or opened.
  const pick_anchor_id = useRef<string | null>(null)
  // The rows on screen in order, for the shortcut that picks them all.
  const shown_rows_ref = useRef<Task[]>([])
  const [rescheduling_task_ids, set_rescheduling_task_ids] = useState<string[]>([])
  // The clock, read again every minute, so tasks turn overdue as their time passes and My Day takes in tasks as they come due.
  const now = format_local(use_now(), true)
  const today = now.slice(0, 10)
  const [filter_editing, set_filter_editing] = useState<FilterEditing | null>(null)
  const [editing_group, set_editing_group] = useState<TagGroup | null>(null)
  const [table_filters, set_table_filters] = useState<TableFilters>(EMPTY_TABLE_FILTERS)
  // Groupings picked in a view but not yet saved for it, kept until the app closes.
  const [unsaved_groupings, set_unsaved_groupings] = useState<Record<string, TaskGrouping>>({})
  // Layouts picked in a view but not yet saved for it, the same way.
  const [unsaved_layouts, set_unsaved_layouts] = useState<Record<string, ViewLayout>>({})
  const pending_removal = useRef<PendingRemoval | null>(null)

  // The theme is a setting, so it follows the database and syncs with it.
  const settings_ref = useRef(settings)
  settings_ref.current = settings
  const theme = useMemo(
    () => theme_choice({ read: () => settings_ref.current?.theme, write: (chosen: Theme) => void change_setting('theme', chosen) }),
    []
  )

  // Tasks waiting to be deleted stay hidden when the list is fetched again.
  function without_pending(loaded_tasks: Task[]): Task[] {
    const pending_ids = new Set(pending_removal.current?.tasks.map((task) => task.id))
    return loaded_tasks.filter((task) => !pending_ids.has(task.id))
  }

  useEffect(() => {
    void window.x_tasks.list_tasks().then((loaded_tasks) => {
      set_tasks(without_pending(loaded_tasks))
      set_has_loaded_tasks(true)
    })
    void window.x_tasks.list_completions().then(set_completions)
    void window.x_tasks.list_tag_groups().then(set_tag_groups)
    void Promise.all([window.x_tasks.list_tags(), window.x_settings.get_settings()]).then(([loaded_tags, loaded_settings]) => {
      set_tags(loaded_tags)
      set_selected_view(view_from_address(window.location.search, loaded_tags) ?? launch_view(loaded_settings, loaded_tags))
      // A main process older than this screen leaves out newer settings, so their defaults fill the gaps.
      set_settings({ ...DEFAULT_SETTINGS, ...loaded_settings })
    })
  }, [])

  // Fetches everything again when another program changes the database, so its edits show without a restart.
  useEffect(
    () =>
      window.x_tasks.on_database_changed(() => {
        void window.x_tasks.list_tasks().then((loaded_tasks) => set_tasks(without_pending(loaded_tasks)))
        void window.x_tasks.list_completions().then(set_completions)
        void window.x_tasks.list_tag_groups().then(set_tag_groups)
        void window.x_tasks.list_tags().then(set_tags)
      }),
    []
  )

  // A task link clicked in another program opens that task's details over whatever is on screen.
  useEffect(
    () =>
      window.x_tasks.on_open_task?.((task_id) => {
        set_is_settings_open(false)
        set_is_sidebar_open(false)
        set_selected_task_id(task_id)
      }),
    []
  )

  // Puts each task into My Day when its date and time arrive, once only, so ones taken out by hand stay out.
  useEffect(() => {
    if (!has_loaded_tasks || !settings?.add_due_to_my_day || settings.due_added_to_my_day_until === now) return
    const shown_since = my_day_since(settings, today)
    for (const task of tasks) {
      if (comes_due_between(task, settings.due_added_to_my_day_until, now, settings.task_date_field) && !is_in_my_day(task, shown_since)) set_task_my_day(task, today)
    }
    void change_setting('due_added_to_my_day_until', now)
  }, [has_loaded_tasks, settings?.add_due_to_my_day, now])

  // Moves repeating tasks left from earlier days to today or their next date, when the app opens and as each day begins.
  useEffect(() => {
    if (!has_loaded_tasks || !settings || settings.reschedule_overdue_repeats === 'off') return
    for (const task of tasks) {
      const schedule = overdue_repeat_schedule(task, settings.reschedule_overdue_repeats, settings.task_date_field)
      if (schedule) set_task_schedule(task, schedule)
    }
  }, [has_loaded_tasks, settings?.reschedule_overdue_repeats, settings?.task_date_field, today])


  // Closing the app deletes any tasks still waiting.
  useEffect(() => {
    window.addEventListener('beforeunload', finish_removal)
    return () => window.removeEventListener('beforeunload', finish_removal)
  }, [])

  // Outside text fields, menus and dialogs: Ctrl+Z undoes the last removal, Escape lets go of the picked tasks, and Ctrl+A picks every row on screen.
  use_shortcuts([
    { keys: 'mod+z', run: undo_removal },
    ...(picked_task_ids.length > 0 ? [{ keys: 'escape', run: () => set_picked_task_ids([]) }] : []),
    {
      keys: 'mod+a',
      keep_default: shown_rows_ref.current.length === 0,
      run: () => {
        if (shown_rows_ref.current.length === 0) return
        set_picked_task_ids(shown_rows_ref.current.map((task) => task.id))
        set_selected_task_id(null)
      }
    }
  ])

  // ==========================================================================
  // Navigation and settings
  // ==========================================================================

  // The chosen view is saved so the next launch can reopen it.
  function select_view(view: View): void {
    set_selected_view(view)
    set_picked_task_ids([])
    set_is_settings_open(false)
    set_is_sidebar_open(false)
    void window.x_settings.set_setting('last_view', view)
  }

  // The phone's Back button closes whatever sits on top, from a menu down to Settings, as Android apps do.
  useEffect(() => {
    const step_back = (event: Event): void => {
      const open_menu = document.querySelector<HTMLElement>('[popover]:popover-open')
      if (open_menu) open_menu.hidePopover()
      else if (rescheduling_task_ids.length > 0) set_rescheduling_task_ids([])
      else if (filter_editing) set_filter_editing(null)
      else if (editing_group) set_editing_group(null)
      else if (picked_task_ids.length > 0) set_picked_task_ids([])
      else if (selected_task_id) set_selected_task_id(null)
      else if (is_sidebar_open) set_is_sidebar_open(false)
      else if (is_settings_open) set_is_settings_open(false)
      else return
      event.preventDefault()
    }
    window.addEventListener(BACK_EVENT, step_back)
    return () => window.removeEventListener(BACK_EVENT, step_back)
  }, [rescheduling_task_ids, filter_editing, editing_group, picked_task_ids, selected_task_id, is_sidebar_open, is_settings_open])


  // Changes a setting on screen only, as a panel does while its edge is being dragged.
  function show_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): void {
    set_settings((current_settings) => current_settings && { ...current_settings, [key]: value })
  }

  async function change_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): Promise<void> {
    show_setting(key, value)
    if (key === 'theme') theme.apply(value as Theme)
    await window.x_settings.set_setting(key, value)
  }

  // Ids of tasks deleted since are dropped whenever the list is saved again.
  function set_task_collapsed(task: Task, is_collapsed: boolean): void {
    const other_ids = settings!.collapsed_task_ids.filter((id) => id !== task.id && tasks.some((each_task) => each_task.id === id))
    void change_setting('collapsed_task_ids', is_collapsed ? [...other_ids, task.id] : other_ids)
  }

  // Collapses or expands every given task at once, keeping the saved state of the rest.
  function set_tasks_collapsed(task_ids: string[], is_collapsed: boolean): void {
    const other_ids = settings!.collapsed_task_ids.filter((id) => !task_ids.includes(id) && tasks.some((each_task) => each_task.id === id))
    void change_setting('collapsed_task_ids', is_collapsed ? [...other_ids, ...task_ids] : other_ids)
  }

  // ==========================================================================
  // Task changes
  // ==========================================================================

  // Typing in the multibar brings back a task list, so its matches show from the settings or reports page.
  function change_multibar_text(text: string): void {
    set_multibar_text(text)
    if (!text.trim()) return
    if (is_settings_open) set_is_settings_open(false)
    if (selected_view.kind === 'reports') select_view({ kind: 'all' })
  }

  // The names and relative dates the multibar's syntaxes read text against.
  function syntax_context(): SyntaxContext {
    return { tags, tag_groups, date_field: settings!.task_date_field, now: new Date() }
  }

  // Enter only searches; the Add task row under the bar adds what was typed. The Completed view takes no new tasks, and text that is all tags and dates adds nothing.
  async function add_typed_task(): Promise<void> {
    const text = multibar_text.trim()
    if (!text || selected_view.kind === 'completed') return
    const typed = syntax_by_id(settings!.quick_add_syntax).parse_quick_add(text, syntax_context())
    if (!typed.title) return

    const tag_ids = with_typed_tag_ids(tag_ids_for_new_task(selected_view, tags, tag_groups), typed.tag_ids, tags, tag_groups)
    const added_task = await window.x_tasks.add_task(typed.title, null, tag_ids, my_day_for_new_task(selected_view, today))
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_multibar_text('')
    if (typed.start_at || typed.due_at || typed.recurrence) {
      return set_task_schedule(added_task, with_recurrence({ start_at: typed.start_at, due_at: typed.due_at, recurrence: '' }, typed.recurrence, undefined, settings!.task_date_field))
    }
    // Upcoming shows only dated tasks, so one added there is dated today.
    if (selected_view.kind === 'upcoming') {
      const schedule = { start_at: added_task.start_at, due_at: added_task.due_at, recurrence: added_task.recurrence }
      set_task_schedule(added_task, settings!.task_date_field === 'start' ? { ...schedule, start_at: today } : { ...schedule, due_at: today })
    }
  }

  // A subtask shows wherever its parent does, so it starts with the parent's tags only when the settings say so.
  async function add_subtask(parent: Task, title: string): Promise<void> {
    const added_task = await window.x_tasks.add_task(title, parent.id, settings?.subtasks_inherit_tags ? parent.tag_ids : [], null)
    set_tasks((current_tasks) => [...current_tasks, added_task])
  }

  // A task given a date that has already come goes into My Day, and one moved past today leaves it, as the settings choose.
  function set_task_schedule(task: Task, schedule: TaskSchedule): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, ...schedule } : each)))
    void window.x_tasks.set_task_schedule(task.id, schedule)
    if (!settings) return

    const scheduled_task = { ...task, ...schedule }
    const is_in_today = is_in_my_day(task, my_day_since(settings, today))
    const date_moved = task_date_of(scheduled_task, settings.task_date_field) !== task_date_of(task, settings.task_date_field)
    if (is_in_today && settings.remove_future_from_my_day && date_moved && falls_after_today(scheduled_task, today, settings.task_date_field)) return set_task_my_day(task, null)
    if (!is_in_today && settings.add_due_to_my_day && is_due_by(scheduled_task, now, settings.task_date_field)) set_task_my_day(task, today)
  }

  // Completing a task completes its subtasks; a recurring one moves to its next occurrence and resets its subtasks instead.
  function toggle_task(task: Task): void {
    if (task.is_done) return save_task_done(task, false, null, { kind: 'remove' })

    const done_at = new Date().toISOString()
    const log_change: CompletionLogChange = { kind: 'add', occurrence_on: recurrence_anchor(task, settings?.task_date_field ?? 'due') }
    // A completed top-level task can leave My Day, as the settings choose.
    const leaves_my_day = Boolean(settings?.remove_done_from_my_day) && task.parent_id === null && task.my_day_on !== null
    if (leaves_my_day) set_task_my_day(task, null)
    const next = next_schedule(task, settings?.task_date_field ?? 'due')
    if (next) {
      // A next occurrence that is already due goes back into My Day.
      set_task_schedule(leaves_my_day ? { ...task, my_day_on: null } : task, next)
      save_task_done(task, false, done_at, log_change)
      return reset_subtasks(task)
    }

    save_task_done(task, true, done_at, log_change)
    complete_subtasks(task)
  }

  // Ticks a task by hand, folding its subtasks away when that finishes its whole branch and the settings say to.
  function tick_task(task: Task): void {
    collapse_finished_branches([task])
    toggle_task(task)
  }

  // Collapses each task about to be completed whose subtasks will all be done too, leaving every other task as it was.
  function collapse_finished_branches(ticked_tasks: Task[]): void {
    if (!settings?.collapse_completed_branches) return
    const finished_ids = ticked_tasks.filter((task) => !task.is_done && finishes_branch(task)).map((task) => task.id)
    if (finished_ids.length > 0) set_tasks_collapsed(finished_ids, true)
  }

  // A repeating task or subtask moves to its next date instead of staying done, so its branch never finishes.
  function finishes_branch(task: Task): boolean {
    const branch_ids = subtree_ids(task.id, tasks)
    if (branch_ids.size === 1) return false
    return tasks.every((each) => !branch_ids.has(each.id) || (each.id !== task.id && each.is_done) || next_schedule(each, settings?.task_date_field ?? 'due') === null)
  }

  function save_task_done(task: Task, is_done: boolean, done_at: string | null, log_change: CompletionLogChange): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, is_done, done_at } : each)))
    set_completions((current_completions) => completions_after(current_completions, task.id, done_at, log_change))
    void window.x_tasks.set_task_done(task.id, is_done, done_at, log_change)
  }

  // Each open subtask is completed as if ticked by hand, so a recurring one moves to its next date instead.
  function complete_subtasks(task: Task): void {
    for (const child of children_of(task.id, tasks)) if (!child.is_done) toggle_task(child)
  }

  // Subtasks reset by a recurring parent keep the time they were last done, and their ticks stay in the log.
  function reset_subtasks(task: Task): void {
    const subtask_ids = subtree_ids(task.id, tasks)
    subtask_ids.delete(task.id)
    for (const each of tasks) if (subtask_ids.has(each.id) && each.is_done) save_task_done(each, false, each.done_at, { kind: 'none' })
  }

  function set_task_my_day(task: Task, my_day_on: string | null): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, my_day_on } : each)))
    void window.x_tasks.set_task_my_day(task.id, my_day_on)
  }

  // Takes every task out of My Day, including ones left from earlier days.
  function clear_my_day(): void {
    for (const task of tasks) if (task.my_day_on !== null) set_task_my_day(task, null)
  }

  function rename_task(task: Task, title: string): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, title } : each)))
    void window.x_tasks.set_task_title(task.id, title)
  }

  function set_task_notes(task: Task, notes: string): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, notes } : each)))
    void window.x_tasks.set_task_notes(task.id, notes)
  }

  function remove_task(task: Task): void {
    remove_tasks([task])
  }

  // Takes tasks and their subtasks off the screen at once, and deletes them only once the chance to undo has passed.
  function remove_tasks(removed_tasks: Task[]): void {
    finish_removal()
    const removed_ids = new Set(removed_tasks.flatMap((task) => [...subtree_ids(task.id, tasks)]))
    const root_ids = removed_tasks.map((task) => task.id)
    const message = removed_tasks.length === 1 ? `Deleted "${removed_tasks[0]!.title}"` : `Deleted ${removed_tasks.length} tasks`
    const removal: PendingRemoval = {
      tasks: tasks.filter((task) => removed_ids.has(task.id)),
      // The database removes the subtasks along with their parents; an undone removal fetches the list again, which never lost them.
      toast: undoable(message, {
        duration_in_milliseconds: UNDO_DELAY_MS,
        commit: () => {
          if (pending_removal.current === removal) pending_removal.current = null
          for (const task_id of root_ids) void window.x_tasks.remove_task(task_id)
        },
        undo: () => {
          if (pending_removal.current === removal) pending_removal.current = null
          void window.x_tasks.list_tasks().then((loaded_tasks) => set_tasks(without_pending(loaded_tasks)))
        }
      })
    }
    pending_removal.current = removal
    set_tasks((current_tasks) =>
      current_tasks.filter((each) => !removed_ids.has(each.id)).map((each) => ({ ...each, links: each.links.filter((link) => !removed_ids.has(link.other_id)) }))
    )
  }

  function finish_removal(): void {
    pending_removal.current?.toast.finish()
  }

  function undo_removal(): void {
    pending_removal.current?.toast.undo()
  }

  // Deletes the completed tasks on screen, after asking if the settings say to, along with their history in the reports.
  function clear_completed(clearable_tasks: Task[]): void {
    const count = clearable_tasks.length
    const is_confirmed =
      !settings?.confirm_clear_completed || window.confirm(`Delete ${count} completed ${count === 1 ? 'task' : 'tasks'}? Their ticks leave the reports too.`)
    if (!is_confirmed) return
    remove_tasks(clearable_tasks)
  }

  // Grabbing a picked row drags every picked task along, in screen order, leaving out subtasks that already move with a picked parent.
  function tasks_dragged_with(task: Task): Task[] {
    return is_picking && picked_task_ids.includes(task.id) ? picked_roots(false) : [task]
  }

  // A task cannot be dropped onto itself or anything nested under it, nor onto any of the others dragged with it.
  function can_drop_task_on(target: Task): boolean {
    return dragged_task !== null && tasks_dragged_with(dragged_task).every((task) => !subtree_ids(task.id, tasks).has(target.id))
  }

  function drop_task(target: Task, placement: DropPlacement): void {
    if (!dragged_task || !can_drop_task_on(target)) return
    const moved_tasks = tasks_dragged_with(dragged_task)
    const moves = moves_for_drop(moved_tasks, target, placement, tasks)
    const move_by_id = new Map(moved_tasks.map((task, index) => [task.id, moves[index]!]))

    set_tasks((current_tasks) =>
      current_tasks.map((each) => {
        const move = move_by_id.get(each.id)
        return move ? { ...each, ...move } : each
      }).sort(by_position)
    )
    set_dragged_task(null)
    for (const [task_id, move] of move_by_id) void window.x_tasks.move_task(task_id, move.parent_id, move.position)
  }

  // A task dropped on a sidebar tag gets it, and so does every task dragged along with it.
  function tag_dragged_tasks(task: Task, tag: Tag): void {
    for (const each of tasks_dragged_with(task)) tag_task(each, tag)
  }

  // In a one-tag-per-task group, the new tag replaces whichever tag of that group the task had; a rule tag is never given by hand.
  function tag_task(task: Task, tag: Tag): void {
    if (task.tag_ids.includes(tag.id) || tag.rule) return
    const is_single_choice = tag_groups.find((group) => group.id === tag.group_id)?.is_single_choice ?? false
    const replaced_ids = new Set(is_single_choice ? tags.filter((each) => each.group_id === tag.group_id).map((each) => each.id) : [])

    set_tasks((current_tasks) =>
      current_tasks.map((each) =>
        each.id === task.id ? { ...each, tag_ids: [...each.tag_ids.filter((tag_id) => !replaced_ids.has(tag_id)), tag.id] } : each
      )
    )
    void window.x_tasks.tag_task(task.id, tag.id)
  }

  function untag_task(task: Task, tag: Tag): void {
    set_tasks((current_tasks) =>
      current_tasks.map((each) =>
        each.id === task.id ? { ...each, tag_ids: each.tag_ids.filter((tag_id) => tag_id !== tag.id) } : each
      )
    )
    void window.x_tasks.untag_task(task.id, tag.id)
  }

  // Two tasks share one link, kept by the task the relationship's name reads from; a task never waits on itself through others.
  function link_tasks(task: Task, other: Task, relationship_id: string, is_inverse: boolean): void {
    const relationship = settings!.task_relationships.find((each) => each.id === relationship_id)
    if (!can_link(task.id, other.id, relationship, is_inverse, tasks, settings!.task_relationships)) return
    const [from, to] = is_inverse ? [other, task] : [task, other]
    set_tasks((current_tasks) =>
      current_tasks.map((each) => {
        if (each.id !== from.id && each.id !== to.id) return each
        const links = each.links.filter((link) => link.other_id !== from.id && link.other_id !== to.id)
        return { ...each, links: each.id === from.id ? [...links, { other_id: to.id, relationship_id }] : links }
      })
    )
    void window.x_tasks.link_tasks(from.id, to.id, relationship_id)
  }

  function unlink_tasks(task: Task, other: Task): void {
    set_tasks((current_tasks) =>
      current_tasks.map((each) =>
        each.id === task.id || each.id === other.id
          ? { ...each, links: each.links.filter((link) => link.other_id !== task.id && link.other_id !== other.id) }
          : each
      )
    )
    void window.x_tasks.unlink_tasks(task.id, other.id)
  }

  // A relationship taken out of Settings takes its links with it.
  function change_relationships(relationships: TaskRelationship[]): void {
    const kept_ids = new Set(relationships.map((relationship) => relationship.id))
    for (const task of tasks) for (const link of task.links) if (!kept_ids.has(link.relationship_id)) void window.x_tasks.unlink_tasks(task.id, link.other_id)
    set_tasks((current_tasks) => current_tasks.map((each) => ({ ...each, links: each.links.filter((link) => kept_ids.has(link.relationship_id)) })))
    void change_setting('task_relationships', relationships)
  }

  // ==========================================================================
  // Tag changes
  // ==========================================================================

  async function add_tag_group(name: string, is_rule: boolean): Promise<void> {
    const added_group = await window.x_tasks.add_tag_group(name, is_rule)
    set_tag_groups((current_groups) => [...current_groups, added_group])
  }

  // A group turned to rules gives each plain tag an empty rule and leaves every task that held its tags; one turned plain drops the rules.
  function update_tag_group(group: TagGroup, name: string, is_rule: boolean, is_single_choice: boolean): void {
    const group_tag_ids = new Set(tags.filter((tag) => tag.group_id === group.id).map((tag) => tag.id))

    set_tag_groups((current_groups) =>
      current_groups.map((each) => (each.id === group.id ? { ...each, name, is_rule, is_single_choice: is_single_choice && !is_rule } : each))
    )
    set_tags((current_tags) =>
      current_tags.map((tag) => (group_tag_ids.has(tag.id) ? { ...tag, rule: is_rule ? (tag.rule ?? EMPTY_RULE) : null } : tag))
    )
    if (is_rule) {
      set_tasks((current_tasks) =>
        current_tasks.map((task) =>
          task.tag_ids.some((tag_id) => group_tag_ids.has(tag_id)) ? { ...task, tag_ids: task.tag_ids.filter((tag_id) => !group_tag_ids.has(tag_id)) } : task
        )
      )
    }
    void window.x_tasks.update_tag_group(group.id, name, is_rule, is_single_choice)
  }

  function remove_tag_group(group: TagGroup): void {
    const is_confirmed =
      !settings?.confirm_tag_removal || window.confirm(`Delete the group "${group.name}" and all its tags? Tasks are kept.`)
    if (!is_confirmed) return

    forget_tags(new Set(tags.filter((tag) => tag.group_id === group.id).map((tag) => tag.id)))
    set_tag_groups((current_groups) => current_groups.filter((each) => each.id !== group.id))
    void window.x_tasks.remove_tag_group(group.id)
  }

  function move_tag_group(group: TagGroup, position: number): void {
    set_tag_groups((current_groups) => current_groups.map((each) => (each.id === group.id ? { ...each, position } : each)).sort(by_position))
    void window.x_tasks.move_tag_group(group.id, position)
  }

  async function add_tag(
    name: string, group_id: string, parent_id: string | null, rule: TagRule | null = null, color: string | null = null, icon: string | null = null, shows_on_rows = true
  ): Promise<void> {
    const added_tag = await window.x_tasks.add_tag(name, group_id, parent_id, rule, color, icon, shows_on_rows)
    set_tags((current_tags) => [...current_tags, added_tag])
    select_view({ kind: 'tag', tag_ids: [added_tag.id] })
  }

  // A tag that becomes a rule leaves every task that held it by hand.
  function save_filter(name: string, rule: TagRule | null, color: string | null, icon: string | null, shows_on_rows: boolean): void {
    if (!filter_editing) return
    if (!('tag' in filter_editing)) return void add_tag(name, filter_editing.group_id, filter_editing.parent_id, rule, color, icon, shows_on_rows)

    const tag_id = filter_editing.tag.id
    set_tags((current_tags) => current_tags.map((each) => (each.id === tag_id ? { ...each, name, rule, color, icon, shows_on_rows } : each)))
    if (rule) {
      set_tasks((current_tasks) =>
        current_tasks.map((task) => (task.tag_ids.includes(tag_id) ? { ...task, tag_ids: task.tag_ids.filter((id) => id !== tag_id) } : task))
      )
    }
    void window.x_tasks.update_tag(tag_id, name, rule, color, icon, shows_on_rows)
  }

  function remove_tag(tag: Tag): void {
    const is_confirmed =
      !settings?.confirm_tag_removal || window.confirm(`Delete the tag "${tag.name}" and its sub-tags? Tasks are kept.`)
    if (!is_confirmed) return

    forget_tags(subtree_ids(tag.id, tags))
    void window.x_tasks.remove_tag(tag.id)
  }

  // Drops deleted tags from the screen; the database has already let go of them through its cascades.
  function forget_tags(removed_ids: Set<string>): void {
    set_tags((current_tags) => current_tags.filter((each) => !removed_ids.has(each.id)))
    set_tasks((current_tasks) =>
      current_tasks.map((task) => ({ ...task, tag_ids: task.tag_ids.filter((tag_id) => !removed_ids.has(tag_id)) }))
    )
    const remaining_view = view_without_tags(selected_view, removed_ids)
    if (remaining_view !== selected_view) select_view(remaining_view)
  }

  function move_tag(tag: Tag, move: TreeMove): void {
    set_tags((current_tags) => current_tags.map((each) => (each.id === tag.id ? { ...each, ...move } : each)).sort(by_position))
    void window.x_tasks.move_tag(tag.id, move.parent_id, move.position)
  }

  // ==========================================================================
  // Layout
  // ==========================================================================

  // Worked out again when the day turns, so a streak whose occurrence ran out overnight drops to zero.
  const streak_by_task_id = useMemo(() => {
    const now = new Date()
    const streaks = new Map<string, RoutineStreak>()
    for (const task of tasks) {
      const streak = task_streak(task, tasks, completions, now)
      if (streak) streaks.set(task.id, streak)
    }
    return streaks
  }, [tasks, completions, today])
  const streak_of: StreakOf = (task) => streak_by_task_id.get(task.id) ?? null

  const last_done_by_task_id = useMemo(() => {
    const last_done = new Map<string, string>()
    for (const completion of completions) {
      const latest = last_done.get(completion.task_id)
      if (!latest || new Date(completion.done_at) > new Date(latest)) last_done.set(completion.task_id, completion.done_at)
    }
    return last_done
  }, [completions])
  const last_done_of: LastDoneOf = (task) => last_done_by_task_id.get(task.id) ?? null

  // The details pane's width reaches main's grid through the body, since the Shell gives main only a class.
  const detail_width = settings?.detail_width
  useEffect(() => {
    if (detail_width !== undefined) document.body.style.setProperty('--side-pane-width', `${detail_width}px`)
  }, [detail_width])

  // The Shell puts the sidebar's width on its layout only, so the top bar's name gets it through the body to line up.
  const sidebar_width = settings?.sidebar_width
  useEffect(() => {
    if (sidebar_width !== undefined) document.body.style.setProperty('--sidebar-width', `${sidebar_width}px`)
  }, [sidebar_width])

  // Nothing is drawn until the settings arrive, so the launch view never flashes past.
  if (!settings) return null

  const is_reports = selected_view.kind === 'reports'
  // Each view shows the layout saved for it, or one picked there and not yet saved when layouts are saved by hand.
  const stored_layout = saved_layout(settings, selected_view)
  const view_layout = (settings.layout_memory === 'on_demand' ? unsaved_layouts[view_key(selected_view)] : undefined) ?? stored_layout
  const has_unsaved_layout = !is_same_layout(view_layout, stored_layout)
  const layout = view_layout.layout
  const is_table = layout === 'table' && !is_reports
  // The board, calendar and Gantt chart take the whole width of the pane, as the table does.
  const is_wide = layout !== 'list' && !is_reports
  const shown_since = my_day_since(settings, today)
  const is_searching = multibar_text.trim() !== ''
  const typing_context: SyntaxContext = { tags, tag_groups, date_field: settings.task_date_field, now: parse_local(now) }
  const search = is_searching ? syntax_by_id(settings.search_syntax).parse_search(multibar_text, typing_context) : null
  const typed_task = is_searching && selected_view.kind !== 'completed' ? syntax_by_id(settings.quick_add_syntax).parse_quick_add(multibar_text, typing_context) : null
  const search_context = { all_tasks: tasks, tags, date_field: settings.task_date_field, now: typing_context.now }
  const view_tasks = tasks.filter((task) => task_is_in_view(task, selected_view, tasks, tags, shown_since, settings.tag_match, settings.tag_scope, settings.task_date_field))
  const searched_tasks = settings.search_scope === 'all' ? tasks : view_tasks
  const visible_tasks = search ? searched_tasks.filter((task) => query_matches(search.query, task, search_context)) : view_tasks
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length

  // The table's filters and sort apply only to the table layout; the list keeps every task in its dragged order.
  const is_filtered = is_table && has_table_filters(table_filters)
  const is_sorted = is_table && settings.table_sort.length > 0
  const shown_tasks = is_filtered ? visible_tasks.filter((task) => task_passes_filters(task, table_filters, tasks, tags, streak_of, today, settings.task_date_field, last_done_of, (each) => is_in_my_day(each, shown_since))) : visible_tasks
  const nested_tasks = nest_tasks(shown_tasks, tasks)
  const waits_on = waits_on_by_task(tasks, settings.task_relationships)
  // A completed task with an open subtask stays, and one whose parent is cleared goes with that parent.
  const open_task_ids = new Set(tasks.filter((task) => !task.is_done).map((task) => task.id))
  const fully_done_ids = new Set(
    shown_tasks.filter((task) => task.is_done && ![...subtree_ids(task.id, tasks)].some((id) => open_task_ids.has(id))).map((task) => task.id)
  )
  const clearable_tasks = shown_tasks.filter((task) => fully_done_ids.has(task.id) && (task.parent_id === null || !fully_done_ids.has(task.parent_id)))
  // The history column is there only while streak dots show on rows.
  const column_order = ordered_columns(settings.table_column_order, tag_groups).filter((column) => column !== 'history' || settings.show_streak_strip_on_rows)
  const sort_context: SortContext = { tags_of: task_tags_of, streak_of, is_in_my_day: (task) => is_in_my_day(task, shown_since), date_field: settings.task_date_field, last_done_of, tag_rank: tag_ranks(tags, false), reversed_tag_rank: tag_ranks(tags, true) }
  const task_tree = is_sorted ? sort_task_tree(nested_tasks, settings.table_sort, sort_context) : nested_tasks

  // Upcoming always groups by date and lists the later dates of repeating tasks; other views group as picked.
  const is_upcoming = selected_view.kind === 'upcoming'
  const stored_grouping = saved_grouping(settings, selected_view)
  const picked_grouping = (settings.grouping_memory === 'on_demand' ? unsaved_groupings[view_key(selected_view)] : undefined) ?? stored_grouping
  const has_unsaved_grouping = picked_grouping !== stored_grouping
  const grouped_tag_group = is_upcoming ? null : grouping_tag_group(picked_grouping, tag_groups)
  const is_grouped_by_date = is_upcoming || picked_grouping === 'date'
  const is_grouped = is_grouped_by_date || grouped_tag_group !== null
  const repeats = is_upcoming ? coming_repeats(shown_tasks, settings.task_date_field, now, settings.upcoming_repeat_days) : []
  const task_groups = grouped_tag_group
    ? group_by_tag(task_tree, grouped_tag_group, tags, task_tags_of)
    : is_grouped_by_date ? group_by_date(task_tree, repeats, settings.task_date_field, now, is_sorted) : []
  const shown_grouping = is_grouped ? picked_grouping : 'none'

  // The board puts its columns by the grouping too, and with none picked it splits open tasks from done ones.
  const board_columns = layout !== 'board' ? []
    : grouped_tag_group ? tag_columns(task_tree, grouped_tag_group, tags, task_tags_of)
      : is_grouped_by_date ? date_columns(task_tree, settings.task_date_field, now, is_sorted) : status_columns(task_tree)

  // Every row on screen from top to bottom, leaving out those inside collapsed tasks; only these can be picked.
  const shown_rows = is_settings_open || is_reports || layout === 'calendar' ? []
    : layout === 'board' ? [...new Map(board_columns.flatMap((column) => column.nodes).map((node) => [node.task.id, node.task])).values()]
      : rows_of(is_grouped && layout !== 'gantt' ? task_groups.flatMap((group) => group.nodes) : task_tree, settings.collapsed_task_ids)
  shown_rows_ref.current = shown_rows
  // Picked tasks that leave the screen, through a search or a filter, are left out of every bulk action.
  const picked_tasks = shown_rows.filter((task) => picked_task_ids.includes(task.id))
  const is_picking = picked_tasks.length > 0

  // A grouping picked in the header changes the shared one, this view's saved one, or only what is shown until saved.
  function pick_grouping(grouping: TaskGrouping): void {
    if (settings!.grouping_memory === 'shared') void change_setting('task_grouping', grouping)
    else if (settings!.grouping_memory === 'automatic') void change_setting('view_groupings', with_view_grouping(settings!, selected_view, grouping))
    else set_unsaved_groupings((current) => ({ ...current, [view_key(selected_view)]: grouping }))
  }

  function save_grouping(): void {
    void change_setting('view_groupings', with_view_grouping(settings!, selected_view, picked_grouping))
    set_unsaved_groupings((current) => without_key(current, view_key(selected_view)))
  }

  // A layout picked in the header changes the shared one, this view's saved one, or only what is shown until saved.
  function pick_layout(change: Partial<ViewLayout>): void {
    const picked = { ...view_layout, ...change }
    if (settings!.layout_memory === 'shared') {
      for (const key of Object.keys(change) as (keyof ViewLayout)[]) void change_setting(key === 'layout' ? 'task_layout' : key, picked[key] as never)
    } else if (settings!.layout_memory === 'automatic') {
      void change_setting('view_layouts', with_view_layout(settings!, selected_view, picked))
    } else {
      set_unsaved_layouts((current) => ({ ...current, [view_key(selected_view)]: picked }))
    }
  }

  function save_layout(): void {
    void change_setting('view_layouts', with_view_layout(settings!, selected_view, view_layout))
    set_unsaved_layouts((current) => without_key(current, view_key(selected_view)))
  }

  // A card moved between tag columns swaps those tags, between days moves its date, and between To do and Done ticks it.
  function move_on_board(task: Task, from_key: string, to_key: string): void {
    for (const each of tasks_dragged_with(task)) {
      if (grouped_tag_group) {
        const group_tags = tags.filter((tag) => tag.group_id === grouped_tag_group.id)
        const from_tag = group_tags.find((tag) => tag.id === from_key)
        const to_tag = group_tags.find((tag) => tag.id === to_key)
        if (to_key === NO_TAG_COLUMN) for (const tag of group_tags) if (each.tag_ids.includes(tag.id)) untag_task(each, tag)
        if (from_tag && to_tag) untag_task(each, from_tag)
        if (to_tag) tag_task(each, to_tag)
      } else if (to_key === OPEN_COLUMN || to_key === DONE_COLUMN) {
        if (each.is_done !== (to_key === DONE_COLUMN)) tick_task(each)
      } else {
        set_task_schedule(each, rescheduled(each, parse_local(to_key), settings!.task_date_field))
      }
    }
  }

  // A hidden column stops sorting and filtering the table, so no rows go missing for a reason that cannot be seen.
  function show_table_column(column: TableColumn, is_shown: boolean): void {
    const hidden = settings!.hidden_table_columns.filter((each) => each !== column)
    const shown = settings!.shown_table_columns.filter((each) => each !== column)
    void change_setting('hidden_table_columns', is_shown ? hidden : [...hidden, column])
    void change_setting('shown_table_columns', is_shown ? [...shown, column] : shown)
    if (is_shown) return

    if (settings!.table_sort.some((key) => key.column === column)) {
      void change_setting('table_sort', settings!.table_sort.filter((key) => key.column !== column))
    }
    set_table_filters((filters) => without_column_filter(filters, column))
  }

  // ==========================================================================
  // Picking several tasks
  // ==========================================================================

  // A Ctrl+click while another task's details are open picks that one too, as a file manager does; picking always closes the details.
  function toggle_picked(task: Task, with_open_task: boolean = false): void {
    const current_ids = picked_tasks.map((each) => each.id)
    const open_id = with_open_task && !is_picking && shown_rows.some((each) => each.id === selected_task_id) ? selected_task_id : null
    const start_ids = open_id && open_id !== task.id ? [open_id] : current_ids
    set_picked_task_ids(toggled(start_ids, task.id))
    pick_anchor_id.current = task.id
    set_selected_task_id(null)
  }

  // Adds every row between the anchor and this one to the picked tasks, or picks just this one when there is no anchor on screen.
  function pick_range(task: Task): void {
    const anchor_id = is_picking ? pick_anchor_id.current : selected_task_id
    const anchor_index = shown_rows.findIndex((each) => each.id === anchor_id)
    const task_index = shown_rows.findIndex((each) => each.id === task.id)
    if (anchor_index === -1 || task_index === -1) return toggle_picked(task)

    set_picked_task_ids(with_range(shown_rows.map((each) => each.id), picked_tasks.map((each) => each.id), anchor_id, task.id))
    pick_anchor_id.current = task.id
    set_selected_task_id(null)
  }

  // The picked tasks with no picked ancestor to carry them along, counting only open ancestors when completing.
  function picked_roots(is_completing: boolean): Task[] {
    const picked_ids = new Set(picked_tasks.map((task) => task.id))
    const task_by_id = new Map(tasks.map((task) => [task.id, task]))
    return picked_tasks.filter((task) => {
      for (let parent = task_by_id.get(task.parent_id ?? ''); parent; parent = task_by_id.get(parent.parent_id ?? '')) {
        if (picked_ids.has(parent.id) && !(is_completing && parent.is_done)) return false
      }
      return true
    })
  }

  // Completing a picked parent completes its subtasks itself, so a subtask picked along with it is not ticked twice.
  function complete_picked(): void {
    const roots = picked_roots(true)
    collapse_finished_branches(roots)
    for (const task of roots) if (!task.is_done) toggle_task(task)
  }

  function reopen_picked(): void {
    for (const task of picked_tasks) if (task.is_done) toggle_task(task)
  }

  function set_picked_my_day(is_added: boolean): void {
    for (const task of picked_tasks) if (is_in_my_day(task, shown_since) !== is_added) set_task_my_day(task, is_added ? today : null)
  }

  // A tag every picked task holds is taken off them all; any other tag is given to them all.
  function toggle_picked_tag(tag: Tag): void {
    const is_on_all = picked_tasks.every((task) => task.tag_ids.includes(tag.id))
    for (const task of picked_tasks) {
      if (is_on_all) untag_task(task, tag)
      else tag_task(task, tag)
    }
  }

  function remove_picked(): void {
    remove_tasks(picked_roots(false))
    set_picked_task_ids([])
  }

  // Every plain tag, group by group in sidebar order, ticked when all the picked tasks hold it.
  function tag_menu_items(): MenuItem[] {
    return tag_groups.flatMap((group) =>
      in_tree_order(tags.filter((tag) => tag.group_id === group.id && !tag.rule)).map((tag) => ({
        label: `${group.name}: ${tag_path(tag, tags)}`,
        checked: picked_tasks.every((task) => task.tag_ids.includes(tag.id)),
        run: () => toggle_picked_tag(tag)
      }))
    )
  }

  function open_tag_menu(event: ReactMouseEvent): void {
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect()
    open_context_menu({ clientX: button.left, clientY: button.top, preventDefault: () => undefined }, tag_menu_items())
  }

  // The same actions as the bar at the foot of the window, for a right-click on any picked row.
  function open_bulk_menu(event: ReactMouseEvent): void {
    const has_open = picked_tasks.some((task) => !task.is_done)
    const has_done = picked_tasks.some((task) => task.is_done)
    open_context_menu(event, [
      ...(has_open ? [{ label: 'Mark done', run: complete_picked }] : []),
      ...(has_done ? [{ label: 'Mark not done', run: reopen_picked }] : []),
      { label: 'Reschedule…', run: () => set_rescheduling_task_ids(picked_tasks.map((task) => task.id)) },
      all_picked_in_my_day
        ? { label: 'Remove from My Day', run: () => set_picked_my_day(false) }
        : { label: 'Add to My Day', run: () => set_picked_my_day(true) },
      { label: 'Tags…', run: () => open_context_menu({ clientX: event.clientX, clientY: event.clientY, preventDefault: () => undefined }, tag_menu_items()) },
      { label: 'Clear selection', run: () => set_picked_task_ids([]) },
      { label: `Delete ${picked_tasks.length === 1 ? 'task' : `${picked_tasks.length} tasks`}`, run: remove_picked, danger: true, separator_before: true }
    ])
  }

  const all_picked_in_my_day = is_picking && picked_tasks.every((task) => is_in_my_day(task, shown_since))

  // The tags a task's row shows: its own and the rule tags that match it.
  function task_tags_of(task: Task): Tag[] {
    return [...tags.filter((tag) => task.tag_ids.includes(tag.id)), ...rule_tags_of(task, tasks, tags)]
  }

  // The detail panel stays out of the way while the settings page is open.
  const selected_task = is_settings_open ? null : (tasks.find((task) => task.id === selected_task_id) ?? null)
  const rescheduling_tasks = tasks.filter((task) => rescheduling_task_ids.includes(task.id))

  const task_actions: TaskActions = {
    tags,
    tag_groups,
    tint_rows: settings.tint_rows_by_tag,
    date_field: settings.task_date_field,
    can_add_subtasks: selected_view.kind !== 'completed',
    selected_task_id,
    // Opening a task's details ends any bulk selection, and makes it the row a Shift+click picks from.
    on_select: (task) => {
      set_picked_task_ids([])
      set_selected_task_id(task.id)
      pick_anchor_id.current = task.id
    },
    is_picking,
    is_picked: (task) => is_picking && picked_task_ids.includes(task.id),
    on_pick: toggle_picked,
    on_pick_range: pick_range,
    on_bulk_menu: open_bulk_menu,
    drag_count_of: (task) => tasks_dragged_with(task).length,
    is_dragging_picked: dragged_task !== null && is_picking && picked_task_ids.includes(dragged_task.id),
    on_toggle: tick_task,
    on_reschedule: (task) => set_rescheduling_task_ids([task.id]),
    is_in_my_day: (task) => is_in_my_day(task, shown_since),
    on_set_my_day: (task, is_added) => set_task_my_day(task, is_added ? today : null),
    on_remove: remove_task,
    on_add_subtask: add_subtask,
    is_collapsed: (task) => settings.collapsed_task_ids.includes(task.id),
    on_set_collapsed: set_task_collapsed,
    on_untag: untag_task,
    rule_tags_of: (task) => rule_tags_of(task, tasks, tags),
    streak_of,
    history_of: (task) => (settings.show_streak_strip_on_rows ? task_history(task, tasks, completions) : []),
    last_done_of,
    on_drag_start: set_dragged_task,
    on_drag_end: () => set_dragged_task(null),
    // A sorted table ignores the dragged order, so a task dropped on a row there nests inside it instead of landing beside it.
    can_drop_on: can_drop_task_on,
    can_drop_beside: !is_sorted,
    on_drop: drop_task
  }

  const can_add_task = selected_view.kind !== 'completed'

  // The shown tasks that have shown subtasks, which the collapse and expand all buttons act on.
  const parent_ids = parent_ids_of(task_tree)
  const has_expanded_parent = parent_ids.some((id) => !settings.collapsed_task_ids.includes(id))
  const has_collapsed_parent = parent_ids.some((id) => settings.collapsed_task_ids.includes(id))

  function open_settings(): void {
    set_is_settings_open(true)
    set_is_sidebar_open(false)
  }

  const multibar = (
    <form
      className="multibar"
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') document.querySelector<HTMLElement>('.add_task_row')?.focus()
      }}
    >
      <SearchBox
        auto_focus={!IS_TOUCH_SCREEN}
        label={can_add_task ? 'Search, or type a task to add' : settings.search_scope === 'all' ? 'Search all tasks' : 'Search completed tasks'}
        value={multibar_text}
        on_input={change_multibar_text}
      />
    </form>
  )

  const sidebar = (
    <Sidebar
      tasks={tasks}
      tag_groups={tag_groups}
      tags={tags}
      my_day_since={shown_since}
      tag_scope={settings.tag_scope}
      show_empty_tags={settings.show_empty_tags}
      date_field={settings.task_date_field}
      selected_view={is_settings_open ? null : selected_view}
      dragged_task={dragged_task}
      collapsed_ids={settings.collapsed_sidebar_ids}
      on_set_collapsed_ids={(ids) => void change_setting('collapsed_sidebar_ids', ids)}
      on_select_view={select_view}
      on_toggle_tag={(tag) => select_view(view_with_tag_toggled(selected_view, tag, tags, settings.tag_selection))}
      on_edit_tag_group={set_editing_group}
      on_remove_tag_group={remove_tag_group}
      on_move_tag_group={move_tag_group}
      on_add_tag={add_tag}
      on_add_rule_tag={(group_id, parent_id) => set_filter_editing({ group_id, parent_id })}
      on_edit_tag={(tag) => set_filter_editing({ tag })}
      on_remove_tag={remove_tag}
      on_move_tag={move_tag}
      on_tag_task={tag_dragged_tasks}
    />
  )

  const task_pane = is_settings_open ? (
    <SettingsPage
      settings={settings}
      tags={tags}
      tag_groups={tag_groups}
      tasks={tasks}
      on_change={change_setting}
      on_change_relationships={change_relationships}
      on_add_tag_group={add_tag_group}
    />
  ) : is_reports ? (
    <ReportsPage
      widgets={settings.report_widgets}
      tasks={tasks}
      completions={completions}
      tags={tags}
      tag_groups={tag_groups}
      today={today}
      on_change_widgets={(widgets) => void change_setting('report_widgets', widgets)}
      on_select_task={(task) => set_selected_task_id(task.id)}
    />
  ) : (
    <>
      <PageHeading
        title={view_title(selected_view, tags)}
        subtitle={
          <>
            {selected_view.kind === 'my_day' && <span className="my_day_date">{parse_local(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>}
            <span className="remaining_count">{remaining_count} left</span>
          </>
        }
        actions={
          <>
          {selected_view.kind === 'my_day' && visible_tasks.length > 0 && <button onClick={clear_my_day}>Clear</button>}
          {clearable_tasks.length > 0 && (
            <button onClick={() => clear_completed(clearable_tasks)} title="Delete the completed tasks shown here">
              Clear completed
            </button>
          )}
          {parent_ids.length > 0 && (layout === 'list' || layout === 'table' || layout === 'gantt') && (
            <div className="segmented" role="group" aria-label="Subtasks">
              <button onClick={() => set_tasks_collapsed(parent_ids, true)} disabled={!has_expanded_parent} title="Collapse every task with subtasks">
                Collapse all
              </button>
              <button onClick={() => set_tasks_collapsed(parent_ids, false)} disabled={!has_collapsed_parent} title="Expand every task with subtasks">
                Expand all
              </button>
            </div>
          )}
          {!is_upcoming && layout !== 'calendar' && layout !== 'gantt' && (
            <select
              className={is_grouped ? 'grouping_select is_selected' : 'grouping_select'}
              value={shown_grouping}
              onChange={(event) => pick_grouping(event.currentTarget.value as TaskGrouping)}
              aria-label="Group by"
              title="Show tasks under headings by date or by the tags of a group"
            >
              {grouping_choices(tag_groups).map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {!is_upcoming && layout !== 'calendar' && layout !== 'gantt' && has_unsaved_grouping && (
            <button onClick={save_grouping} title="Keep this grouping for this view">
              Save grouping
            </button>
          )}
          {layout === 'gantt' && <Segmented label="Gantt scale" choices={GANTT_SCALE_CHOICES} value={view_layout.gantt_scale} on_change={(gantt_scale) => pick_layout({ gantt_scale })} />}
          {has_unsaved_layout && (
            <button onClick={save_layout} title="Keep this layout for this view">
              Save layout
            </button>
          )}
          <Segmented label="Layout" choices={TASK_LAYOUT_CHOICES} value={layout} on_change={(value) => pick_layout({ layout: value })} />
          </>
        }
      />

      {typed_task?.title && <AddTaskRow quick_add={typed_task} tags={tags} on_add={() => void add_typed_task()} on_cancel={() => set_multibar_text('')} />}

      {layout === 'board' && visible_tasks.length > 0 && (
        <BoardView
          columns={board_columns}
          actions={task_actions}
          column_group_id={grouped_tag_group?.id ?? null}
          open_dependency_count={(task) => (waits_on.get(task.id) ?? []).filter((id) => open_task_ids.has(id)).length}
          on_move={move_on_board}
        />
      )}
      {layout === 'calendar' && (
        <CalendarView
          tasks={shown_tasks}
          tags_of={task_tags_of}
          date_field={settings.task_date_field}
          now={now}
          span={view_layout.calendar_span}
          slot_minutes={settings.calendar_slot_minutes}
          slot_label_minutes={settings.calendar_slot_label_minutes}
          selected_task_id={selected_task_id}
          on_change_span={(calendar_span) => pick_layout({ calendar_span })}
          on_select={task_actions.on_select}
          on_set_schedule={set_task_schedule}
        />
      )}
      {layout === 'gantt' && visible_tasks.length > 0 && (
        <GanttView
          rows={shown_rows}
          waits_on={waits_on}
          scale={view_layout.gantt_scale}
          selected_task_id={selected_task_id}
          on_change_scale={(gantt_scale) => pick_layout({ gantt_scale })}
          on_select={task_actions.on_select}
          on_set_schedule={set_task_schedule}
        />
      )}

      {layout === 'table' && visible_tasks.length > 0 && (
        <TaskTable
          tree={task_tree}
          groups={is_grouped ? task_groups : null}
          is_grouped_by_date={is_grouped_by_date}
          actions={task_actions}
          tags={tags}
          tag_groups={tag_groups}
          tags_of={task_tags_of}
          column_order={column_order}
          hidden_columns={settings.hidden_table_columns}
          shown_columns={settings.shown_table_columns}
          column_widths={settings.table_column_widths}
          sort={settings.table_sort}
          filters={table_filters}
          collapsed_ids={settings.collapsed_task_ids}
          on_column_order_change={(order) => void change_setting('table_column_order', order)}
          on_show_column={show_table_column}
          on_column_widths_change={(widths, done) => (done ? void change_setting('table_column_widths', widths) : show_setting('table_column_widths', widths))}
          on_sort_change={(sort) => void change_setting('table_sort', sort)}
          on_filters_change={set_table_filters}
          on_collapsed_change={(ids) => void change_setting('collapsed_task_ids', ids)}
        />
      )}

      {layout === 'list' && (
        <ul className="task_list">
          {is_grouped
            ? task_groups.map((group) => (
                <li key={group.key} className="task_group">
                  <h2 className={cx('group_heading', is_grouped_by_date && group.key === 'overdue' && 'is_overdue')}>
                    {group.label}
                    <span className="group_count">{group.nodes.length + group.repeats.length}</span>
                  </h2>
                  <ul className="task_list">
                    {group.nodes.map((node) => (
                      <TaskItem key={node.task.id} node={node} actions={task_actions} />
                    ))}
                    {group.repeats.map((repeat) => (
                      <RepeatItem key={`${repeat.task.id}@${repeat.task_date}`} repeat={repeat} actions={task_actions} />
                    ))}
                  </ul>
                </li>
              ))
            : task_tree.map((node) => <TaskItem key={node.task.id} node={node} actions={task_actions} />)}
        </ul>
      )}

      {visible_tasks.length === 0 && layout !== 'calendar' && <p className="empty">{is_searching ? 'No tasks match the search.' : 'Nothing here yet.'}</p>}
      {visible_tasks.length > 0 && task_tree.length === 0 && <p className="empty">No tasks match the filters.</p>}
    </>
  )

  return (
    <Shell
      brand="X-Tasks"
      brand_href="?"
      theme={theme}
      tools={multibar}
      sidebar={sidebar}
      sidebar_foot={<SidebarFoot theme={theme} is_settings_open={is_settings_open} on_open_settings={open_settings} />}
      sidebar_width={{
        default_width: DEFAULT_SETTINGS.sidebar_width,
        min: SIDEBAR_WIDTH_RANGE.min,
        max: SIDEBAR_WIDTH_RANGE.max,
        width: settings.sidebar_width,
        on_change: (width, done) => (done ? void change_setting('sidebar_width', width) : show_setting('sidebar_width', width))
      }}
      menu_open={is_sidebar_open}
      on_menu_open_change={set_is_sidebar_open}
      main_class={cx('task_main', selected_task && 'with-side-pane')}
      contained
      view_key={is_settings_open ? 'settings' : view_key(selected_view)}
    >
      <div className="main-pane">
        <SyntaxPreview problems={[...(typed_task?.problems ?? []), ...(search?.problems.map((problem) => `Search: ${problem}`) ?? [])]} />
        <div className={cx('task_pane', is_wide && !is_settings_open && `is_wide is_${layout}`)}>{task_pane}</div>
      </div>

        {selected_task && (
          <div className="side-pane">
            <ResizeHandle
              side="right"
              size={settings.detail_width}
              min={DETAIL_WIDTH_RANGE.min}
              max={DETAIL_WIDTH_RANGE.max}
              default_size={DEFAULT_SETTINGS.detail_width}
              on_resize={(width) => show_setting('detail_width', width)}
              on_resize_end={(width) => void change_setting('detail_width', width)}
              label="Resize task details"
              class_name="detail_resize"
            />
            <TaskDetail
              key={selected_task.id}
              task={selected_task}
              tag_groups={tag_groups}
              tags={tags}
              date_field={settings.task_date_field}
              sections={ordered_detail_sections(settings.task_detail_order, tag_groups).filter((section) => !settings.hidden_task_detail_sections.includes(section))}
              subtask_count={subtree_ids(selected_task.id, tasks).size - 1}
              tasks={tasks}
              relationships={settings.task_relationships}
              on_link={link_tasks}
              on_unlink={unlink_tasks}
              durations={settings.task_durations}
              on_toggle={tick_task}
              on_rename={rename_task}
              on_set_notes={set_task_notes}
              on_tag={tag_task}
              on_untag={untag_task}
              on_set_schedule={set_task_schedule}
              on_set_done_at={(task, done_at) => save_task_done(task, task.is_done, done_at, done_at === null ? { kind: 'remove' } : { kind: 'retime' })}
              streak={streak_by_task_id.get(selected_task.id) ?? null}
              history={task_history(selected_task, tasks, completions)}
              on_reschedule={(task) => set_rescheduling_task_ids([task.id])}
              is_in_my_day={is_in_my_day(selected_task, shown_since)}
              on_set_my_day={(task, is_added) => set_task_my_day(task, is_added ? today : null)}
              on_remove={remove_task}
              on_close={() => set_selected_task_id(null)}
            />
          </div>
        )}

      {rescheduling_tasks.length > 0 && (
        <ReschedulePopup
          tasks={rescheduling_tasks}
          options={settings.reschedule_options}
          date_field={settings.task_date_field}
          on_reschedule={set_task_schedule}
          on_close={() => set_rescheduling_task_ids([])}
        />
      )}

      {filter_editing && (
        <FilterDialog
          heading={'tag' in filter_editing ? 'Edit tag' : 'New rule tag'}
          name={'tag' in filter_editing ? filter_editing.tag.name : ''}
          rule={'tag' in filter_editing ? filter_editing.tag.rule : EMPTY_RULE}
          color={'tag' in filter_editing ? filter_editing.tag.color : null}
          icon={'tag' in filter_editing ? filter_editing.tag.icon : null}
          shows_on_rows={'tag' in filter_editing ? filter_editing.tag.shows_on_rows : true}
          swatches={settings.tag_colors}
          tag_id={'tag' in filter_editing ? filter_editing.tag.id : null}
          tags={tags}
          groups={tag_groups}
          tasks={tasks}
          relationships={settings.task_relationships}
          on_save={save_filter}
          on_close={() => set_filter_editing(null)}
        />
      )}


      {editing_group && (
        <GroupDialog
          heading="Edit filter group"
          group={editing_group}
          tags={tags}
          tasks={tasks}
          on_save={(name, is_rule, is_single_choice) => update_tag_group(editing_group, name, is_rule, is_single_choice)}
          on_close={() => set_editing_group(null)}
        />
      )}

      <UntrustedCertificatePrompt />

      {is_picking && (
        <SelectionBar count={picked_tasks.length} total={shown_rows.length} on_clear={() => set_picked_task_ids([])} on_select_all={() => set_picked_task_ids(shown_rows.map((task) => task.id))}>
          {picked_tasks.some((task) => !task.is_done) && <button onClick={complete_picked}>Mark done</button>}
          {picked_tasks.some((task) => task.is_done) && <button onClick={reopen_picked}>Mark not done</button>}
          <button onClick={() => set_rescheduling_task_ids(picked_tasks.map((task) => task.id))}>Reschedule…</button>
          <button onClick={() => set_picked_my_day(!all_picked_in_my_day)}>{all_picked_in_my_day ? 'Remove from My Day' : 'Add to My Day'}</button>
          <button onClick={open_tag_menu}>Tags…</button>
          <button className="danger" onClick={remove_picked}>
            Delete
          </button>
        </SelectionBar>
      )}
    </Shell>
  )
}

// ============================================================================
// Collapsing
// ============================================================================

// Every task in the tree from top to bottom, skipping what sits inside a collapsed task, each listed once.
function rows_of(nodes: TaskNode[], collapsed_ids: string[]): Task[] {
  const rows = new Map<string, Task>()
  const visit = (each_nodes: TaskNode[]): void => {
    for (const node of each_nodes) {
      rows.set(node.task.id, node.task)
      if (!collapsed_ids.includes(node.task.id)) visit(node.children)
    }
  }
  visit(nodes)
  return [...rows.values()]
}

// The ids of every task in the tree that has children, at any depth.
function parent_ids_of(nodes: TaskNode[]): string[] {
  return nodes.flatMap((node) => (node.children.length > 0 ? [node.task.id, ...parent_ids_of(node.children)] : []))
}

// ============================================================================
// Search
// ============================================================================

// A typed tag from a single-choice group takes the place of the view's tag from that group.
function with_typed_tag_ids(view_tag_ids: string[], typed_tag_ids: string[], tags: Tag[], tag_groups: TagGroup[]): string[] {
  const group_of = (tag_id: string) => tags.find((tag) => tag.id === tag_id)?.group_id
  const typed_single_groups = new Set(
    typed_tag_ids.map(group_of).filter((group_id) => tag_groups.find((group) => group.id === group_id)?.is_single_choice)
  )
  const kept_view_ids = view_tag_ids.filter((tag_id) => !typed_single_groups.has(group_of(tag_id)) && !typed_tag_ids.includes(tag_id))
  return [...kept_view_ids, ...typed_tag_ids]
}

// ============================================================================
// Records
// ============================================================================

// The record without one key, such as a view's unsaved choice once it is saved.
function without_key<Value>(record: Record<string, Value>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([each_key]) => each_key !== key))
}
