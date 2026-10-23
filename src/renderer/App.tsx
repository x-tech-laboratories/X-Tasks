import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'

import { DEFAULT_SETTINGS, DETAIL_WIDTH_RANGE, SIDEBAR_WIDTH_RANGE, type Settings, type TaskLayout } from '@shared/settings'
import type { Completion, CompletionLogChange, Tag, TagGroup, TagRule, Task, TaskSchedule } from '@shared/tasks'
import { completions_after, routine_streak, type RoutineStreak } from '@shared/streaks'
import { ContextMenu, type OpenContextMenu, type OpenMenu } from './ContextMenu'
import { ReportsPage } from './ReportsPage'
import { ReschedulePopup } from './ReschedulePopup'
import { ResizeHandle } from './ResizeHandle'
import { RuleDialog } from './RuleDialog'
import { SettingsPage } from './SettingsPage'
import { Sidebar } from './Sidebar'
import { TaskDetail } from './TaskDetail'
import { TaskItem, TaskTableHeader, type TaskActions } from './TaskItem'
import { EMPTY_RULE } from './rules'
import { format_task_date, next_schedule, parse_task_date, recurrence_anchor } from '@shared/schedule'
import { EMPTY_TABLE_FILTERS, has_table_filters, sort_after_click, sort_task_tree, task_passes_filters, type TableFilters } from './table'
import {
  by_position, is_due_by, is_in_my_day, launch_view, move_for_drop, my_day_for_new_task, my_day_since, nest_tasks, position_for_drop, rule_tags_of, subtree_ids,
  tag_ids_for_new_task, task_is_in_view, view_title, view_with_tag_toggled, view_without_tags, type DropPlacement, type SidePlacement, type View
} from './views'

// ============================================================================
// Choices
// ============================================================================

const TASK_LAYOUT_CHOICES: { value: TaskLayout; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' }
]

// ============================================================================
// App
// ============================================================================

