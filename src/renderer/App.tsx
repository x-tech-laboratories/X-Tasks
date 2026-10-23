import { useCallback, useEffect, useState } from 'preact/hooks'

import type { Settings } from '@shared/settings'
import type { Tag, TagGroup, Task, TaskSchedule } from '@shared/tasks'
import { ContextMenu, type OpenContextMenu, type OpenMenu } from './ContextMenu'
import { ReschedulePopup } from './ReschedulePopup'
import { SettingsPage } from './SettingsPage'
import { Sidebar } from './Sidebar'
import { TaskDetail } from './TaskDetail'
import { TaskItem, type TaskActions } from './TaskItem'
import { next_schedule } from './schedule'
import {
  by_position, launch_view, move_for_drop, nest_tasks, position_for_drop, subtree_ids, tag_ids_for_new_task, task_is_in_view, view_title,
  type DropPlacement, type SidePlacement, type View
} from './views'

// ============================================================================
// App
// ============================================================================

export function App() {
  const [tasks, set_tasks] = useState<Task[]>([])
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

  useEffect(() => {
    void window.x_tasks.list_tasks().then(set_tasks)
    void window.x_tasks.list_tag_groups().then(set_tag_groups)
    void Promise.all([window.x_tasks.list_tags(), window.x_settings.get_settings()]).then(([loaded_tags, loaded_settings]) => {
      set_tags(loaded_tags)
      set_selected_view(launch_view(loaded_settings, loaded_tags))
      set_settings(loaded_settings)
    })
  }, [])

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

  // A new priority scale renames tags and can move tasks between them, so both are fetched again.
  async function change_setting<Key extends keyof Settings>(key: Key, value: Settings[Key]): Promise<void> {
    set_settings((current_settings) => current_settings && { ...current_settings, [key]: value })
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

    const added_task = await window.x_tasks.add_task(title, null, tag_ids_for_new_task(selected_view))
    set_tasks((current_tasks) => [...current_tasks, added_task])
    set_new_title('')
  }

  // A subtask shows wherever its parent does, so it needs no tags of its own.
  async function add_subtask(parent: Task, title: string): Promise<void> {
    const added_task = await window.x_tasks.add_task(title, parent.id, [])
    set_tasks((current_tasks) => [...current_tasks, added_task])
  }

  function set_task_schedule(task: Task, schedule: TaskSchedule): void {
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, ...schedule } : each)))
    void window.x_tasks.set_task_schedule(task.id, schedule)
  }

  // Completing a recurring task moves it to its next occurrence instead, until its rule runs out.
  function toggle_task(task: Task): void {
    const next = task.is_done ? null : next_schedule(task)
    if (next) return set_task_schedule(task, next)

    const is_done = !task.is_done
    set_tasks((current_tasks) => current_tasks.map((each) => (each.id === task.id ? { ...each, is_done } : each)))
    void window.x_tasks.set_task_done(task.id, is_done)
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

  // In a one-tag-per-task group, the new tag replaces whichever tag of that group the task had.
  function tag_task(task: Task, tag: Tag): void {
    if (task.tag_ids.includes(tag.id)) return
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

  async function add_tag(name: string, group_id: string, parent_id: string | null): Promise<void> {
    const added_tag = await window.x_tasks.add_tag(name, group_id, parent_id)
    set_tags((current_tags) => [...current_tags, added_tag])
    select_view({ kind: 'tag', tag_id: added_tag.id })
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
    if (selected_view.kind === 'tag' && removed_ids.has(selected_view.tag_id)) select_view({ kind: 'all' })
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

  // Nothing is drawn until the settings arrive, so the launch view never flashes past.
  if (!settings) return null

  const visible_tasks = tasks.filter((task) => task_is_in_view(task, selected_view, tasks, tags))
  const remaining_count = visible_tasks.filter((task) => !task.is_done).length
  const task_tree = nest_tasks(visible_tasks, tasks)

  // The detail panel stays out of the way while the settings page is open.
  const selected_task = is_settings_open ? null : (tasks.find((task) => task.id === selected_task_id) ?? null)
  const rescheduling_task = tasks.find((task) => task.id === rescheduling_task_id) ?? null

  const task_actions: TaskActions = {
    tags,
    can_add_subtasks: selected_view.kind !== 'completed',
    selected_task_id,
    on_select: (task) => set_selected_task_id(task.id),
    on_context_menu: open_context_menu,
    on_toggle: toggle_task,
    on_reschedule: (task) => set_rescheduling_task_id(task.id),
    on_remove: remove_task,
    on_add_subtask: add_subtask,
    on_untag: untag_task,
    on_drag_start: set_dragged_task,
    on_drag_end: () => set_dragged_task(null),
    can_drop_on: can_drop_task_on,
    on_drop: drop_task
  }

  return (
    <div class={selected_task ? 'app has_detail' : 'app'}>
      <Sidebar
        tasks={tasks}
        tag_groups={tag_groups}
        tags={tags}
        selected_view={is_settings_open ? null : selected_view}
        is_settings_open={is_settings_open}
        dragged_task={dragged_task}
        on_select_view={select_view}
        on_open_settings={() => set_is_settings_open(true)}
        on_remove_tag_group={remove_tag_group}
        on_set_tag_group_single_choice={set_tag_group_single_choice}
        on_move_tag_group={move_tag_group}
        on_add_tag={add_tag}
        on_remove_tag={remove_tag}
        on_move_tag={move_tag}
        on_tag_task={tag_task}
        on_context_menu={open_context_menu}
      />

      <main class="task_pane">
        {is_settings_open ? (
          <SettingsPage settings={settings} on_change={change_setting} on_add_tag_group={add_tag_group} />
        ) : (
          <>
            <header class="task_pane_header">
              <h1>{view_title(selected_view, tags)}</h1>
              <span class="remaining_count">{remaining_count} left</span>
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

            <ul class="task_list">
              {task_tree.map((node) => (
                <TaskItem key={node.task.id} node={node} actions={task_actions} />
              ))}
            </ul>

            {visible_tasks.length === 0 && <p class="empty_message">Nothing here yet.</p>}
          </>
        )}
      </main>

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
          on_reschedule={(task) => set_rescheduling_task_id(task.id)}
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

      {context_menu && <ContextMenu menu={context_menu} on_close={close_context_menu} />}
    </div>
  )
}
