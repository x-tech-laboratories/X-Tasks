import { useEffect, useState } from 'preact/hooks'

import { describe_rule } from 'recurrence-input'

import type { LaunchView, PriorityScale, RescheduleOption, Settings, ThemeChoice } from '@shared/settings'
import { RecurrencePicker } from './RecurrencePicker'
import { rule_format } from './schedule'

// ============================================================================
// Choices
// ============================================================================

const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const LAUNCH_VIEW_CHOICES: { value: LaunchView; label: string }[] = [
  { value: 'last', label: 'Last view used' },
  { value: 'all', label: 'All tasks' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' }
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
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void
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
        <h2 class="settings_heading">Storage</h2>

        <div class="setting_row">
          <div class="setting_text">
            <span class="setting_label">Database</span>
            <span class="setting_hint setting_path">{database_path}</span>
          </div>
          <button onClick={() => void window.x_settings.show_database_folder()}>Show in folder</button>
        </div>
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