// The rule tag open in the rule dialog: an existing one, or a new one about to be added at a spot in a group.
type RuleEditing = { tag: Tag } | { group_id: string; parent_id: string | null }

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
  const [completions, set_completions] = useState<Completion[]>([])
  const [has_loaded_tasks, set_has_loaded_tasks] = useState(false)
  const [tag_groups, set_tag_groups] = useState<TagGroup[]>([])
  const [tags, set_tags] = useState<Tag[]>([])
  const [settings, set_settings] = useState<Settings | null>(null)
  const [selected_view, set_selected_view] = useState<View>({ kind: 'all' })
  const [is_settings_open, set_is_settings_open] = useState(false)
  const [new_title, set_new_title] = useState('')
  const [dragged_task, set_dragged_task] = useState<Task | null>(null)
  const [selected_task_id, set_selected_task_id] = useState<string | null>(null)
  const [context_menu, set_context_menu] = useState<OpenMenu | null>(null)
  const [rescheduling_task_id, set_rescheduling_task_id] = useState<string | null>(null)
  const [today, set_today] = useState(() => format_task_date(new Date(), false))
  const [rule_editing, set_rule_editing] = useState<RuleEditing | null>(null)
  const [table_filters, set_table_filters] = useState<TableFilters>(EMPTY_TABLE_FILTERS)

  useEffect(() => {
    void window.x_tasks.list_tasks().then((loaded_tasks) => {
      set_tasks(loaded_tasks)
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
        void window.x_tasks.list_tasks().then(set_tasks)
        void window.x_tasks.list_completions().then(set_completions)
        void window.x_tasks.list_tag_groups().then(set_tag_groups)
        void window.x_tasks.list_tags().then(set_tags)
      }),
    []
  )

  // Checks the date every minute, so My Day clears itself at midnight while the app is open.
  useEffect(() => {
    const timer = window.setInterval(() => set_today(format_task_date(new Date(), false)), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Puts due tasks into My Day once a day, so ones taken out by hand stay out until tomorrow.
  useEffect(() => {
    if (!has_loaded_tasks || !settings?.add_due_to_my_day || settings.due_added_to_my_day_on === today) return
    const shown_since = my_day_since(settings, today)
    for (const task of tasks) if (is_due_by(task, today) && !is_in_my_day(task, shown_since)) set_task_my_day(task, today)
    void change_setting('due_added_to_my_day_on', today)
  }, [has_loaded_tasks, settings?.add_due_to_my_day, today])

  // ==========================================================================
  // Navigation and settings
  // ==========================================================================

  // The chosen view is saved so the next launch can reopen it.
  function select_view(view: View): void {
    set_selected_view(view)
    set_is_settings_open(false)
    void window.x_settings.set_setting('last_view', view)
  }

  const open_context_menu: OpenContextMenu = (event, items) => {
    event.preventDefault()
    set_context_menu({ x: event.clientX, y: event.clientY, items })
  }

  const close_context_menu = useCallback(() => set_context_menu(null), [])

  // Changes a setting on screen only, as a panel does while its edge is being dragged.
  function show_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): void {
    set_settings((current_settings) => current_settings && { ...current_settings, [key]: value })
  }

  // A new priority scale renames tags and can move tasks between them, so both are fetched again.
  async function change_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): Promise<void> {
    show_setting(key, value)
    await window.x_settings.set_setting(key, value)

    if (key === 'priority_scale') {
      set_tags(await window.x_tasks.list_tags())
      set_tasks(await window.x_tasks.list_tasks())
    }
  }

  // ==========================================================================
  // Task changes
  // ==========================================================================

  async function submit_new_task(event: Event): Promise<void> {
    event.preventDefault()
    const title = new_title.trim()
    if (!title) return

    const added_task = await window.x_tasks.add_task(title, null, tag_ids_for_new_task(selected_view, tags), my_day_for_new_task(selected_view, today))
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_new_title('')
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
    if (is_due_by({ ...task, ...schedule }, today)) set_task_my_day(task, today)
  }

  // Completing a task completes its subtasks; a recurring one moves to its next occurrence and resets its subtasks instead.
  function toggle_task(task: Task): void {
    if (task.is_done) return save_task_done(task, false, null, { kind: 'remove' })

    const done_at = new Date().toISOString()
    const log_change: CompletionLogChange = { kind: 'add', occurrence_on: recurrence_anchor(task) }
    const next = next_schedule(task)
    if (next) {
      set_task_schedule(task, next)
      save_task_done(task, false, done_at, log_change)
      return set_subtasks_done(task, false, done_at)
    }

    save_task_done(task, true, done_at, log_change)
    set_subtasks_done(task, true, done_at)
  }

  function save_task_done(task: Task, is_done: boolean, done_at: string | null, log_change: CompletionLogChange): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, is_done, done_at } : each)))
    set_completions((current_completions) => completions_after(current_completions, task.id, done_at, log_change))
    void window.x_tasks.set_task_done(task.id, is_done, done_at, log_change)
  }

  // Subtasks reset by a recurring parent keep the time they were last done, and their ticks stay in the log.
  function set_subtasks_done(task: Task, is_done: boolean, done_at: string): void {
    const subtask_ids = subtree_ids(task.id, tasks)
    subtask_ids.delete(task.id)
    for (const each of tasks) {
      if (!subtask_ids.has(each.id) || each.is_done === is_done) continue
      if (is_done) save_task_done(each, true, done_at, { kind: 'add', occurrence_on: recurrence_anchor(each) })
      else save_task_done(each, false, each.done_at, { kind: 'none' })
    }
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

  // The database removes subtasks along with their parent, so the screen drops them too.
  function remove_task(task: Task): void {
    set_tasks((current_tasks) => {
      const removed_ids = subtree_ids(task.id, current_tasks)
      return current_tasks.filter((each) => !removed_ids.has(each.id))
    })
    void window.x_tasks.remove_task(task.id)
  }

  // A task cannot be dropped onto itself or anything nested under it.
  function can_drop_task_on(target: Task): boolean {
    return dragged_task !== null && !subtree_ids(dragged_task.id, tasks).has(target.id)
  }

  function drop_task(target: Task, placement: DropPlacement): void {
    if (!dragged_task || !can_drop_task_on(target)) return
    const move = move_for_drop(dragged_task, target, placement, tasks)

    set_tasks((current_tasks) =>
      current_tasks.map((each) => (each.id === dragged_task.id ? { ...each, ...move } : each)).sort(by_position)
    )
    set_dragged_task(null)
    void window.x_tasks.move_task(dragged_task.id, move.parent_id, move.position)
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

  async function add_tag_group(name: string): Promise<void> {
    const added_group = await window.x_tasks.add_tag_group(name)
    set_tag_groups((current_groups) => [...current_groups, added_group])
  }

  function remove_tag_group(group: TagGroup): void {
    const is_confirmed =
      !settings?.confirm_tag_removal || window.confirm(`Delete the group "${group.name}" and all its tags? Tasks are kept.`)
    if (!is_confirmed) return

    forget_tags(new Set(tags.filter((tag) => tag.group_id === group.id).map((tag) => tag.id)))
    set_tag_groups((current_groups) => current_groups.filter((each) => each.id !== group.id))
    void window.x_tasks.remove_tag_group(group.id)
  }

  function set_tag_group_single_choice(group: TagGroup, is_single_choice: boolean): void {
    set_tag_groups((current_groups) => current_groups.map((each) => (each.id === group.id ? { ...each, is_single_choice } : each)))
    void window.x_tasks.set_tag_group_single_choice(group.id, is_single_choice)
  }

  function move_tag_group(dragged: TagGroup, target: TagGroup, placement: SidePlacement): void {
    if (dragged.id === target.id) return
    const position = position_for_drop(dragged, target, placement, tag_groups)

    set_tag_groups((current_groups) => current_groups.map((each) => (each.id === dragged.id ? { ...each, position } : each)).sort(by_position))
    void window.x_tasks.move_tag_group(dragged.id, position)
  }

  async function add_tag(name: string, group_id: string, parent_id: string | null, rule: TagRule | null = null): Promise<void> {
    const added_tag = await window.x_tasks.add_tag(name, group_id, parent_id, rule)
    set_tags((current_tags) => [...current_tags, added_tag])
    select_view({ kind: 'tag', tag_ids: [added_tag.id] })
  }

  function save_rule_tag(name: string, rule: TagRule): void {
    if (!rule_editing) return
    if (!('tag' in rule_editing)) return void add_tag(name, rule_editing.group_id, rule_editing.parent_id, rule)

    const tag_id = rule_editing.tag.id
    set_tags((current_tags) => current_tags.map((each) => (each.id === tag_id ? { ...each, name, rule } : each)))
    void window.x_tasks.set_tag_rule(tag_id, name, rule)
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
      const streak = routine_streak(task, completions, now)
      if (streak) streaks.set(task.id, streak)
    }
    return streaks
  }, [tasks, completions, today])

  // Nothing is drawn until the settings arrive, so the launch view never flashes past.
  if (!settings) return null

  const is_reports = selected_view.kind === 'reports'
  const is_table = settings.task_layout === 'table' && !is_reports
  const shown_since = my_day_since(settings, today)
  const visible_tasks = tasks.filter((task) => task_is_in_view(task, selected_view, tasks, tags, shown_since))
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length

  // The table's filters and sort apply only to the table layout; the list keeps every task in its dragged order.
  const is_filtered = is_table && has_table_filters(table_filters)
  const is_sorted = is_table && settings.table_sort.length > 0
  const shown_tasks = is_filtered ? visible_tasks.filter((task) => task_passes_filters(task, table_filters, tasks, tags, today)) : visible_tasks
  const nested_tasks = nest_tasks(shown_tasks, tasks)
  const task_tree = is_sorted ? sort_task_tree(nested_tasks, settings.table_sort, tags, task_tags_of) : nested_tasks

  // The tags a task's row shows: its own and the rule tags that match it.
  function task_tags_of(task: Task): Tag[] {
    return [...tags.filter((tag) => task.tag_ids.includes(tag.id)), ...rule_tags_of(task, tasks, tags)]
  }

  // The detail panel stays out of the way while the settings page is open.
  const selected_task = is_settings_open ? null : (tasks.find((task) => task.id === selected_task_id) ?? null)
  const rescheduling_task = tasks.find((task) => task.id === rescheduling_task_id) ?? null

  const task_actions: TaskActions = {
    tags,
    tag_groups,
    is_table,
    can_add_subtasks: selected_view.kind !== 'completed',
    selected_task_id,
    on_select: (task) => set_selected_task_id(task.id),
    on_context_menu: open_context_menu,
    on_toggle: toggle_task,
    on_reschedule: (task) => set_rescheduling_task_id(task.id),
    is_in_my_day: (task) => is_in_my_day(task, shown_since),
    on_set_my_day: (task, is_added) => set_task_my_day(task, is_added ? today : null),
    on_remove: remove_task,
    on_add_subtask: add_subtask,
    on_untag: untag_task,
    rule_tags_of: (task) => rule_tags_of(task, tasks, tags),
    streak_of: (task) => streak_by_task_id.get(task.id) ?? null,
    on_drag_start: set_dragged_task,
    on_drag_end: () => set_dragged_task(null),
    // A sorted table ignores the dragged order, so tasks can still be dragged onto tags but not between rows.
    can_drop_on: (target) => !is_sorted && can_drop_task_on(target),
    on_drop: drop_task
  }

  return (
    <div
      class={selected_task ? 'app has_detail' : 'app'}
      style={{ '--sidebar-width': `${settings.sidebar_width}px`, '--detail-width': `${settings.detail_width}px` }}
    >
      <Sidebar
        tasks={tasks}
        tag_groups={tag_groups}
        tags={tags}
        my_day_since={shown_since}
        selected_view={is_settings_open ? null : selected_view}
        is_settings_open={is_settings_open}
        dragged_task={dragged_task}
        on_select_view={select_view}
        on_toggle_tag={(tag) => select_view(view_with_tag_toggled(selected_view, tag, tags))}
        on_open_settings={() => set_is_settings_open(true)}
        on_remove_tag_group={remove_tag_group}
        on_set_tag_group_single_choice={set_tag_group_single_choice}
        on_move_tag_group={move_tag_group}
        on_add_tag={add_tag}
        on_add_rule_tag={(group_id, parent_id) => set_rule_editing({ group_id, parent_id })}
        on_edit_rule_tag={(tag) => set_rule_editing({ tag })}
        on_remove_tag={remove_tag}
        on_move_tag={move_tag}
        on_tag_task={tag_task}
        on_context_menu={open_context_menu}
      />
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

            {selected_view.kind !== 'completed' && (
              <form class="new_task_form" onSubmit={submit_new_task}>
                <input
                  value={new_title}
                  onInput={(event) => set_new_title(event.currentTarget.value)}
                  placeholder="What needs doing?"
                  autofocus
                />
                <button type="submit">Add</button>
              </form>
            )}

            <ul class={is_table ? 'task_list is_table' : 'task_list'} style={{ '--group-columns': tag_groups.map(() => 'var(--column-group)').join(' '), '--group-count': tag_groups.length }}>
              {is_table && visible_tasks.length > 0 && (
                <TaskTableHeader
                  tag_groups={tag_groups}
                  tags={tags}
                  sort={settings.table_sort}
                  on_sort={(column, is_adding) => void change_setting('table_sort', sort_after_click(settings.table_sort, column, is_adding))}
                  filters={table_filters}
                  on_filter={set_table_filters}
                />
              )}
              {task_tree.map((node) => (
                <TaskItem key={node.task.id} node={node} actions={task_actions} />
              ))}
            </ul>

            {visible_tasks.length === 0 && <p class="empty_message">Nothing here yet.</p>}
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
          on_toggle={toggle_task}
          on_rename={rename_task}
          on_set_notes={set_task_notes}
          on_tag={tag_task}
          on_untag={untag_task}
          on_set_schedule={set_task_schedule}
          on_set_done_at={(task, done_at) => save_task_done(task, task.is_done, done_at, done_at === null ? { kind: 'remove' } : { kind: 'retime' })}
          streak={streak_by_task_id.get(selected_task.id) ?? null}
          on_reschedule={(task) => set_rescheduling_task_id(task.id)}
          is_in_my_day={is_in_my_day(selected_task, shown_since)}
          on_set_my_day={(task, is_added) => set_task_my_day(task, is_added ? today : null)}
          on_remove={remove_task}
          on_close={() => set_selected_task_id(null)}
        />
      )}

      {rescheduling_task && (
        <ReschedulePopup
          task={rescheduling_task}
          options={settings.reschedule_options}
          on_reschedule={set_task_schedule}
          on_close={() => set_rescheduling_task_id(null)}
        />
      )}

      {rule_editing && (
        <RuleDialog
          heading={'tag' in rule_editing ? 'Edit rule tag' : 'New rule tag'}
          name={'tag' in rule_editing ? rule_editing.tag.name : ''}
          rule={('tag' in rule_editing && rule_editing.tag.rule) || EMPTY_RULE}
          tags={tags}
          tasks={tasks}
          on_save={save_rule_tag}
          on_close={() => set_rule_editing(null)}
        />
      )}

      {context_menu && <ContextMenu menu={context_menu} on_close={close_context_menu} />}
    </div>
  )
}
