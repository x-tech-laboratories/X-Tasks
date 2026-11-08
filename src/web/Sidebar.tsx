import { next_theme, type Theme, type ThemeChoice } from '@x-tech-laboratories/x-libs/web/theme'
import { useEffect, useState, type DragEvent, type FormEvent, type MouseEvent } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'
import { ColorDot } from '@x-tech-laboratories/x-libs/web/react/badges'
import { open_context_menu } from '@x-tech-laboratories/x-libs/web/react/menus'
import { use_resource } from '@x-tech-laboratories/x-libs/web/react/states'
import { Tree, type DropPlacement, type TreeMove } from '@x-tech-laboratories/x-libs/web/react/tree'
import type { SyncStatus } from '@shared/sync'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import type { TagScope, TaskDateField } from '@shared/settings'
import { children_of } from '@x-tech-laboratories/x-libs/web/tree'
import { BUILT_IN_VIEWS, is_same_view, is_tag_selected, task_is_in_view, with_icon, type View } from './views'

// ============================================================================
// Rows
// ============================================================================

// The tree holds each group at the top with its tags under it; a tag at the top of its group names the group as its parent.
type SidebarRow =
  | { id: string; parent_id: null; position: number; kind: 'group'; group: TagGroup }
  | { id: string; parent_id: string; position: number; kind: 'tag'; tag: Tag }

function group_row(group: TagGroup): SidebarRow {
  return { id: group.id, parent_id: null, position: group.position, kind: 'group', group }
}

function tag_row(tag: Tag): SidebarRow {
  return { id: tag.id, parent_id: tag.parent_id ?? tag.group_id, position: tag.position, kind: 'tag', tag }
}

// ============================================================================
// Sidebar
// ============================================================================

interface SidebarProps {
  tasks: Task[]
  tag_groups: TagGroup[]
  tags: Tag[]
  // The earliest day whose My Day tasks still count.
  my_day_since: string
  selected_view: View | null
  // Whether a tag's count takes in the tasks of the tags inside it.
  tag_scope: TagScope
  show_empty_tags: boolean
  // The task date that puts a task in Upcoming.
  date_field: TaskDateField
  dragged_task: Task | null
  // The ids of the tag groups and tags folded shut.
  collapsed_ids: string[]
  on_set_collapsed_ids: (ids: string[]) => void
  on_select_view: (view: View) => void
  on_toggle_tag: (tag: Tag) => void
  on_edit_tag_group: (group: TagGroup) => void
  on_remove_tag_group: (group: TagGroup) => void
  on_move_tag_group: (group: TagGroup, position: number) => void
  on_add_tag: (name: string, group_id: string, parent_id: string | null) => void
  on_add_rule_tag: (group_id: string, parent_id: string | null) => void
  on_edit_tag: (tag: Tag) => void
  on_remove_tag: (tag: Tag) => void
  on_move_tag: (tag: Tag, move: TreeMove) => void
  on_tag_task: (task: Task, tag: Tag) => void
}

// Where the inline new-tag field is open: at the top of a group, or inside a tag.
interface NewTagSpot {
  group_id: string
  parent_id: string | null
}

