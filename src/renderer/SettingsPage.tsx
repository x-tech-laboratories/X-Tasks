import { useEffect, useState } from 'preact/hooks'

import type { LaunchView, Settings, ThemeChoice } from '@shared/settings'

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
  { value: 'completed', label: 'Completed' },
  { value: 'inbox', label: 'Inbox' }
]

// ============================================================================
// Settings page
// ============================================================================

interface SettingsPageProps {
  settings: Settings
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void
}

export function SettingsPage({ settings, on_change }: SettingsPageProps) {
  const [database_path, set_database_path] = useState('')

  useEffect(() => {
    void window.x_settings.get_database_path().then(set_database_path)
  }, [])

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
            <span class="setting_label">Ask before deleting a list</span>
            <span class="setting_hint">Deleting a list also deletes its tasks.</span>
          </div>
          <input
            type="checkbox"
            checked={settings.confirm_list_removal}
            onChange={(event) => on_change('confirm_list_removal', event.currentTarget.checked)}
          />
        </label>
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
