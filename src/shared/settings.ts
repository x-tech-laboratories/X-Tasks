import type { View } from './tasks'

// ============================================================================
// Settings
// ============================================================================

export type ThemeChoice = 'system' | 'light' | 'dark'

// The view the app opens on, where 'last' means the one shown when it was closed.
export type LaunchView = 'last' | 'all' | 'active' | 'completed'

export interface Settings {
  theme: ThemeChoice
  launch_view: LaunchView
  confirm_tag_removal: boolean
  last_view: View
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  launch_view: 'last',
  confirm_tag_removal: true,
  last_view: { kind: 'all' }
}

// ============================================================================
// Bridge contract
// ============================================================================

export interface SettingsApi {
  get_settings: () => Promise<Settings>
  set_setting: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => Promise<void>
  get_database_path: () => Promise<string>
  show_database_folder: () => Promise<void>
}

export const GET_SETTINGS_CHANNEL = 'settings:get'
export const SET_SETTING_CHANNEL = 'settings:set'
export const GET_DATABASE_PATH_CHANNEL = 'settings:database-path'
export const SHOW_DATABASE_FOLDER_CHANNEL = 'settings:show-database-folder'
