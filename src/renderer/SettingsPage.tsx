import { useEffect, useState } from 'preact/hooks'

import { describe_rule } from 'recurrence-input'

import { MCP_PORT_RANGE, UPCOMING_REPEAT_DAYS_RANGE, type DatabaseBackup, type LaunchView, type McpStatus, type TrustedCertificate, type ServerCertificate, type PriorityScale, type RescheduleOption, type SearchScope, type Settings, type TagMatch, type TagScope, type TagSelection, type TaskDateField, type TaskDuration, type ThemeChoice, DURATION_UNITS, task_duration } from '@shared/settings'
import type { SyncDirection, SyncStatus } from '@shared/sync'
import { CertificateDialog } from './CertificateDialog'
import { RecurrencePicker } from './RecurrencePicker'
import { duration_label, rule_format } from '@shared/schedule'

// ============================================================================
// Choices
// ============================================================================

const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const TASK_DATE_CHOICES: { value: TaskDateField; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'start', label: 'Start date' }
]

const LAUNCH_VIEW_CHOICES: { value: LaunchView; label: string }[] = [
  { value: 'last', label: 'Last view used' },
  { value: 'my_day', label: 'My Day' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All tasks' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'reports', label: 'Reports' }
]

const PRIORITY_SCALE_CHOICES: { value: PriorityScale; label: string }[] = [
  { value: 'high_medium_low', label: 'High, Medium, Low' },
  { value: 'moscow', label: 'MoSCoW' }
]

const TAG_SELECTION_CHOICES: { value: TagSelection; label: string }[] = [
  { value: 'single', label: 'One tag' },
  { value: 'one_per_group', label: 'One per group' },
  { value: 'many', label: 'Any number' }
]

const TAG_MATCH_CHOICES: { value: TagMatch; label: string }[] = [
  { value: 'all', label: 'All tags' },
  { value: 'any', label: 'Any tag' }
]

const TAG_SCOPE_CHOICES: { value: TagScope; label: string }[] = [
  { value: 'subtags', label: 'With subtags' },
  { value: 'own', label: 'Own only' }
]

const SEARCH_SCOPE_CHOICES: { value: SearchScope; label: string }[] = [
  { value: 'view', label: 'This view' },
  { value: 'all', label: 'All tasks' }
]

// ============================================================================
// Settings page
// ============================================================================

interface SettingsPageProps {
  settings: Settings
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void | Promise<void>
  on_add_tag_group: (name: string, is_rule: boolean) => void
}

export function SettingsPage({ settings, on_change, on_add_tag_group }: SettingsPageProps) {
  const [database_path, set_database_path] = useState('')
  const [new_group_name, set_new_group_name] = useState('')
  const [is_new_group_rule, set_is_new_group_rule] = useState(false)

  useEffect(() => {
    void window.x_settings.get_database_path().then(set_database_path)
  }, [])

  function submit_new_group(event: Event): void {
    event.preventDefault()
    const name = new_group_name.trim()
    if (!name) return

    on_add_tag_group(name, is_new_group_rule)
    set_new_group_name('')
  }

  return (
    <>
      <header class="task_pane_header">
        <h1>Settings</h1>
      </header>

      <section class="settings_group">
        <h2 class="settings_heading">Appearance</h2>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Theme</span>
            <span class="setting_hint">System follows the light or dark choice of your desktop.</span>
          </div>
          <div class="segmented_control" role="radiogroup" aria-label="Theme">
            {THEME_CHOICES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={settings.theme === value}
                class={settings.theme === value ? 'is_selected' : ''}
                onClick={() => on_change('theme', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Streak dots on task rows</span>
            <span class="setting_hint">Routines and their subtasks show their last week of done and missed occurrences beside the title.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.show_streak_strip_on_rows}
            onChange={(event) => on_change('show_streak_strip_on_rows', event.currentTarget.checked)}
          />
        </label>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Behaviour</h2>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Open on launch</span>
            <span class="setting_hint">The view shown when the app starts.</span>
          </div>
          <select
            value={settings.launch_view}
            onChange={(event) => on_change('launch_view', event.currentTarget.value as LaunchView)}
          >
            {LAUNCH_VIEW_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Task date</span>
            <span class="setting_hint">The date shown beside each task, and used to sort, filter, reschedule and fill My Day.</span>
          </div>
          <select
            value={settings.task_date_field}
            onChange={(event) => on_change('task_date_field', event.currentTarget.value as TaskDateField)}
          >
            {TASK_DATE_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Clear My Day each day</span>
            <span class="setting_hint">My Day starts empty every morning. When off, tasks stay until you take them out.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.auto_clear_my_day}
            onChange={(event) => on_change('auto_clear_my_day', event.currentTarget.checked)}
          />
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Remove completed tasks from My Day</span>
            <span class="setting_hint">Completing a top-level task takes it out of My Day. Subtasks stay with their parent.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.remove_done_from_my_day}
            onChange={(event) => on_change('remove_done_from_my_day', event.currentTarget.checked)}
          />
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Add due tasks to My Day</span>
            <span class="setting_hint">Open tasks whose task date is today or earlier go into My Day each morning, and when given such a date.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.add_due_to_my_day}
            onChange={(event) => on_change('add_due_to_my_day', event.currentTarget.checked)}
          />
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Repeats in Upcoming</span>
            <span class="setting_hint">How many days ahead Upcoming lists the later dates of repeating tasks. Zero lists none.</span>
          </div>
          <input
            type="number"
            min={UPCOMING_REPEAT_DAYS_RANGE.min}
            max={UPCOMING_REPEAT_DAYS_RANGE.max}
            step="1"
            class="reschedule_days"
            value={settings.upcoming_repeat_days}
            onChange={(event) =>
              on_change('upcoming_repeat_days', Math.min(UPCOMING_REPEAT_DAYS_RANGE.max, Math.max(UPCOMING_REPEAT_DAYS_RANGE.min, Math.round(Number(event.currentTarget.value) || 0))))
            }
            aria-label="Days ahead"
          />
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Ask before deleting a tag</span>
            <span class="setting_hint">Deleting a tag also deletes its sub-tags. Tasks are kept.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.confirm_tag_removal}
            onChange={(event) => on_change('confirm_tag_removal', event.currentTarget.checked)}
          />
        </label>

        <label class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Ask before clearing completed tasks</span>
            <span class="setting_hint">Undo can still bring them back for a few seconds either way.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.confirm_clear_completed}
            onChange={(event) => on_change('confirm_clear_completed', event.currentTarget.checked)}
          />
        </label>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Filters</h2>

        <form class="setting_row" onSubmit={submit_new_group}>
          <div class="setting_text">
            <span class="setting_label">New filter group</span>
            <span class="setting_hint">Adds a section to the sidebar with its own tags: plain tags given by hand, such as Context, or rule tags that apply themselves, such as Overdue.</span>
          </div>
          <input
            value={new_group_name}
            onInput={(event) => set_new_group_name(event.currentTarget.value)}
            placeholder="Group name"
            aria-label="New filter group"
          />
          <select
            value={is_new_group_rule ? 'rule' : 'plain'}
            onChange={(event) => set_is_new_group_rule(event.currentTarget.value === 'rule')}
            aria-label="New filter group type"
          >
            <option value="plain">Plain tags</option>
            <option value="rule">Rule tags</option>
          </select>
          <button type="submit">Add</button>
        </form>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Tag selection</span>
            <span class="setting_hint">
              How many sidebar tags can be selected at once: one in all, one from each group, or any number. Clicking a selected
              tag clears it.
            </span>
          </div>
          <SegmentedChoice label="Tag selection" choices={TAG_SELECTION_CHOICES} value={settings.tag_selection} on_change={(value) => on_change('tag_selection', value)} />
        </div>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Match tasks with</span>
            <span class="setting_hint">Whether a task must have every selected tag, or just one of them, to show.</span>
          </div>
          <SegmentedChoice label="Match tasks with" choices={TAG_MATCH_CHOICES} value={settings.tag_match} on_change={(value) => on_change('tag_match', value)} />
        </div>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Parent tags show</span>
            <span class="setting_hint">Whether selecting a tag with tags inside it shows their tasks too, or only the tasks with that tag itself.</span>
          </div>
          <SegmentedChoice label="Parent tags show" choices={TAG_SCOPE_CHOICES} value={settings.tag_scope} on_change={(value) => on_change('tag_scope', value)} />
        </div>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Search</span>
            <span class="setting_hint">Whether typing in the bar at the top searches only the view on screen, or every task. Enter still adds the task to the view on screen.</span>
          </div>
          <SegmentedChoice label="Search" choices={SEARCH_SCOPE_CHOICES} value={settings.search_scope} on_change={(value) => on_change('search_scope', value)} />
        </div>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Priority scale</span>
            <span class="setting_hint">
              The tags in the Priority group. MoSCoW is Must, Should, Could and Won't have. Tasks keep their rank when this
              changes, and Won't have becomes Low.
            </span>
          </div>
          <div class="segmented_control" role="radiogroup" aria-label="Priority scale">
            {PRIORITY_SCALE_CHOICES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={settings.priority_scale === value}
                class={settings.priority_scale === value ? 'is_selected' : ''}
                onClick={() => on_change('priority_scale', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Reschedule</h2>
        <RescheduleOptionsEditor
          options={settings.reschedule_options}
          on_change={(options) => on_change('reschedule_options', options)}
        />
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Durations</h2>
        <DurationsEditor durations={settings.task_durations} on_change={(durations) => on_change('task_durations', durations)} />
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Tag colours</h2>
        <TagColorsEditor colors={settings.tag_colors} on_change={(colors) => on_change('tag_colors', colors)} />
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Storage</h2>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Database</span>
            <span class="setting_hint setting_path">{database_path}</span>
          </div>
          {window.x_settings.host === 'desktop' && <button onClick={() => void window.x_settings.show_database_folder()}>Show in folder</button>}
        </div>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Backups</h2>
        <BackupsEditor settings={settings} on_change={on_change} />
      </section>

      {window.x_settings.host !== 'android' && (
        <section class="settings_group">
          <h2 class="settings_heading">MCP server</h2>
          <McpEditor settings={settings} on_change={on_change} />
        </section>
      )}

      {window.x_settings.host !== 'web' && (
        <section class="settings_group">
          <h2 class="settings_heading">Sync</h2>
          <SyncEditor />
        </section>
      )}
    </>
  )
}

// ============================================================================
// Reschedule options
// ============================================================================

interface RescheduleOptionsEditorProps {
  options: RescheduleOption[]
  on_change: (options: RescheduleOption[]) => void
}

// The quick days the Reschedule popup offers, in the order shown here.
function RescheduleOptionsEditor({ options, on_change }: RescheduleOptionsEditorProps) {
  const [picking_rule_id, set_picking_rule_id] = useState<string | null>(null)
  const picking_option = options.find((option) => option.id === picking_rule_id)

  function update(id: string, change: Partial<RescheduleOption>): void {
    on_change(options.map((option) => (option.id === id ? { ...option, ...change } : option)))
  }

  function move(index: number, step: number): void {
    const reordered = [...options]
    const [option] = reordered.splice(index, 1)
    reordered.splice(index + step, 0, option!)
    on_change(reordered)
  }

  function add(): void {
    on_change([...options, { id: crypto.randomUUID(), name: 'New option', mode: 'days', days: 7, rule: '' }])
  }

  return (
    <>
      <p class="setting_hint">
        The quick days offered by Reschedule in a task's menu and details. Each is a number of days from today, or the next
        date of a repeat rule counted from now. The task keeps its time of day.
      </p>

      {options.map((option, index) => (
        <div key={option.id} class="setting_row reschedule_option">
          <input
            value={option.name}
            onChange={(event) => update(option.id, { name: event.currentTarget.value.trim() || option.name })}
            aria-label="Option name"
          />
          <select
            value={option.mode}
            onChange={(event) => update(option.id, { mode: event.currentTarget.value as RescheduleOption['mode'] })}
            aria-label="Option kind"
          >
            <option value="days">Days from today</option>
            <option value="rule">Repeat rule</option>
          </select>
          {option.mode === 'days' ? (
            <input
              type="number"
              min="0"
              step="1"
              class="reschedule_days"
              value={option.days}
              onChange={(event) => update(option.id, { days: Math.max(0, Math.round(Number(event.currentTarget.value) || 0)) })}
              aria-label="Days from today"
            />
          ) : (
            <button class="recurrence_button reschedule_rule" onClick={() => set_picking_rule_id(option.id)}>
              {(option.rule && describe_rule(option.rule, rule_format(null))) || 'Choose a rule'}
            </button>
          )}
          <button class="remove_button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button class="remove_button" onClick={() => move(index, 1)} disabled={index === options.length - 1} aria-label="Move down">
            ↓
          </button>
          <button
            class="remove_button"
            onClick={() => on_change(options.filter((each) => each.id !== option.id))}
            aria-label={`Remove ${option.name}`}
          >
            ×
          </button>
        </div>
      ))}

      <button class="reschedule_add" onClick={add}>
        Add option
      </button>

      {picking_option && (
        <RecurrencePicker
          recurrence={picking_option.rule}
          anchor={null}
          on_save={(rule) => update(picking_option.id, { rule })}
          on_close={() => set_picking_rule_id(null)}
        />
      )}
    </>
  )
}

// ============================================================================
// Tag colours
// ============================================================================

interface TagColorsEditorProps {
  colors: string[]
  on_change: (colors: string[]) => void
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

// The swatches the tag dialog offers, in the order shown here; tags keep their colour when its swatch is changed or removed.
function TagColorsEditor({ colors, on_change }: TagColorsEditorProps) {
  // A code that is not #rrggbb is put back to the colour it replaced.
  function update(index: number, input: HTMLInputElement): void {
    const color = input.value.trim()
    if (HEX_COLOR.test(color)) on_change(colors.map((each, at) => (at === index ? color.toLowerCase() : each)))
    else input.value = colors[index]!
  }

  function move(index: number, step: number): void {
    const reordered = [...colors]
    const [color] = reordered.splice(index, 1)
    reordered.splice(index + step, 0, color!)
    on_change(reordered)
  }

  return (
    <>
      <p class="setting_hint">
        The colours offered as swatches when editing a tag. Any other colour can still be picked there. Changing a swatch
        leaves tags already given that colour as they are.
      </p>

      {colors.map((color, index) => (
        <div key={`${index}-${color}`} class="setting_row reschedule_option">
          <input type="color" class="tag_color_custom" value={color} onChange={(event) => update(index, event.currentTarget)} aria-label="Colour" />
          <input
            class="tag_color_hex"
            value={color}
            onChange={(event) => update(index, event.currentTarget)}
            aria-label="Colour code"
          />
          <button class="remove_button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button class="remove_button" onClick={() => move(index, 1)} disabled={index === colors.length - 1} aria-label="Move down">
            ↓
          </button>
          <button class="remove_button" onClick={() => on_change(colors.filter((_each, at) => at !== index))} aria-label={`Remove ${color}`}>
            ×
          </button>
        </div>
      ))}

      <button class="reschedule_add" onClick={() => on_change([...colors, '#64748b'])}>
        Add colour
      </button>
    </>
  )
}

// ============================================================================
// Durations
// ============================================================================

interface DurationsEditorProps {
  durations: TaskDuration[]
  on_change: (durations: TaskDuration[]) => void
}

const DURATION_UNIT_SHORT_NAMES: Record<(typeof DURATION_UNITS)[number], string> = {
  months: 'mo',
  weeks: 'wk',
  days: 'd',
  hours: 'h',
  minutes: 'min'
}

// The gaps the Duration list in a task's details offers, in the order shown here.
function DurationsEditor({ durations, on_change }: DurationsEditorProps) {
  function update(id: string, change: Partial<TaskDuration>): void {
    on_change(durations.map((duration) => (duration.id === id ? { ...duration, ...change } : duration)))
  }

  function move(index: number, step: number): void {
    const reordered = [...durations]
    const [duration] = reordered.splice(index, 1)
    reordered.splice(index + step, 0, duration!)
    on_change(reordered)
  }

  function add(): void {
    on_change([...durations, task_duration(crypto.randomUUID(), { days: 1 })])
  }

  return (
    <>
      <p class="setting_hint">
        The gaps offered by Duration in a task's details, which set the due date that long after the start. Units can be mixed,
        such as 1 hour 30 minutes. A gap with minutes or hours shows only when the start has a time, and Same day only when it
        has none.
      </p>

      {durations.map((duration, index) => (
        <div key={duration.id} class="setting_row reschedule_option">
          {DURATION_UNITS.map((unit) => (
            <label key={unit} class="duration_amount">
              <input
                type="number"
                min="0"
                step="1"
                value={duration[unit]}
                onChange={(event) => update(duration.id, { [unit]: Math.max(0, Math.round(Number(event.currentTarget.value) || 0)) })}
                aria-label={unit}
              />
              <span>{DURATION_UNIT_SHORT_NAMES[unit]}</span>
            </label>
          ))}
          <span class="duration_preview">{duration_label(duration)}</span>
          <button class="remove_button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button class="remove_button" onClick={() => move(index, 1)} disabled={index === durations.length - 1} aria-label="Move down">
            ↓
          </button>
          <button
            class="remove_button"
            onClick={() => on_change(durations.filter((each) => each.id !== duration.id))}
            aria-label={`Remove ${duration_label(duration)}`}
          >
            ×
          </button>
        </div>
      ))}

      <button class="reschedule_add" onClick={add}>
        Add duration
      </button>
    </>
  )
}

// ============================================================================
// MCP server
// ============================================================================

interface McpEditorProps {
  settings: Settings
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void
}

// Turns the local MCP endpoint on or off, sets its port, and shows the address to give an AI assistant.
function McpEditor({ settings, on_change }: McpEditorProps) {
  const [status, set_status] = useState<McpStatus | null>(null)

  useEffect(() => {
    void window.x_settings.get_mcp_status().then(set_status)
  }, [settings.mcp_enabled, settings.mcp_port])

  function change_port(text: string): void {
    const port = Math.round(Number(text))
    if (port >= MCP_PORT_RANGE.min && port <= MCP_PORT_RANGE.max) on_change('mcp_port', port)
  }

  return (
    <>
      <label class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Enable MCP server</span>
          <span class="setting_hint">
            Lets AI assistants on this computer list, add, change and complete tasks. Only programs on this computer can reach it.
          </span>
        </div>
        <input
          type="checkbox"
          checked={settings.mcp_enabled}
          onChange={(event) => on_change('mcp_enabled', event.currentTarget.checked)}
        />
      </label>

      <label class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Port</span>
          <span class="setting_hint">Change it if another program already uses this one.</span>
        </div>
        <input
          type="number"
          min={MCP_PORT_RANGE.min}
          max={MCP_PORT_RANGE.max}
          step="1"
          class="mcp_port"
          value={settings.mcp_port}
          onChange={(event) => change_port(event.currentTarget.value)}
          aria-label="MCP server port"
        />
      </label>

      {status?.state === 'running' && (
        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Address</span>
            <span class="setting_hint setting_path">{status.url}</span>
            <span class="setting_hint">
              Add it to a client as a Streamable HTTP server, such as with <code>claude mcp add --transport http x-tasks {status.url}</code>
            </span>
          </div>
          <button onClick={() => void navigator.clipboard.writeText(status.url)}>Copy</button>
        </div>
      )}

      {status?.state === 'failed' && <p class="setting_hint mcp_error">Could not start: {status.error}</p>}
    </>
  )
}

// ============================================================================
// Sync
// ============================================================================

const SYNC_STATUS_POLL_MS = 2000

const CONFIRM_DIRECTION: Record<SyncDirection, string> = {
  download: "Replace every task, tag and shared setting on this device with the server's? A backup of this device is taken first.",
  upload: "Replace every task, tag and shared setting on the server with this device's? Other devices will have to choose again. The server takes a backup first."
}

function describe_sync_status(status: SyncStatus): string {
  if (status.state === 'off') return 'Not syncing.'
  if (status.state === 'syncing') return 'Syncing…'
  if (status.state === 'idle') {
    if (status.last_synced_at === '') return 'Connected.'
    return `Up to date as of ${new Date(status.last_synced_at).toLocaleTimeString(undefined, { timeStyle: 'short' })}.`
  }
  if (status.state === 'offline') return `Cannot reach the server; changes are kept and sent once it is back. (${status.error})`
  return `${status.error[0]?.toUpperCase() ?? ''}${status.error.slice(1)}.`
}

// The bridge wraps a main-process error in its own words; only the message after the last "Error: " is meant for people.
function error_message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('Error: ').at(-1) ?? text
}

// Connects this device to an X-Tasks server, choosing once whose tasks win, then shows how syncing is going.
function SyncEditor() {
  const [status, set_status] = useState<SyncStatus | null>(null)
  const [server_url, set_server_url] = useState('')
  const [token, set_token] = useState('')
  const [is_busy, set_is_busy] = useState(false)
  const [error, set_error] = useState('')

  useEffect(() => {
    let is_first = true
    const refresh = (): void =>
      void window.x_settings.get_sync_status().then((next) => {
        set_status(next)
        if (is_first && next.server_url) set_server_url(next.server_url)
        is_first = false
      })
    refresh()
    const timer = setInterval(refresh, SYNC_STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [])

  async function run(action: () => Promise<SyncStatus>): Promise<void> {
    set_is_busy(true)
    set_error('')
    try {
      set_status(await action())
      set_token('')
    } catch (caught) {
      set_error(error_message(caught))
    } finally {
      set_is_busy(false)
    }
  }

  function connect(direction: SyncDirection): void {
    if (window.confirm(CONFIRM_DIRECTION[direction])) void run(() => window.x_settings.connect_sync(server_url, token, direction))
  }

  if (!status) return null
  const is_connected = status.state !== 'off' && status.state !== 'needs_setup'
  const has_saved_token = status.state === 'needs_setup'

  return (
    <>
      <p class="setting_hint">
        Keeps this device's tasks in step with an X-Tasks server and every device connected to it. Changes made offline are sent when the server can be reached.
      </p>

      {!is_connected && (
        <>
          <label class="setting_row">
            <div class="setting_text">
              <span class="setting_label">Server address</span>
              <span class="setting_hint">Where x-tasks-server is reached, such as https://tasks.example.org/</span>
            </div>
            <input type="url" class="sync_input" value={server_url} onInput={(event) => set_server_url(event.currentTarget.value)} aria-label="Server address" />
          </label>

          <label class="setting_row">
            <div class="setting_text">
              <span class="setting_label">Access token</span>
              <span class="setting_hint">The token the server was set up with{has_saved_token ? '; leave it empty to keep the saved one' : ''}.</span>
            </div>
            <input type="password" class="sync_input" value={token} onInput={(event) => set_token(event.currentTarget.value)} aria-label="Access token" />
          </label>

          <div class="setting_row">
            <div class="setting_text">
              <span class="setting_label">Start syncing</span>
              <span class="setting_hint">Choose once whose tasks to keep: a new device usually takes the server's, and the first device sends its own.</span>
            </div>
            <button disabled={is_busy || server_url.trim() === ''} onClick={() => connect('download')}>Use the server's tasks</button>
            <button disabled={is_busy || server_url.trim() === ''} onClick={() => connect('upload')}>Send this device's tasks</button>
          </div>
        </>
      )}

      {is_connected && (
        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Server</span>
            <span class="setting_hint setting_path">{status.server_url}</span>
          </div>
          <button disabled={is_busy} onClick={() => void run(() => window.x_settings.sync_now())}>Sync now</button>
          <button disabled={is_busy} onClick={() => void run(() => window.x_settings.disconnect_sync())}>Stop syncing</button>
        </div>
      )}

      {status.state !== 'off' && (
        <p class={`setting_hint sync_status ${status.state === 'failed' || status.state === 'needs_setup' ? 'sync_status_problem' : ''}`}>{describe_sync_status(status)}</p>
      )}
      {error && <p class="setting_hint sync_status sync_status_problem">{error}</p>}

      {window.x_settings.host !== 'web' && <TrustedCertificateEditor server_url={status.server_url || server_url} />}
    </>
  )
}

// Takes the certificate authority of a server whose certificate this device does not already trust, such as a home server's own.
function TrustedCertificateEditor({ server_url }: { server_url: string }) {
  const [saved, set_saved] = useState<TrustedCertificate | null>(null)
  const [pem, set_pem] = useState('')
  const [error, set_error] = useState('')
  const [offered, set_offered] = useState<ServerCertificate | null>(null)
  const [is_reading, set_is_reading] = useState(false)

  useEffect(() => {
    void window.x_settings.get_trusted_certificate().then(set_saved)
  }, [])

  // Reads the authority straight from the server, so it need not be found and pasted by hand.
  async function read_from_server(): Promise<void> {
    set_error('')
    set_is_reading(true)
    try {
      const certificate = await window.x_settings.inspect_server_certificate(server_url.trim())
      if (certificate) set_offered(certificate)
      else set_error('Nothing to trust: the server is already trusted, uses http, or could not be reached.')
    } catch (caught) {
      set_error(error_message(caught))
    } finally {
      set_is_reading(false)
    }
  }

  async function save(text: string): Promise<void> {
    set_error('')
    try {
      set_saved(await window.x_settings.set_trusted_certificate(text))
      set_pem('')
    } catch (caught) {
      set_error(error_message(caught))
    }
  }

  if (!saved) return null

  return (
    <>
      <div class="setting_row trusted_certificate">
        <div class="setting_text">
          <span class="setting_label">Trusted certificate authority</span>
          <span class="setting_hint">
            {saved.subject ? `Trusting ${saved.subject} for the server.` : 'For a server with a self-signed or private certificate: get its authority from the server, or paste the PEM certificate.'}
          </span>
          <textarea
            class="trusted_certificate_pem"
            value={pem}
            onInput={(event) => set_pem(event.currentTarget.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            aria-label="Certificate authority in PEM form"
            rows={4}
          />
        </div>
        <button disabled={is_reading || server_url.trim() === ''} onClick={() => void read_from_server()}>Get from server</button>
        <button disabled={pem.trim() === ''} onClick={() => void save(pem)}>Trust</button>
        {saved.subject && <button onClick={() => void save('')}>Forget</button>}
      </div>
      {error && <p class="setting_hint sync_status sync_status_problem">{error}</p>}
      {offered && (
        <CertificateDialog
          certificate={offered}
          server_url={server_url.trim()}
          on_close={() => {
            set_offered(null)
            void window.x_settings.get_trusted_certificate().then(set_saved)
          }}
        />
      )}
    </>
  )
}

// ============================================================================
// Backups
// ============================================================================

function format_size(size_bytes: number): string {
  if (size_bytes < 1024 * 1024) return `${Math.max(1, Math.round(size_bytes / 1024))} KB`
  return `${(size_bytes / (1024 * 1024)).toFixed(1)} MB`
}

function format_taken_at(taken_at: string): string {
  return new Date(taken_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
}

interface BackupsEditorProps {
  settings: Settings
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void | Promise<void>
}

// Saved copies of the database, newest first, each of which can be restored or deleted.
function BackupsEditor({ settings, on_change }: BackupsEditorProps) {
  const [backups, set_backups] = useState<DatabaseBackup[]>([])
  const [folder_name, set_folder_name] = useState('')
  const needs_folder = window.x_settings.choose_backup_folder !== undefined

  async function refresh(): Promise<void> {
    set_folder_name((await window.x_settings.get_backup_folder?.()) ?? '')
    set_backups(await window.x_settings.list_backups())
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Turning these on or lowering the count can take or delete automatic backups, so the list is read again after.
  async function change_automatic<Key extends 'auto_backup' | 'auto_backups_to_keep'>(key: Key, value: Settings[Key]): Promise<void> {
    await on_change(key, value)
    await refresh()
  }

  // A newly picked folder may already hold backups, and daily backups can start in it.
  async function choose_folder(): Promise<void> {
    await window.x_settings.choose_backup_folder?.()
    await refresh()
  }

  async function create(): Promise<void> {
    await window.x_settings.create_backup()
    await refresh()
  }

  // Every task, tag and setting comes from the restored copy, so the whole page is loaded again.
  async function restore(backup: DatabaseBackup): Promise<void> {
    const is_confirmed = window.confirm(
      `Replace all current tasks, tags and settings with the backup from ${format_taken_at(backup.taken_at)}? ` +
        'The current data is backed up first.'
    )
    if (!is_confirmed) return

    await window.x_settings.restore_backup(backup.name)
    window.location.reload()
  }

  async function remove(backup: DatabaseBackup): Promise<void> {
    if (!window.confirm(`Delete the backup from ${format_taken_at(backup.taken_at)}?`)) return

    await window.x_settings.remove_backup(backup.name)
    await refresh()
  }

  return (
    <>
      {needs_folder && (
        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Backup folder</span>
            <span class="setting_hint">
              {folder_name || "Pick a folder in the phone's storage, such as Documents, where file managers and sync apps can reach the backups."}
            </span>
          </div>
          <button onClick={() => void choose_folder()}>{folder_name ? 'Change' : 'Choose'}</button>
        </div>
      )}

      <div class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Back up now</span>
          <span class="setting_hint">Saves a copy of every task, tag and setting, named by the time it was taken.</span>
        </div>
        {window.x_settings.host === 'desktop' && <button onClick={() => void window.x_settings.show_backup_folder()}>Show folder</button>}
        <button onClick={() => void create()} disabled={needs_folder && !folder_name}>
          Back up
        </button>
      </div>

      <label class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Back up daily</span>
          <span class="setting_hint">Takes a backup once a day while the app is running. Backups made by hand are always kept.</span>
        </div>
        <input
          type="checkbox"
          checked={settings.auto_backup}
          onChange={(event) => void change_automatic('auto_backup', event.currentTarget.checked)}
        />
      </label>

      <label class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Daily backups to keep</span>
          <span class="setting_hint">Older daily backups are deleted once there are more than this.</span>
        </div>
        <input
          type="number"
          min="1"
          step="1"
          class="backup_keep"
          value={settings.auto_backups_to_keep}
          disabled={!settings.auto_backup}
          onChange={(event) =>
            void change_automatic('auto_backups_to_keep', Math.max(1, Math.round(Number(event.currentTarget.value) || 1)))
          }
        />
      </label>

      {backups.length === 0 && <p class="setting_hint backup_empty">No backups yet.</p>}

      {backups.map((backup) => (
        <div key={backup.name} class="setting_row backup_row">
          <div class="setting_text">
            <span class="setting_label">{format_taken_at(backup.taken_at)}</span>
            <span class="setting_hint">
              {backup.is_automatic ? 'Daily' : 'By hand'} · {format_size(backup.size_bytes)}
            </span>
          </div>
          <button onClick={() => void restore(backup)}>Restore</button>
          <button class="remove_button" onClick={() => void remove(backup)} aria-label={`Delete backup from ${format_taken_at(backup.taken_at)}`}>
            ×
          </button>
        </div>
      ))}
    </>
  )
}

// ============================================================================
// Segmented choice
// ============================================================================

interface SegmentedChoiceProps<Value extends string> {
  label: string
  choices: { value: Value; label: string }[]
  value: Value
  on_change: (value: Value) => void
}

function SegmentedChoice<Value extends string>({ label, choices, value, on_change }: SegmentedChoiceProps<Value>) {
  return (
    <div class="segmented_control" role="radiogroup" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          role="radio"
          aria-checked={value === choice.value}
          class={value === choice.value ? 'is_selected' : ''}
          onClick={() => on_change(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}
