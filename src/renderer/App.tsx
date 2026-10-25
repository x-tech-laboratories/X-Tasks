import { Fragment } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { DEFAULT_SETTINGS, DETAIL_WIDTH_RANGE, SIDEBAR_WIDTH_RANGE, type Settings, type TaskGrouping, type TaskLayout } from '@shared/settings'
import { EMPTY_RULE, type Completion, type CompletionLogChange, type Tag, type TagGroup, type TagRule, type Task, type TaskSchedule } from '@shared/tasks'
import { completions_after, task_history, task_streak, type RoutineStreak } from '@shared/streaks'
import { BACK_EVENT } from './back_navigation'
import { ContextMenu, type MenuItem, type OpenContextMenu, type OpenMenu } from './ContextMenu'
import { ReportsPage } from './ReportsPage'
import { ReschedulePopup } from './ReschedulePopup'
import { ResizeHandle } from './ResizeHandle'
import { UntrustedCertificatePrompt } from './CertificateDialog'
import { FilterDialog } from './FilterDialog'
import { GroupDialog } from './GroupDialog'
import { SettingsPage } from './SettingsPage'
import { Sidebar } from './Sidebar'
import { TaskDetail } from './TaskDetail'
import { RepeatItem, TaskItem, TaskTableHeader, type TaskActions } from './TaskItem'
import { coming_repeats, group_by_date } from './dates'
import { group_by_tag, grouping_choices, grouping_tag_group } from './grouping'
import { format_task_date, next_schedule, parse_task_date, recurrence_anchor } from '@shared/schedule'
import {
  EMPTY_TABLE_FILTERS, column_width, has_table_filters, is_column_shown, move_column, ordered_columns, sort_after_click, sort_task_tree, tags_in_sidebar_order, task_passes_filters, without_column_filter, type LastDoneOf, type StreakOf, type TableColumn, type TableFilters
} from './table'
import {
  by_position, children_of, comes_due_between, is_due_by, is_in_my_day, launch_view, move_for_drop, moves_for_drop, my_day_for_new_task, my_day_since, nest_tasks, position_for_drop, rule_tags_of, subtree_ids,
  tag_ids_for_new_task, tag_path, task_is_in_view, view_title, view_with_tag_toggled, view_without_tags, type DropPlacement, type SidePlacement, type TaskNode, type View
} from './views'

// ============================================================================
// Choices
// ============================================================================

const TASK_LAYOUT_CHOICES: { value: TaskLayout; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' }
]

// A phone's keyboard covers half the screen, so the search box only takes focus at launch where there is a mouse.
const IS_TOUCH_SCREEN = window.matchMedia('(pointer: coarse)').matches

// Removed tasks wait this long before the database deletes them, so the removal can be undone.
const UNDO_DELAY_MS = 8000

// ============================================================================
// App
// ============================================================================

// The tag open in the filter dialog: an existing one, or a new rule tag about to be added at a spot in a group.
type FilterEditing = { tag: Tag } | { group_id: string; parent_id: string | null }