export function Sidebar({
  tasks, tag_groups, tags, my_day_since, selected_view, tag_scope, show_empty_tags, date_field, dragged_task, collapsed_ids, on_set_collapsed_ids, on_select_view, on_toggle_tag,
  on_edit_tag_group, on_remove_tag_group, on_move_tag_group, on_add_tag, on_add_rule_tag, on_edit_tag, on_remove_tag, on_move_tag, on_tag_task
}: SidebarProps) {
  const [new_tag_spot, set_new_tag_spot] = useState<NewTagSpot | null>(null)
  const [new_tag_name, set_new_tag_name] = useState('')

  // Completed counts its done tasks; every other view counts its open ones.
  function view_count(view: View): number {
    const is_counted = (task: Task) => (view.kind === 'completed' ? task.is_done : !task.is_done)
    return tasks.filter((task) => is_counted(task) && task_is_in_view(task, view, tasks, tags, my_day_since, 'all', tag_scope, date_field)).length
  }

  // With empty tags hidden, a tag still shows while any task has it, done or not, while it is selected, or while it holds a tag that shows.
  function is_tag_shown(tag: Tag): boolean {
    if (show_empty_tags || is_tag_selected(selected_view, tag.id)) return true
    const view: View = { kind: 'tag', tag_ids: [tag.id] }
    if (tasks.some((task) => task_is_in_view(task, view, tasks, tags, my_day_since, 'all', tag_scope, date_field))) return true
    return children_of(tag.id, tags).some(is_tag_shown)
  }

  const rows = [...tag_groups.map(group_row), ...tags.filter(is_tag_shown).map(tag_row)]
  const selected_ids = new Set(selected_view?.kind === 'tag' ? selected_view.tag_ids : [])

  // ==========================================================================
  // Folding
  // ==========================================================================

  // Ids of groups and tags deleted since are dropped whenever the list is saved again.
  function save_collapsed(collapsed: Set<string>): void {
    on_set_collapsed_ids([...collapsed].filter((id) => [...tag_groups, ...tags].some((item) => item.id === id)))
  }

  // ==========================================================================
  // New tags
  // ==========================================================================

  // The group or tag being added to opens up so the new tag shows.
  function start_new_tag(spot: NewTagSpot): void {
    const opened_id = spot.parent_id ?? spot.group_id
    if (collapsed_ids.includes(opened_id)) save_collapsed(new Set(collapsed_ids.filter((id) => id !== opened_id)))
    set_new_tag_spot(spot)
    set_new_tag_name('')
  }

  // A plain group names its new tag in place; a rule group opens the rule dialog.
  function add_tag_at(spot: NewTagSpot): void {
    if (tag_groups.find((group) => group.id === spot.group_id)?.is_rule) on_add_rule_tag(spot.group_id, spot.parent_id)
    else start_new_tag(spot)
  }

  function stop_new_tag(): void {
    set_new_tag_spot(null)
    set_new_tag_name('')
  }

  function submit_new_tag(event: FormEvent): void {
    event.preventDefault()
    const name = new_tag_name.trim()
    if (name && new_tag_spot) on_add_tag(name, new_tag_spot.group_id, new_tag_spot.parent_id)
    stop_new_tag()
  }

  const new_item = new_tag_spot && {
    parent_id: new_tag_spot.parent_id ?? new_tag_spot.group_id,
    form: (
      <form onSubmit={submit_new_tag}>
        <input
          value={new_tag_name}
          onChange={(event) => set_new_tag_name(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Escape' && stop_new_tag()}
          onBlur={stop_new_tag}
          placeholder="New tag"
          aria-label="New tag"
          autoFocus
        />
      </form>
    )
  }

  // ==========================================================================
  // Moving
  // ==========================================================================

  // A group moves only beside another group; a tag stays in its own group, beside or inside its tags or at the top of the group.
  function can_drop(dragged: SidebarRow, target: SidebarRow, placement: DropPlacement): boolean {
    if (dragged.kind === 'group') return target.kind === 'group' && placement !== 'inside'
    if (target.kind === 'group') return target.group.id === dragged.tag.group_id && placement === 'inside'
    return target.tag.group_id === dragged.tag.group_id
  }

  function move(row: SidebarRow, place: TreeMove): void {
    if (row.kind === 'group') return on_move_tag_group(row.group, place.position)
    on_move_tag(row.tag, { parent_id: place.parent_id === row.tag.group_id ? null : place.parent_id, position: place.position })
  }

  // A dragged task drops into any tag but a rule tag.
  function accepts_task(_event: DragEvent<HTMLElement>, row: SidebarRow): boolean {
    return dragged_task !== null && row.kind === 'tag' && !row.tag.rule
  }

  function drop_task(_event: DragEvent<HTMLElement>, row: SidebarRow): void {
    if (dragged_task && row.kind === 'tag') on_tag_task(dragged_task, row.tag)
  }

  // ==========================================================================
  // Menus
  // ==========================================================================

  function open_menu(event: MouseEvent<HTMLElement>, row: SidebarRow): void {
    if (row.kind === 'tag') {
      const tag = row.tag
      return open_context_menu(event, [
        { label: 'Edit tag…', run: () => on_edit_tag(tag) },
        { label: 'Add tag inside', run: () => add_tag_at({ group_id: tag.group_id, parent_id: tag.id }) },
        { label: 'Delete tag', run: () => on_remove_tag(tag), danger: true, separator_before: true }
      ])
    }

    const group = row.group
    const index = tag_groups.findIndex((each) => each.id === group.id)
    const group_above = tag_groups[index - 1]
    const group_below = tag_groups[index + 1]
    const group_above_that = tag_groups[index - 2]
    const group_below_that = tag_groups[index + 2]
    open_context_menu(event, [
      { label: 'Edit group…', run: () => on_edit_tag_group(group) },
      { label: 'Add tag', run: () => add_tag_at({ group_id: group.id, parent_id: null }) },
      ...(group_above ? [{ label: 'Move up', run: () => on_move_tag_group(group, group_above_that ? (group_above.position + group_above_that.position) / 2 : group_above.position - 1) }] : []),
      ...(group_below ? [{ label: 'Move down', run: () => on_move_tag_group(group, group_below_that ? (group_below.position + group_below_that.position) / 2 : group_below.position + 1) }] : []),
      { label: 'Delete group', run: () => on_remove_tag_group(group), danger: true, separator_before: true }
    ])
  }

  // ==========================================================================
  // Drawing
  // ==========================================================================

  function render_row(row: SidebarRow) {
    if (row.kind === 'group') return <span className="sidebar_group_name">{row.group.name}</span>
    const tag = row.tag
    return (
      <span className="sidebar_tag_name">
        {tag.color && <ColorDot color={tag.color} />}
        {with_icon(tag, tag.name)}
      </span>
    )
  }

  function render_extra(row: SidebarRow) {
    const spot = row.kind === 'group' ? { group_id: row.group.id, parent_id: null } : { group_id: row.tag.group_id, parent_id: row.tag.id }
    const count = row.kind === 'tag' ? view_count({ kind: 'tag', tag_ids: [row.tag.id] }) : 0
    const name = row.kind === 'group' ? row.group.name : row.tag.name
    return (
      <>
        {row.kind === 'tag' && row.tag.rule && <span className="muted" title="Rule tag: applied to every task its rule matches">ƒ</span>}
        {count > 0 && <span>{count}</span>}
        <button
          type="button"
          className="icon hover-reveal no-room"
          onClick={(event) => {
            event.stopPropagation()
            add_tag_at(spot)
          }}
          aria-label={row.kind === 'group' ? `Add a tag to ${name}` : `Add a tag inside ${name}`}
        >
          +
        </button>
      </>
    )
  }

  // A group row folds its tags; a tag row selects it.
  function select(row: SidebarRow): void {
    if (row.kind === 'tag') return on_toggle_tag(row.tag)
    const collapsed = new Set(collapsed_ids)
    if (collapsed.has(row.id)) collapsed.delete(row.id)
    else collapsed.add(row.id)
    save_collapsed(collapsed)
  }

  return (
    <>
      <div className="sidebar-nav">
        {BUILT_IN_VIEWS.map(({ view, label }) => {
          const is_active = selected_view !== null && is_same_view(view, selected_view)
          const count = view_count(view)
          return (
            <a
              key={view.kind}
              href={`?view=${view.kind}`}
              className={cx('tree-row', is_active && 'active')}
              aria-current={is_active ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault()
                on_select_view(view)
              }}
            >
              <span className="tree-label">{label}</span>
              {count > 0 && <span className="tree-extra">{count}</span>}
            </a>
          )
        })}
      </div>

      <Tree
        items={rows}
        label="Tags"
        render_item={render_row}
        render_extra={render_extra}
        name_of={(row) => (row.kind === 'group' ? row.group.name : row.tag.name)}
        row_class={(row) => (row.kind === 'group' ? 'tree-heading' : undefined)}
        collapsed={new Set(collapsed_ids)}
        on_collapsed_change={save_collapsed}
        selected_ids={selected_ids}
        on_select={select}
        on_activate={(row) => (row.kind === 'group' ? on_edit_tag_group(row.group) : on_edit_tag(row.tag))}
        on_move={move}
        can_drop={can_drop}
        new_item={new_item}
        on_context_menu={open_menu}
        accepts_external={accepts_task}
        on_external_drop={drop_task}
      />
    </>
  )
}

// ============================================================================
// Sidebar foot
// ============================================================================

interface SidebarFootProps {
  theme: ThemeChoice
  is_settings_open: boolean
  on_open_settings: () => void
}

// The sync button and the way into Settings, at the foot of the sidebar.
export function SidebarFoot({ theme, is_settings_open, on_open_settings }: SidebarFootProps) {
  return (
    <>
      <SyncButton on_open_settings={on_open_settings} />
      <ThemeRow choice={theme} />
      <a
        href="?settings"
        className={cx('tree-row', is_settings_open && 'active')}
        aria-current={is_settings_open ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          on_open_settings()
        }}
      >
        <span className="tree-label">
          <CogIcon />
          <span>Settings</span>
        </span>
      </a>
    </>
  )
}

