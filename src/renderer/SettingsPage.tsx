import { useEffect, useState } from 'preact/hooks'

import { describe_rule } from 'recurrence-input'

import { MCP_PORT_RANGE, type DatabaseBackup, type LaunchView, type McpStatus, type PriorityScale, type RescheduleOption, type Settings, type TaskDateField, type TaskDuration, type ThemeChoice } from '@shared/settings'
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
  { value: 'all', label: 'All tasks' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'reports', label: 'Reports' }
]

const PRIORITY_SCALE_CHOICES: { value: PriorityScale; label: string }[] = [
  { value: 'high_medium_low', label: 'High, Medium, Low' },
  { value: 'moscow', label: 'MoSCoW' }
]

// ============================================================================
// Settings page
// ============================================================================

interface SettingsPageProps {
  settings: Settings
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void | Promise<void>
  on_add_tag_group: (name: string) => void
}

export function SettingsPage({ settings, on_change, on_add_tag_group }: SettingsPageProps) {
  const [database_path, set_database_path] = useState('')
  const [new_group_name, set_new_group_name] = useState('')

  useEffect(() => {
    void window.x_settings.get_database_path().then(set_database_path)
  }, [])

  function submit_new_group(event: Event): void {
    event.preventDefault()
    const name = new_group_name.trim()
    if (!name) return

    on_add_tag_group(name)
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
            <span class="setting_label">Ask before deleting a tag</span>
            <span class="setting_hint">Deleting a tag also deletes its sub-tags. Tasks are kept.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.confirm_tag_removal}
            onChange={(event) => on_change('confirm_tag_removal', event.currentTarget.checked)}
          />
        </label>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Filters</h2>

        <form class="setting_row" onSubmit={submit_new_group}>
          <div class="setting_text">
            <span class="setting_label">New filter group</span>
            <span class="setting_hint">Adds a section to the sidebar, such as Context or Energy, with its own tags.</span>
          </div>
          <input
            value={new_group_name}
            onInput={(event) => set_new_group_name(event.currentTarget.value)}
            placeholder="Group name"
            aria-label="New filter group"
          />
          <button type="submit">Add</button>
        </form>

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
        <h2 class="settings_heading">Storage</h2>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Database</span>
            <span class="setting_hint setting_path">{database_path}</span>
          </div>
          <button onClick={() => void window.x_settings.show_database_folder()}>Show in folder</button>
        </div>
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">Backups</h2>
        <BackupsEditor settings={settings} on_change={on_change} />
      </section>

      <section class="settings_group">
        <h2 class="settings_heading">MCP server</h2>
        <McpEditor settings={settings} on_change={on_change} />
      </section>
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
// Durations
// ============================================================================

interface DurationsEditorProps {
  durations: TaskDuration[]
  on_change: (durations: TaskDuration[]) => void
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
    on_change([...durations, { id: crypto.randomUUID(), amount: 1, unit: 'day' }])
  }

  return (
    <>
      <p class="setting_hint">
        The gaps offered by Duration in a task's details, which set the due date that long after the start. Hours show only
        when the start has a time, and Same day only when it has none.
      </p>

      {durations.map((duration, index) => (
        <div key={duration.id} class="setting_row reschedule_option">
          <input
            type="number"
            min="0"
            step="1"
            class="reschedule_days"
            value={duration.amount}
            onChange={(event) => update(duration.id, { amount: Math.max(0, Math.round(Number(event.currentTarget.value) || 0)) })}
            aria-label="Amount"
          />
          <select
            class="duration_unit"
            value={duration.unit}
            onChange={(event) => update(duration.id, { unit: event.currentTarget.value as TaskDuration['unit'] })}
            aria-label="Unit"
          >
            <option value="hour">Hours</option>
            <option value="day">Days</option>
            <option value="week">Weeks</option>
            <option value="month">Months</option>
          </select>
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

  async function refresh(): Promise<void> {
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
      <div class="setting_row">
        <div class="setting_text">
          <span class="setting_label">Back up now</span>
          <span class="setting_hint">Saves a copy of every task, tag and setting, named by the time it was taken.</span>
        </div>
        <button onClick={() => void window.x_settings.show_backup_folder()}>Show folder</button>
        <button onClick={() => void create()}>Back up</button>
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