// Tasks taken off the screen but not yet deleted: the ones removed, everything under them, and the timer that deletes them.
type PendingRemoval = { root_ids: string[]; tasks: Task[]; timer: number }

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
  const [context_menu, set_context_menu] = useState<OpenMenu | null>(null)
  const [rescheduling_task_ids, set_rescheduling_task_ids] = useState<string[]>([])
  const [now, set_now] = useState(() => format_task_date(new Date(), true))
  const today = now.slice(0, 10)
  const [filter_editing, set_filter_editing] = useState<FilterEditing | null>(null)
  const [editing_group, set_editing_group] = useState<TagGroup | null>(null)
  const [table_filters, set_table_filters] = useState<TableFilters>(EMPTY_TABLE_FILTERS)
  const [undo_message, set_undo_message] = useState<string | null>(null)
  const pending_removal = useRef<PendingRemoval | null>(null)

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
      set_selected_view(launch_view(loaded_settings, loaded_tags))
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

  // Checks the clock every minute, so tasks turn overdue as their time passes and My Day takes in tasks as they come due.
  useEffect(() => {
    const timer = window.setInterval(() => set_now(format_task_date(new Date(), true)), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Puts each task into My Day when its date and time arrive, once only, so ones taken out by hand stay out.
  useEffect(() => {
    if (!has_loaded_tasks || !settings?.add_due_to_my_day || settings.due_added_to_my_day_until === now) return
    const shown_since = my_day_since(settings, today)
    for (const task of tasks) {
      if (comes_due_between(task, settings.due_added_to_my_day_until, now, settings.task_date_field) && !is_in_my_day(task, shown_since)) set_task_my_day(task, today)
    }
    void change_setting('due_added_to_my_day_until', now)
  }, [has_loaded_tasks, settings?.add_due_to_my_day, now])

  // Closing the app deletes any tasks still waiting, and Ctrl+Z outside a text field undoes the last removal.
  useEffect(() => {
    const undo_on_shortcut = (event: KeyboardEvent): void => {
      if (!is_typing(event) && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && pending_removal.current) {
        event.preventDefault()
        undo_removal()
      }
    }
    window.addEventListener('keydown', undo_on_shortcut)
    window.addEventListener('beforeunload', finish_removal)
    return () => {
      window.removeEventListener('keydown', undo_on_shortcut)
      window.removeEventListener('beforeunload', finish_removal)
    }
  }, [])

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

  const open_context_menu: OpenContextMenu = (event, items) => {
    event.preventDefault()
    set_context_menu({ x: event.clientX, y: event.clientY, items })
  }

  const close_context_menu = useCallback(() => set_context_menu(null), [])

  // The phone's Back button closes whatever sits on top, from a menu down to Settings, as Android apps do.
  useEffect(() => {
    const step_back = (event: Event): void => {
      if (context_menu) set_context_menu(null)
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
  }, [context_menu, rescheduling_task_ids, filter_editing, editing_group, picked_task_ids, selected_task_id, is_sidebar_open, is_settings_open])

  // Escape lets go of the picked tasks, and Ctrl+A picks every row on screen, both outside text fields, menus and dialogs.
  useEffect(() => {
    const pick_on_shortcut = (event: KeyboardEvent): void => {
      if (is_typing(event) || context_menu || (event.target instanceof Element && event.target.closest('dialog'))) return
      if (event.key === 'Escape' && picked_task_ids.length > 0) {
        event.preventDefault()
        set_picked_task_ids([])
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'a' && shown_rows_ref.current.length > 0) {
        event.preventDefault()
        set_picked_task_ids(shown_rows_ref.current.map((task) => task.id))
        set_selected_task_id(null)
      }
    }
    window.addEventListener('keydown', pick_on_shortcut)
    return () => window.removeEventListener('keydown', pick_on_shortcut)
  }, [context_menu, picked_task_ids])

  // Changes a setting on screen only, as a panel does while its edge is being dragged.
  function show_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): void {
    set_settings((current_settings) => current_settings && { ...current_settings, [key]: value })
  }

  async function change_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): Promise<void> {
    show_setting(key, value)
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

  // The Completed view takes no new tasks, so pressing Enter there only searches.
  async function submit_multibar(event: Event): Promise<void> {
    event.preventDefault()
    const title = multibar_text.trim()
    if (!title || selected_view.kind === 'completed') return

    const added_task = await window.x_tasks.add_task(title, null, tag_ids_for_new_task(selected_view, tags, tag_groups), my_day_for_new_task(selected_view, today))
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_multibar_text('')
    // Upcoming shows only dated tasks, so one added there is dated today.
    if (selected_view.kind === 'upcoming') {
      const schedule = { start_at: added_task.start_at, due_at: added_task.due_at, recurrence: added_task.recurrence }
      set_task_schedule(added_task, settings!.task_date_field === 'start' ? { ...schedule, start_at: today } : { ...schedule, due_at: today })
    }
  }

  // A subtask shows wherever its parent does, so it needs no tags of its own.
  async function add_subtask(parent: Task, title: string): Promise<void> {
    const added_task = await window.x_tasks.add_task(title, parent.id, [], null)
    set_tasks((current_tasks) => [...current_tasks, added_task])
  }

  // A task given a due date that has already come goes straight into My Day when that setting is on.
  function set_task_schedule(task: Task, schedule: TaskSchedule): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, ...schedule } : each)))
    void window.x_tasks.set_task_schedule(task.id, schedule)

    if (!settings?.add_due_to_my_day || is_in_my_day(task, my_day_since(settings, today))) return
    if (is_due_by({ ...task, ...schedule }, now, settings.task_date_field)) set_task_my_day(task, today)
  }

  // Completing a task completes its subtasks; a recurring one moves to its next occurrence and resets its subtasks instead.
  function toggle_task(task: Task): void {
    if (task.is_done) return save_task_done(task, false, null, { kind: 'remove' })

    const done_at = new Date().toISOString()
    const log_change: CompletionLogChange = { kind: 'add', occurrence_on: recurrence_anchor(task) }
    // A completed top-level task can leave My Day, as the settings choose.
    const leaves_my_day = Boolean(settings?.remove_done_from_my_day) && task.parent_id === null && task.my_day_on !== null
    if (leaves_my_day) set_task_my_day(task, null)
    const next = next_schedule(task)
    if (next) {
      // A next occurrence that is already due goes back into My Day.
      set_task_schedule(leaves_my_day ? { ...task, my_day_on: null } : task, next)
      save_task_done(task, false, done_at, log_change)
      return reset_subtasks(task)
    }

    save_task_done(task, true, done_at, log_change)
    complete_subtasks(task)
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
    pending_removal.current = {
      root_ids: removed_tasks.map((task) => task.id),
      tasks: tasks.filter((task) => removed_ids.has(task.id)),
      timer: window.setTimeout(finish_removal, UNDO_DELAY_MS)
    }
    set_tasks((current_tasks) => current_tasks.filter((each) => !removed_ids.has(each.id)))
    set_undo_message(removed_tasks.length === 1 ? `Deleted "${removed_tasks[0]!.title}"` : `Deleted ${removed_tasks.length} tasks`)
  }

  // Deletes the waiting tasks from the database; the database removes their subtasks along with them.
  function finish_removal(): void {
    const removal = pending_removal.current
    if (!removal) return
    pending_removal.current = null
    window.clearTimeout(removal.timer)
    for (const task_id of removal.root_ids) void window.x_tasks.remove_task(task_id)
    set_undo_message(null)
  }

  // The database never lost the waiting tasks, so fetching the list again puts them back in their places.
  function undo_removal(): void {
    const removal = pending_removal.current
    if (!removal) return
    pending_removal.current = null
    window.clearTimeout(removal.timer)
    void window.x_tasks.list_tasks().then((loaded_tasks) => set_tasks(without_pending(loaded_tasks)))
    set_undo_message(null)
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

  function move_tag_group(dragged: TagGroup, target: TagGroup, placement: SidePlacement): void {
    if (dragged.id === target.id) return
    const position = position_for_drop(dragged, target, placement, tag_groups)

    set_tag_groups((current_groups) => current_groups.map((each) => (each.id === dragged.id ? { ...each, position } : each)).sort(by_position))
    void window.x_tasks.move_tag_group(dragged.id, position)
  }

  async function add_tag(
    name: string, group_id: string, parent_id: string | null, rule: TagRule | null = null, color: string | null = null, icon: string | null = null
  ): Promise<void> {
    const added_tag = await window.x_tasks.add_tag(name, group_id, parent_id, rule, color, icon)
    set_tags((current_tags) => [...current_tags, added_tag])
    select_view({ kind: 'tag', tag_ids: [added_tag.id] })
  }

  // A tag that becomes a rule leaves every task that held it by hand.
  function save_filter(name: string, rule: TagRule | null, color: string | null, icon: string | null): void {
    if (!filter_editing) return
    if (!('tag' in filter_editing)) return void add_tag(name, filter_editing.group_id, filter_editing.parent_id, rule, color, icon)

    const tag_id = filter_editing.tag.id
    set_tags((current_tags) => current_tags.map((each) => (each.id === tag_id ? { ...each, name, rule, color, icon } : each)))
    if (rule) {
      set_tasks((current_tasks) =>
        current_tasks.map((task) => (task.tag_ids.includes(tag_id) ? { ...task, tag_ids: task.tag_ids.filter((id) => id !== tag_id) } : task))
      )
    }
    void window.x_tasks.update_tag(tag_id, name, rule, color, icon)
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

  function move_tag(dragged: Tag, target: Tag, placement: DropPlacement): void {
    if (subtree_ids(dragged.id, tags).has(target.id)) return
    const move = move_for_drop(dragged, target, placement, tags)

    set_tags((current_tags) => current_tags.map((each) => (each.id === dragged.id ? { ...each, ...move } : each)).sort(by_position))
    void window.x_tasks.move_tag(dragged.id, move.parent_id, move.position)
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

  // Nothing is drawn until the settings arrive, so the launch view never flashes past.
  if (!settings) return null

  const is_reports = selected_view.kind === 'reports'
  const is_table = settings.task_layout === 'table' && !is_reports
  const shown_since = my_day_since(settings, today)
  const search_text = multibar_text.trim().toLowerCase()
  const is_searching = search_text !== ''
  const view_tasks = tasks.filter((task) => task_is_in_view(task, selected_view, tasks, tags, shown_since, settings.tag_match, settings.tag_scope, settings.task_date_field))
  const searched_tasks = settings.search_scope === 'all' ? tasks : view_tasks
  const visible_tasks = is_searching ? searched_tasks.filter((task) => task_matches_search(task, search_text)) : view_tasks
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length

  // The table's filters and sort apply only to the table layout; the list keeps every task in its dragged order.
  const is_filtered = is_table && has_table_filters(table_filters)
  const is_sorted = is_table && settings.table_sort.length > 0
  const shown_tasks = is_filtered ? visible_tasks.filter((task) => task_passes_filters(task, table_filters, tasks, tags, streak_of, today, settings.task_date_field, last_done_of)) : visible_tasks
  const nested_tasks = nest_tasks(shown_tasks, tasks)
  // A completed task with an open subtask stays, and one whose parent is cleared goes with that parent.
  const open_task_ids = new Set(tasks.filter((task) => !task.is_done).map((task) => task.id))
  const fully_done_ids = new Set(
    shown_tasks.filter((task) => task.is_done && ![...subtree_ids(task.id, tasks)].some((id) => open_task_ids.has(id))).map((task) => task.id)
  )
  const clearable_tasks = shown_tasks.filter((task) => fully_done_ids.has(task.id) && (task.parent_id === null || !fully_done_ids.has(task.parent_id)))
  const column_order = ordered_columns(settings.table_column_order, tag_groups)
  const table_columns = column_order.filter((column) => is_column_shown(column, settings.hidden_table_columns, settings.shown_table_columns))
  const task_tree = is_sorted ? sort_task_tree(nested_tasks, settings.table_sort, tags, task_tags_of, streak_of, settings.task_date_field, last_done_of) : nested_tasks

  // Upcoming always groups by date and lists the later dates of repeating tasks; other views group as picked.
  const is_upcoming = selected_view.kind === 'upcoming'
  const grouped_tag_group = is_upcoming ? null : grouping_tag_group(settings.task_grouping, tag_groups)
  const is_grouped_by_date = is_upcoming || settings.task_grouping === 'date'
  const is_grouped = is_grouped_by_date || grouped_tag_group !== null
  const repeats = is_upcoming ? coming_repeats(shown_tasks, settings.task_date_field, now, settings.upcoming_repeat_days) : []
  const task_groups = grouped_tag_group
    ? group_by_tag(task_tree, grouped_tag_group, tags, task_tags_of)
    : is_grouped_by_date ? group_by_date(task_tree, repeats, settings.task_date_field, now, is_sorted) : []
  const shown_grouping = is_grouped ? settings.task_grouping : 'none'

  // Every row on screen from top to bottom, leaving out those inside collapsed tasks; only these can be picked.
  const shown_rows = is_settings_open || is_reports ? [] : rows_of(is_grouped ? task_groups.flatMap((group) => group.nodes) : task_tree, settings.collapsed_task_ids)
  shown_rows_ref.current = shown_rows
  // Picked tasks that leave the screen, through a search or a filter, are left out of every bulk action.
  const picked_tasks = shown_rows.filter((task) => picked_task_ids.includes(task.id))
  const is_picking = picked_tasks.length > 0

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
    set_picked_task_ids(start_ids.includes(task.id) ? start_ids.filter((id) => id !== task.id) : [...start_ids, task.id])
    pick_anchor_id.current = task.id
    set_selected_task_id(null)
  }

  // Adds every row between the anchor and this one to the picked tasks, or picks just this one when there is no anchor on screen.
  function pick_range(task: Task): void {
    const anchor_id = is_picking ? pick_anchor_id.current : selected_task_id
    const anchor_index = shown_rows.findIndex((each) => each.id === anchor_id)
    const task_index = shown_rows.findIndex((each) => each.id === task.id)
    if (anchor_index === -1 || task_index === -1) return toggle_picked(task)

    const range_ids = shown_rows.slice(Math.min(anchor_index, task_index), Math.max(anchor_index, task_index) + 1).map((each) => each.id)
    set_picked_task_ids([...new Set([...picked_tasks.map((each) => each.id), ...range_ids])])
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
    for (const task of picked_roots(true)) if (!task.is_done) toggle_task(task)
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
      tags_in_sidebar_order(tags.filter((tag) => tag.group_id === group.id && !tag.rule)).map((tag) => ({
        label: `${group.name}: ${tag_path(tag, tags)}`,
        is_chosen: picked_tasks.every((task) => task.tag_ids.includes(tag.id)),
        on_select: () => toggle_picked_tag(tag)
      }))
    )
  }

  function open_tag_menu(event: MouseEvent): void {
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect()
    set_context_menu({ x: button.left, y: button.top, items: tag_menu_items() })
  }

  // The same actions as the bar at the foot of the window, for a right-click on any picked row.
  function open_bulk_menu(event: MouseEvent): void {
    const has_open = picked_tasks.some((task) => !task.is_done)
    const has_done = picked_tasks.some((task) => task.is_done)
    open_context_menu(event, [
      ...(has_open ? [{ label: 'Mark done', on_select: complete_picked }] : []),
      ...(has_done ? [{ label: 'Mark not done', on_select: reopen_picked }] : []),
      { label: 'Reschedule…', on_select: () => set_rescheduling_task_ids(picked_tasks.map((task) => task.id)) },
      all_picked_in_my_day
        ? { label: 'Remove from My Day', on_select: () => set_picked_my_day(false) }
        : { label: 'Add to My Day', on_select: () => set_picked_my_day(true) },
      { label: 'Tags…', on_select: () => set_context_menu({ x: event.clientX, y: event.clientY, items: tag_menu_items() }) },
      { label: 'Clear selection', on_select: () => set_picked_task_ids([]) },
      { label: `Delete ${picked_tasks.length === 1 ? 'task' : `${picked_tasks.length} tasks`}`, on_select: remove_picked, is_danger: true }
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
    is_table,
    tint_rows: settings.tint_rows_by_tag,
    table_columns,
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
    on_context_menu: open_context_menu,
    on_toggle: toggle_task,
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

  return (
    <div class="app">
      <form class="multibar" onSubmit={submit_multibar}>
        <button type="button" class="menu_button" onClick={() => set_is_sidebar_open(!is_sidebar_open)} aria-label="Menu" aria-expanded={is_sidebar_open}>
          ☰
        </button>
        <input
          value={multibar_text}
          onInput={(event) => change_multibar_text(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Escape' && set_multibar_text('')}
          placeholder={can_add_task ? 'Search, or press Enter to add a task' : settings.search_scope === 'all' ? 'Search all tasks' : 'Search completed tasks'}
          aria-label="Search or add a task"
          autofocus={!IS_TOUCH_SCREEN}
        />
        {can_add_task && (
          <button type="submit" disabled={!is_searching}>
            Add
          </button>
        )}
      </form>

      <div
        class={`app_body${selected_task ? ' has_detail' : ''}${is_sidebar_open ? ' is_sidebar_open' : ''}`}
        style={{ '--sidebar-width': `${settings.sidebar_width}px`, '--detail-width': `${settings.detail_width}px` }}
      >
        <Sidebar
          tasks={tasks}
          tag_groups={tag_groups}
          tags={tags}
          my_day_since={shown_since}
          tag_scope={settings.tag_scope}
          show_empty_tags={settings.show_empty_tags}
          date_field={settings.task_date_field}
          selected_view={is_settings_open ? null : selected_view}
          is_settings_open={is_settings_open}
          dragged_task={dragged_task}
          collapsed_ids={settings.collapsed_sidebar_ids}
          on_set_collapsed_ids={(ids) => void change_setting('collapsed_sidebar_ids', ids)}
          on_select_view={select_view}
          on_toggle_tag={(tag) => select_view(view_with_tag_toggled(selected_view, tag, tags, settings.tag_selection))}
          on_open_settings={() => {
            set_is_settings_open(true)
            set_is_sidebar_open(false)
          }}
          on_edit_tag_group={set_editing_group}
          on_remove_tag_group={remove_tag_group}
          on_move_tag_group={move_tag_group}
          on_add_tag={add_tag}
          on_add_rule_tag={(group_id, parent_id) => set_filter_editing({ group_id, parent_id })}
          on_edit_tag={(tag) => set_filter_editing({ tag })}
          on_remove_tag={remove_tag}
          on_move_tag={move_tag}
          on_tag_task={tag_dragged_tasks}
          on_context_menu={open_context_menu}
        />
        {is_sidebar_open && <button class="sidebar_backdrop" onClick={() => set_is_sidebar_open(false)} aria-label="Close menu" />}
        <ResizeHandle
          side="left"
          width={settings.sidebar_width}
          min_width={SIDEBAR_WIDTH_RANGE.min}
          max_width={SIDEBAR_WIDTH_RANGE.max}
          default_width={DEFAULT_SETTINGS.sidebar_width}
          on_resize={(width) => show_setting('sidebar_width', width)}
          on_resize_end={(width) => void change_setting('sidebar_width', width)}
          label="Resize sidebar"
        />

        <main class={is_table && !is_settings_open ? 'task_pane is_table' : 'task_pane'}>
          {is_settings_open ? (
            <SettingsPage settings={settings} on_change={change_setting} on_add_tag_group={add_tag_group} />
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
              on_context_menu={open_context_menu}
            />
          ) : (
            <>
              <header class="task_pane_header">
                <h1>{view_title(selected_view, tags)}</h1>
                {selected_view.kind === 'my_day' && (
                  <span class="my_day_date">
                    {parse_task_date(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                )}
                <span class="remaining_count">{remaining_count} left</span>
                {selected_view.kind === 'my_day' && visible_tasks.length > 0 && (
                  <button class="clear_my_day_button" onClick={clear_my_day}>
                    Clear
                  </button>
                )}
                {clearable_tasks.length > 0 && (
                  <button class="clear_completed_button" onClick={() => clear_completed(clearable_tasks)} title="Delete the completed tasks shown here">
                    Clear completed
                  </button>
                )}
                {parent_ids.length > 0 && (
                  <>
                    <button class="collapse_all_button" onClick={() => set_tasks_collapsed(parent_ids, true)} disabled={!has_expanded_parent} title="Collapse every task with subtasks">
                      Collapse all
                    </button>
                    <button class="expand_all_button" onClick={() => set_tasks_collapsed(parent_ids, false)} disabled={!has_collapsed_parent} title="Expand every task with subtasks">
                      Expand all
                    </button>
                  </>
                )}
                {!is_upcoming && (
                  <select
                    class={is_grouped ? 'grouping_select is_selected' : 'grouping_select'}
                    value={shown_grouping}
                    onChange={(event) => void change_setting('task_grouping', event.currentTarget.value as TaskGrouping)}
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
                <div class="segmented_control" role="radiogroup" aria-label="Layout">
                  {TASK_LAYOUT_CHOICES.map(({ value, label }) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={settings.task_layout === value}
                      class={settings.task_layout === value ? 'is_selected' : ''}
                      onClick={() => void change_setting('task_layout', value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>

              <ul class={is_table ? 'task_list is_table' : 'task_list'} style={{
                  '--data-columns': table_columns.map((column) => `${column_width(settings.table_column_widths, column)}px`).join(' '),
                  '--data-width': `calc(${table_columns.reduce((total, column) => total + column_width(settings.table_column_widths, column), 0)}px + ${table_columns.length} * var(--space-4))`
                }}>
                {is_table && visible_tasks.length > 0 && (
                  <TaskTableHeader
                    tag_groups={tag_groups}
                    tags={tags}
                    column_order={column_order}
                    shown_columns={table_columns}
                    on_move_column={(column, target, is_after) => void change_setting('table_column_order', move_column(column_order, column, target, is_after))}
                    on_show_column={show_table_column}
                    column_widths={settings.table_column_widths}
                    on_resize_column={(column, width) => show_setting('table_column_widths', { ...settings.table_column_widths, [column]: width })}
                    on_resize_column_end={(column, width) => void change_setting('table_column_widths', { ...settings.table_column_widths, [column]: width })}
                    sort={settings.table_sort}
                    on_sort={(column, is_adding) => void change_setting('table_sort', sort_after_click(settings.table_sort, column, is_adding))}
                    filters={table_filters}
                    on_filter={set_table_filters}
                  />
                )}
                {is_grouped
                  ? task_groups.map((group) => (
                      <Fragment key={group.key}>
                        <li class={is_grouped_by_date && group.key === 'overdue' ? 'group_heading is_overdue' : 'group_heading'}>
                          {group.label}
                          <span class="group_count">{group.nodes.length + group.repeats.length}</span>
                        </li>
                        {group.nodes.map((node) => (
                          <TaskItem key={node.task.id} node={node} actions={task_actions} />
                        ))}
                        {group.repeats.map((repeat) => (
                          <RepeatItem key={`${repeat.task.id}@${repeat.task_date}`} repeat={repeat} actions={task_actions} />
                        ))}
                      </Fragment>
                    ))
                  : task_tree.map((node) => <TaskItem key={node.task.id} node={node} actions={task_actions} />)}
              </ul>

              {visible_tasks.length === 0 && <p class="empty_message">{is_searching ? 'No tasks match the search.' : 'Nothing here yet.'}</p>}
              {visible_tasks.length > 0 && task_tree.length === 0 && <p class="empty_message">No tasks match the filters.</p>}
            </>
          )}
        </main>

        {selected_task && (
          <ResizeHandle
            side="right"
            width={settings.detail_width}
            min_width={DETAIL_WIDTH_RANGE.min}
            max_width={DETAIL_WIDTH_RANGE.max}
            default_width={DEFAULT_SETTINGS.detail_width}
            on_resize={(width) => show_setting('detail_width', width)}
            on_resize_end={(width) => void change_setting('detail_width', width)}
            label="Resize task details"
          />
        )}

        {selected_task && (
          <TaskDetail
            key={selected_task.id}
            task={selected_task}
            tag_groups={tag_groups}
            tags={tags}
            subtask_count={subtree_ids(selected_task.id, tasks).size - 1}
            durations={settings.task_durations}
            on_toggle={toggle_task}
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
            swatches={settings.tag_colors}
            tag_id={'tag' in filter_editing ? filter_editing.tag.id : null}
            tags={tags}
            groups={tag_groups}
            tasks={tasks}
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

        {context_menu && <ContextMenu menu={context_menu} on_close={close_context_menu} />}

        <UntrustedCertificatePrompt />

        {is_picking && (
          <div class="selection_bar" role="toolbar" aria-label="Selected tasks">
            <button class="selection_close_button" onClick={() => set_picked_task_ids([])} aria-label="Clear selection" title="Clear selection (Esc)">
              ✕
            </button>
            <span class="selection_count" title="Click rows to add or remove them, Shift+click to add a range, Ctrl+A to select all">
              {picked_tasks.length} selected
            </span>
            {picked_tasks.length < shown_rows.length && (
              <button onClick={() => set_picked_task_ids(shown_rows.map((task) => task.id))}>Select all</button>
            )}
            <span class="selection_divider" />
            {picked_tasks.some((task) => !task.is_done) && <button onClick={complete_picked}>Mark done</button>}
            {picked_tasks.some((task) => task.is_done) && <button onClick={reopen_picked}>Mark not done</button>}
            <button onClick={() => set_rescheduling_task_ids(picked_tasks.map((task) => task.id))}>Reschedule…</button>
            <button onClick={() => set_picked_my_day(!all_picked_in_my_day)}>{all_picked_in_my_day ? 'Remove from My Day' : 'Add to My Day'}</button>
            <button onMouseDown={(event) => event.stopPropagation()} onClick={(event) => (context_menu ? close_context_menu() : open_tag_menu(event))}>
              Tags…
            </button>
            <button class="selection_delete_button" onClick={remove_picked}>
              Delete
            </button>
          </div>
        )}

        {undo_message && (
          <div class="undo_bar" role="status">
            <span class="undo_message">{undo_message}</span>
            <button class="undo_button" onClick={undo_removal}>
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
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
// Keyboard
// ============================================================================

// Shortcuts stay out of the way while text is being typed.
function is_typing(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName))
}

// ============================================================================
// Search
// ============================================================================

// A task matches when its title or notes hold the search text, ignoring case.
function task_matches_search(task: Task, search_text: string): boolean {
  return task.title.toLowerCase().includes(search_text) || task.notes.toLowerCase().includes(search_text)
}