// A cogwheel for the Settings link.
// The theme picker as a sidebar row: its icon and name, stepping to the next theme on each click.
const THEME_NAMES: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

function ThemeRow({ choice }: { choice: ThemeChoice }) {
  const [theme, set_theme] = useState(choice.get())
  useEffect(() => choice.on_change(set_theme), [choice])

  return (
    <button className="tree-row" title="Click to change the theme" onClick={() => choice.set(next_theme(choice.get()))}>
      <span className="tree-label">
        <ThemeIcon theme={theme} />
        <span>{THEME_NAMES[theme]}</span>
      </span>
    </button>
  )
}

// A sun for light, a moon for dark, and a half-filled circle for following the system.
function ThemeIcon({ theme }: { theme: Theme }) {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden="true">
      {theme === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </>
      )}
      {theme === 'dark' && <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
      {theme === 'system' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

function CogIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// Two circling arrows for the sync button; they turn while a sync runs.
function SyncIcon({ is_spinning }: { is_spinning: boolean }) {
  return (
    <svg className={cx('line-icon', is_spinning && 'spinning')} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

// ============================================================================
// Sync button
// ============================================================================

const SYNC_STATUS_POLL_MS = 2000

// Today's syncs show only the time; older ones show the day too.
function format_synced_at(iso_time: string): string {
  if (iso_time === '') return 'Not synced yet'
  const time = new Date(iso_time)
  const is_today = time.toDateString() === new Date().toDateString()
  return `Last synced ${is_today ? time.toLocaleTimeString(undefined, { timeStyle: 'short' }) : time.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
}

function sync_label(status: SyncStatus): string {
  if (status.state === 'syncing') return 'Syncing…'
  if (status.state === 'offline') return 'Offline'
  if (status.state === 'failed') return 'Sync failed'
  if (status.state === 'needs_setup') return 'Sync needs setup'
  return 'Synced'
}

// The last sync time, then the problem if there is one.
function sync_tooltip(status: SyncStatus): string {
  return [format_synced_at(status.last_synced_at), status.error || `with ${status.server_url}`].join('\n')
}

// Shows when this device last synced and how many changes wait to go out; a click syncs now, or opens settings when sync needs the user.
function SyncButton({ on_open_settings }: { on_open_settings: () => void }) {
  const sync = use_resource(() => window.x_settings.get_sync_status(), [], { refresh_in_milliseconds: SYNC_STATUS_POLL_MS })
  // Set while a sync asked for here runs, so the button spins before the next status arrives.
  const [is_syncing, set_is_syncing] = useState(false)

  const status: SyncStatus | null = sync.data && is_syncing ? { ...sync.data, state: 'syncing' } : sync.data
  if (!status || status.state === 'off') return null
  const needs_user = status.state === 'failed' || status.state === 'needs_setup'

  function click(): void {
    if (needs_user) return on_open_settings()
    set_is_syncing(true)
    void window.x_settings
      .sync_now()
      .then(() => sync.reload(true))
      .finally(() => set_is_syncing(false))
  }

  return (
    <button className={cx('tree-row', needs_user && 'tone-bad')} title={sync_tooltip(status)} disabled={status.state === 'syncing'} onClick={click}>
      <span className="tree-label">
        <SyncIcon is_spinning={status.state === 'syncing'} />
        <span>{sync_label(status)}</span>
      </span>
      {status.pending_changes > 0 && <span className="tree-extra">{status.pending_changes} pending</span>}
    </button>
  )
}
