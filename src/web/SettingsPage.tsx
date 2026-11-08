import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { CommitInput, Segmented, Select, Switch } from '@x-tech-laboratories/x-libs/web/react/controls'
import { PageHeading, RowActions, SettingRow, SettingsGroup, Stack, moved } from '@x-tech-laboratories/x-libs/web/react/layout'
import { use_resource } from '@x-tech-laboratories/x-libs/web/react/states'
import { describe_rule } from 'recurrence-input'

import { MCP_PORT_RANGE, UPCOMING_REPEAT_DAYS_RANGE, type DatabaseBackup, type GroupingMemory, type LaunchView, type LayoutMemory, type TaskLayout, type ViewLayout, type OverdueRepeatReschedule, type ServerCertificate, type RescheduleOption, type SearchScope, type Settings, type SyntaxId, type TagMatch, type TagScope, type TagSelection, type TaskDateField, type TaskDuration, type TaskGrouping, type TaskRelationship, type ThemeChoice, DURATION_UNITS, task_duration } from '@shared/settings'
import type { SyncDirection, SyncStatus } from '@shared/sync'
import type { Tag, TagGroup, Task } from '@shared/tasks'
import { CertificateDialog } from './CertificateDialog'
import { detail_section_name, ordered_detail_sections, type TaskDetailSection } from './detail_sections'
import { grouping_choices, view_of_key } from './grouping'
import { TASK_LAYOUT_CHOICES } from './layouts'
import { RecurrencePicker } from './RecurrencePicker'
import { SyntaxExamples } from './SyntaxHelp'
import { SYNTAXES, syntax_by_id, type SyntaxExample } from './syntax'
import { view_title } from './views'
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

const OVERDUE_REPEAT_CHOICES: { value: OverdueRepeatReschedule; label: string }[] = [
  { value: 'off', label: 'Leave them overdue' },
  { value: 'today', label: 'Move to today' },
  { value: 'next', label: 'Move to next repeat' }
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

const GROUPING_MEMORY_CHOICES: { value: GroupingMemory; label: string }[] = [
  { value: 'automatic', label: 'Remembered' },
  { value: 'on_demand', label: 'Saved by hand' },
  { value: 'shared', label: 'Same everywhere' }
]

const CALENDAR_SLOT_CHOICES = [5, 10, 15, 20, 30, 60]

const CALENDAR_SLOT_LABEL_CHOICES = [15, 30, 60, 120, 180]

// Writes a number of minutes the way a person says it, such as "30 minutes" or "2 hours".
function minutes_label(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`
  return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
}

const LAYOUT_MEMORY_CHOICES: { value: LayoutMemory; label: string }[] = [
  { value: 'automatic', label: 'Remembered' },
  { value: 'on_demand', label: 'Saved by hand' },
  { value: 'shared', label: 'Same everywhere' }
]

const SEARCH_SCOPE_CHOICES: { value: SearchScope; label: string }[] = [
  { value: 'view', label: 'This view' },
  { value: 'all', label: 'All tasks' }
]


// ============================================================================
// Syntax setting
// ============================================================================

interface SyntaxSettingProps {
  label: string
  hint: string
  value: SyntaxId
  on_change: (id: SyntaxId) => void
  examples_of: (id: SyntaxId) => SyntaxExample[]
}

// A syntax picker with what the chosen syntax looks like below it.
function SyntaxSetting({ label, hint, value, on_change, examples_of }: SyntaxSettingProps) {
  return (
    <Stack tight>
      <SettingRow label={label} hint={hint} as_label>
        <select value={value} onChange={(event) => on_change(event.currentTarget.value as SyntaxId)}>
          {SYNTAXES.map((syntax) => (
            <option key={syntax.id} value={syntax.id}>
              {syntax.name}
            </option>
          ))}
        </select>
      </SettingRow>
      <p className="setting-hint">{syntax_by_id(value).summary}</p>
      <SyntaxExamples examples={examples_of(value)} />
    </Stack>
  )
}

// ============================================================================
// Settings page
// ============================================================================

interface SettingsPageProps {
  settings: Settings
  tags: Tag[]
  tag_groups: TagGroup[]
  tasks: Task[]
  on_change: <Key extends keyof Settings>(key: Key, value: Settings[Key]) => void | Promise<void>
  // Saves the relationships and removes the links of any taken out.
  on_change_relationships: (relationships: TaskRelationship[]) => void
  on_add_tag_group: (name: string, is_rule: boolean) => void
}

export function SettingsPage({ settings, tags, tag_groups, tasks, on_change, on_change_relationships, on_add_tag_group }: SettingsPageProps) {
  const database_path = use_resource(() => window.x_settings.get_database_path(), []).data ?? ''
  const [new_group_name, set_new_group_name] = useState('')
  const [is_new_group_rule, set_is_new_group_rule] = useState(false)

  function submit_new_group(event: FormEvent): void {
    event.preventDefault()
    const name = new_group_name.trim()
    if (!name) return

    on_add_tag_group(name, is_new_group_rule)
    set_new_group_name('')
  }

  const categories: SettingsCategory[] = [
    {
      heading: 'General',
      sections: [
        {
          id: 'appearance',
          heading: 'Appearance',
          content: (
            <>
              <SettingRow label="Theme" hint="System follows the light or dark choice of your desktop.">
                <Segmented label="Theme" choices={THEME_CHOICES} value={settings.theme} on_change={(value) => on_change('theme', value)} />
              </SettingRow>

              <SettingRow label="Tint task rows by tag" hint="Each task row takes a light shade of its first coloured tag, its own tags before rule tags." as_label>
                <Switch label="Tint task rows by tag" checked={settings.tint_rows_by_tag} on_change={(on) => on_change('tint_rows_by_tag', on)} />
              </SettingRow>

              <SettingRow label="Streak dots on task rows" hint="Routines and their subtasks show their last week of done and missed occurrences beside the title." as_label>
                <Switch label="Streak dots on task rows" checked={settings.show_streak_strip_on_rows} on_change={(on) => on_change('show_streak_strip_on_rows', on)} />
              </SettingRow>
            </>
          )
        },
        {
          id: 'startup',
          heading: 'Startup',
          content: (
            <SettingRow label="Open on launch" hint="The view shown when the app starts." as_label>
              <Select bare label="Open on launch" options={LAUNCH_VIEW_CHOICES.map(({ value, label }): [typeof value, string] => [value, label])} value={settings.launch_view} on_change={(value) => on_change('launch_view', value)} />
            </SettingRow>
          )
        }
      ]
    },
    {
      heading: 'Tasks',
      sections: [
        {
          id: 'adding-tasks',
          heading: 'Adding tasks',
          content: (
            <>
              <SyntaxSetting
                label="Syntax"
                hint="How Enter reads tags, dates and repeats out of what you typed; the rest becomes the title."
                value={settings.quick_add_syntax}
                on_change={(id) => on_change('quick_add_syntax', id)}
                examples_of={(id) => syntax_by_id(id).quick_add_examples}
              />

              <SettingRow
                label="Subtasks start with their parent's tags"
                hint="A new subtask is given its parent's tags when added. Either way it already shows wherever its parent does."
                as_label
              >
                <Switch label="Subtasks start with their parent's tags" checked={settings.subtasks_inherit_tags} on_change={(on) => on_change('subtasks_inherit_tags', on)} />
              </SettingRow>
            </>
          )
        },
        {
          id: 'completing-tasks',
          heading: 'Completing tasks',
          content: (
            <>
              <SettingRow
                label="Collapse completed branches"
                hint="Completing a task folds its subtasks away once they are all done too. Other tasks stay as they are."
                as_label
              >
                <Switch label="Collapse completed branches" checked={settings.collapse_completed_branches} on_change={(on) => on_change('collapse_completed_branches', on)} />
              </SettingRow>

              <SettingRow label="Ask before clearing completed tasks" hint="Undo can still bring them back for a few seconds either way." as_label>
                <Switch label="Ask before clearing completed tasks" checked={settings.confirm_clear_completed} on_change={(on) => on_change('confirm_clear_completed', on)} />
              </SettingRow>
            </>
          )
        },
        {
          id: 'my-day',
          heading: 'My Day',
          content: (
            <>
              <SettingRow label="Clear My Day each day" hint="My Day starts empty every morning. When off, tasks stay until you take them out." as_label>
                <Switch label="Clear My Day each day" checked={settings.auto_clear_my_day} on_change={(on) => on_change('auto_clear_my_day', on)} />
              </SettingRow>

              <SettingRow
                label="Add due tasks to My Day"
                hint="Open tasks whose task date is today or earlier go into My Day each morning, and when given such a date."
                as_label
              >
                <Switch label="Add due tasks to My Day" checked={settings.add_due_to_my_day} on_change={(on) => on_change('add_due_to_my_day', on)} />
              </SettingRow>

              <SettingRow
                label="Remove completed tasks from My Day"
                hint="Completing a top-level task takes it out of My Day. Subtasks stay with their parent."
                as_label
              >
                <Switch label="Remove completed tasks from My Day" checked={settings.remove_done_from_my_day} on_change={(on) => on_change('remove_done_from_my_day', on)} />
              </SettingRow>

              <SettingRow label="Remove rescheduled tasks from My Day" hint="Moving a task's task date past today takes it out of My Day." as_label>
                <Switch label="Remove rescheduled tasks from My Day" checked={settings.remove_future_from_my_day} on_change={(on) => on_change('remove_future_from_my_day', on)} />
              </SettingRow>
            </>
          )
        },
        {
          id: 'task-details',
          heading: 'Task details',
          hint: "The sections a task's details show, top to bottom. Turned off sections are left out.",
          content: (
            <DetailSectionsEditor
              order={ordered_detail_sections(settings.task_detail_order, tag_groups)}
              hidden={settings.hidden_task_detail_sections}
              tag_groups={tag_groups}
              on_change_order={(order) => on_change('task_detail_order', order)}
              on_change_hidden={(hidden) => on_change('hidden_task_detail_sections', hidden)}
            />
          )
        },
        {
          id: 'relationships',
          heading: 'Relationships',
          hint:
            'The ways one task can relate to another, named from both ends. Setting one on a task gives the other task its inverse, so ' +
            '"A waits on B" shows on B as "B blocks A". Use the same name twice for a relationship that reads the same both ways. A ' +
            'waiting task shows how many open tasks it waits on, and the Gantt chart draws an arrow to it.',
          content: <RelationshipsEditor relationships={settings.task_relationships} tasks={tasks} on_change={on_change_relationships} />
        }
      ]
    },
    {
      heading: 'Dates',
      sections: [
        {
          id: 'dates',
          heading: 'Dates and repeats',
          content: (
            <>
              <SettingRow label="Task date" hint="The date shown beside each task, and used to sort, filter, reschedule and fill My Day." as_label>
                <Select bare label="Task date" options={TASK_DATE_CHOICES.map(({ value, label }): [typeof value, string] => [value, label])} value={settings.task_date_field} on_change={(value) => on_change('task_date_field', value)} />
              </SettingRow>

              <SettingRow
                label="Overdue repeating tasks"
                hint="Each day, open repeating tasks whose task date has passed move to today, or skip ahead to their first repeat date from today on."
                as_label
              >
                <Select bare label="Overdue repeating tasks" options={OVERDUE_REPEAT_CHOICES.map(({ value, label }): [typeof value, string] => [value, label])} value={settings.reschedule_overdue_repeats} on_change={(value) => on_change('reschedule_overdue_repeats', value)} />
              </SettingRow>

              <SettingRow label="Repeats in Upcoming" hint="How many days ahead Upcoming lists the later dates of repeating tasks. Zero lists none." as_label>
                <CommitInput
                  type="number"
                  min={UPCOMING_REPEAT_DAYS_RANGE.min}
                  max={UPCOMING_REPEAT_DAYS_RANGE.max}
                  step="1"
                  className="input-xs"
                  value={settings.upcoming_repeat_days}
                  on_commit={(event) =>
                    on_change('upcoming_repeat_days', Math.min(UPCOMING_REPEAT_DAYS_RANGE.max, Math.max(UPCOMING_REPEAT_DAYS_RANGE.min, Math.round(Number(event.currentTarget.value) || 0))))
                  }
                  aria-label="Days ahead"
                />
              </SettingRow>
            </>
          )
        },
        {
          id: 'reschedule',
          heading: 'Reschedule',
          hint:
            "The quick days offered by Reschedule in a task's menu and details. Each is a number of days from today, or the next " +
            'date of a repeat rule counted from now. The task keeps its time of day.',
          content: <RescheduleOptionsEditor options={settings.reschedule_options} on_change={(options) => on_change('reschedule_options', options)} />
        },
        {
          id: 'durations',
          heading: 'Durations',
          hint:
            "The gaps offered by Duration in a task's details, which set the due date that long after the start. Units can be mixed, " +
            'such as 1 hour 30 minutes. A gap with minutes or hours shows only when the start has a time, and Same day only when it ' +
            'has none.',
          content: <DurationsEditor durations={settings.task_durations} on_change={(durations) => on_change('task_durations', durations)} />
        }
      ]
    },
    {
      heading: 'Views',
      sections: [
        {
          id: 'layout',
          heading: 'Layout',
          content: (
            <>
              <SettingRow
                label="Default layout"
                hint="How a view shows its tasks when no layout is saved for it: a list, a table, a board, a calendar or a Gantt chart."
                as_label
              >
                <Select bare label="Default layout" options={TASK_LAYOUT_CHOICES.map(({ value, label }): [typeof value, string] => [value, label])} value={settings.task_layout} on_change={(value) => on_change('task_layout', value)} />
              </SettingRow>

              <SettingRow
                label="Layout per view"
                hint={
                  'Remembered: each view or tag selection keeps the layout, calendar span and Gantt scale last picked in it. Saved by ' +
                  'hand: each keeps its own once Save layout is pressed. Same everywhere: a layout picked in one view applies to every view.'
                }
              >
                <Segmented label="Layout per view" choices={LAYOUT_MEMORY_CHOICES} value={settings.layout_memory} on_change={(value) => on_change('layout_memory', value)} />
              </SettingRow>

              {settings.layout_memory !== 'shared' && (
                <SavedLayouts layouts={settings.view_layouts} tags={tags} on_change={(layouts) => on_change('view_layouts', layouts)} />
              )}
            </>
          )
        },
        {
          id: 'grouping',
          heading: 'Grouping',
          content: (
            <>
              <SettingRow
                label="Default grouping"
                hint="The headings a view puts its tasks under when no grouping is saved for it. Upcoming always goes by date."
                as_label
              >
                <Select bare label="Default grouping" options={grouping_choices(tag_groups).map(({ value, label }): [typeof value, string] => [value, label])} value={settings.task_grouping} on_change={(value) => on_change('task_grouping', value)} />
              </SettingRow>

              <SettingRow
                label="Grouping per view"
                hint={
                  'Remembered: each view or tag selection keeps the grouping last picked in it. Saved by hand: each keeps its own ' +
                  'once Save grouping is pressed. Same everywhere: a grouping picked at the top of a view applies to every view.'
                }
              >
                <Segmented label="Grouping per view" choices={GROUPING_MEMORY_CHOICES} value={settings.grouping_memory} on_change={(value) => on_change('grouping_memory', value)} />
              </SettingRow>

              {settings.grouping_memory !== 'shared' && (
                <SavedGroupings groupings={settings.view_groupings} tags={tags} tag_groups={tag_groups} on_change={(groupings) => on_change('view_groupings', groupings)} />
              )}
            </>
          )
        },
        {
          id: 'calendar',
          heading: 'Calendar',
          content: (
            <>
              <SettingRow
                label="Time slots"
                hint="How much time each row covers in the calendar's week and day views, which is also the step a dragged task snaps to."
                as_label
              >
                <Select bare label="Calendar time slots" options={CALENDAR_SLOT_CHOICES.map((minutes): [number, string] => [minutes, minutes_label(minutes)])} value={settings.calendar_slot_minutes} on_change={(value) => on_change('calendar_slot_minutes', value)} />
              </SettingRow>

              <SettingRow label="Time labels" hint="How often a time is printed down the side of the calendar's week and day views." as_label>
                <Select bare label="Calendar time labels" options={CALENDAR_SLOT_LABEL_CHOICES.map((minutes): [number, string] => [minutes, minutes_label(minutes)])} value={settings.calendar_slot_label_minutes} on_change={(value) => on_change('calendar_slot_label_minutes', value)} />
              </SettingRow>
            </>
          )
        }
      ]
    },
    {
      heading: 'Tags and search',
      sections: [
        {
          id: 'tags',
          heading: 'Tags',
          content: (
            <>
              <form onSubmit={submit_new_group}>
                <SettingRow
                  label="New filter group"
                  hint="Adds a section to the sidebar with its own tags: plain tags given by hand, such as Context, or rule tags that apply themselves, such as Overdue."
                >
                  <input
                    value={new_group_name}
                    onChange={(event) => set_new_group_name(event.currentTarget.value)}
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
                </SettingRow>
              </form>

              <SettingRow
                label="Tag selection"
                hint={
                  'How many sidebar tags can be selected at once: one in all, one from each group, or any number. Clicking a selected ' +
                  'tag clears it.'
                }
              >
                <Segmented label="Tag selection" choices={TAG_SELECTION_CHOICES} value={settings.tag_selection} on_change={(value) => on_change('tag_selection', value)} />
              </SettingRow>

              <SettingRow label="Match tasks with" hint="Whether a task must have every selected tag, or just one of them, to show.">
                <Segmented label="Match tasks with" choices={TAG_MATCH_CHOICES} value={settings.tag_match} on_change={(value) => on_change('tag_match', value)} />
              </SettingRow>

              <SettingRow label="Parent tags show" hint="Whether selecting a tag with tags inside it shows their tasks too, or only the tasks with that tag itself.">
                <Segmented label="Parent tags show" choices={TAG_SCOPE_CHOICES} value={settings.tag_scope} on_change={(value) => on_change('tag_scope', value)} />
              </SettingRow>

              <SettingRow
                label="Show empty tags"
                hint="When off, the sidebar hides tags no task has, done or not. A selected tag, and one holding a tag that shows, still shows."
                as_label
              >
                <Switch label="Show empty tags" checked={settings.show_empty_tags} on_change={(on) => on_change('show_empty_tags', on)} />
              </SettingRow>

              <SettingRow label="Ask before deleting a tag" hint="Deleting a tag also deletes its sub-tags. Tasks are kept." as_label>
                <Switch label="Ask before deleting a tag" checked={settings.confirm_tag_removal} on_change={(on) => on_change('confirm_tag_removal', on)} />
              </SettingRow>
            </>
          )
        },
        {
          id: 'tag-colours',
          heading: 'Tag colours',
          hint:
            'The colours offered as swatches when editing a tag. Any other colour can still be picked there. Changing a swatch ' +
            'leaves tags already given that colour as they are.',
          content: <TagColorsEditor colors={settings.tag_colors} on_change={(colors) => on_change('tag_colors', colors)} />
        },
        {
          id: 'search',
          heading: 'Search',
          content: (
            <>
              <SettingRow
                label="Search in"
                hint="Whether typing in the bar at the top searches only the view on screen, or every task. Enter still adds the task to the view on screen."
              >
                <Segmented label="Search in" choices={SEARCH_SCOPE_CHOICES} value={settings.search_scope} on_change={(value) => on_change('search_scope', value)} />
              </SettingRow>

              <SyntaxSetting
                label="Syntax"
                hint="How typing in the bar filters tasks; words a syntax does not know are looked for in titles and notes."
                value={settings.search_syntax}
                on_change={(id) => on_change('search_syntax', id)}
                examples_of={(id) => syntax_by_id(id).search_examples}
              />
            </>
          )
        }
      ]
    },
    {
      heading: 'Data',
      sections: [
        {
          id: 'storage',
          heading: 'Storage',
          content: (
            <SettingRow label="Database" hint={<span className="path">{database_path}</span>}>
              {window.x_settings.host === 'desktop' && <button onClick={() => void window.x_settings.show_database_folder()}>Show in folder</button>}
            </SettingRow>
          )
        },
        { id: 'backups', heading: 'Backups', content: <BackupsEditor settings={settings} on_change={on_change} /> },
        ...(window.x_settings.host !== 'web'
          ? [
              {
                id: 'sync',
                heading: 'Sync',
                hint: "Keeps this device's tasks in step with an X-Tasks server and every device connected to it. Changes made offline are sent when the server can be reached.",
                content: <SyncEditor />
              }
            ]
          : []),
        ...(window.x_settings.host !== 'android' ? [{ id: 'mcp', heading: 'MCP server', content: <McpEditor settings={settings} on_change={on_change} /> }] : [])
      ]
    }
  ]

  return (
    <>
      <PageHeading title="Settings" />

      <div className="settings_page">
        <div className="settings_layout">
          <SettingsOutline categories={categories} />

          <div className="settings_sections">
            {categories.map((category) => (
              <section key={category.heading} className="settings_category">
                <h2 className="settings_category_heading">{category.heading}</h2>
                {category.sections.map((section) => (
                  <div key={section.id} id={section_anchor(section.id)} className="settings_section">
                    <SettingsGroup heading={section.heading} hint={section.hint}>
                      {section.content}
                    </SettingsGroup>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// Outline
// ============================================================================

interface SettingsSection {
  id: string
  heading: string
  hint?: string
  content: ReactNode
}

interface SettingsCategory {
  heading: string
  sections: SettingsSection[]
}

function section_anchor(id: string): string {
  return `settings-${id}`
}

// How far below the top of the outline a section's heading may sit and still count as the one being read.
const CURRENT_SECTION_SLACK_PX = 48

// How long a jump from the outline may take before the outline follows scrolling again.
const JUMP_TIMEOUT_MS = 1000

// A list of every section beside the page that jumps to the one clicked and marks the one being read.
function SettingsOutline({ categories }: { categories: SettingsCategory[] }) {
  const ids = categories.flatMap((category) => category.sections.map((section) => section.id))
  const [current_id, set_current_id] = useState(ids[0])
  const outline = useRef<HTMLElement>(null)
  const is_jumping = useRef(false)
  const jump_timer = useRef<number>(undefined)
  const ids_key = ids.join(' ')

  useEffect(() => {
    // The section being read is the last one whose heading has reached the top of the outline, or the last one once scrolled to the end.
    function follow_scroll(event: Event): void {
      if (is_jumping.current || !outline.current || outline.current.contains(event.target as Node)) return
      const top = outline.current.getBoundingClientRect().top + CURRENT_SECTION_SLACK_PX
      const scroller = event.target instanceof Element ? event.target : document.scrollingElement
      const is_at_end = scroller !== null && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1

      let reached = ids[0]
      for (const id of ids) {
        const element = document.getElementById(section_anchor(id))
        if (element && element.getBoundingClientRect().top <= top) reached = id
      }
      set_current_id(is_at_end ? ids.at(-1) : reached)
    }

    function end_jump(): void {
      is_jumping.current = false
    }

    document.addEventListener('scroll', follow_scroll, { capture: true, passive: true })
    document.addEventListener('scrollend', end_jump, { capture: true })
    return () => {
      document.removeEventListener('scroll', follow_scroll, { capture: true })
      document.removeEventListener('scrollend', end_jump, { capture: true })
      window.clearTimeout(jump_timer.current)
    }
  }, [ids_key])

  // An outline taller than the window scrolls itself to keep the current section's link in view.
  useEffect(() => {
    const nav = outline.current
    const link = nav?.querySelector<HTMLElement>('.is_current')
    if (!nav || !link) return
    if (link.offsetTop < nav.scrollTop) nav.scrollTop = link.offsetTop
    else if (link.offsetTop + link.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = link.offsetTop + link.offsetHeight - nav.clientHeight
  }, [current_id])

  function jump_to(id: string): void {
    set_current_id(id)
    is_jumping.current = true
    window.clearTimeout(jump_timer.current)
    jump_timer.current = window.setTimeout(() => (is_jumping.current = false), JUMP_TIMEOUT_MS)
    document.getElementById(section_anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav ref={outline} className="settings_outline" aria-label="Settings sections">
      {categories.map((category) => (
        <div key={category.heading} className="settings_outline_category">
          <span className="settings_outline_heading">{category.heading}</span>
          {category.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section_anchor(section.id)}`}
              className={section.id === current_id ? 'settings_outline_link is_current' : 'settings_outline_link'}
              aria-current={section.id === current_id ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault()
                jump_to(section.id)
              }}
            >
              {section.heading}
            </a>
          ))}
        </div>
      ))}
    </nav>
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

  function move(from: number, to: number): void {
    on_change(moved(options, from, to))
  }

  function add(): void {
    on_change([...options, { id: crypto.randomUUID(), name: 'New option', mode: 'days', days: 7, rule: '' }])
  }

  return (
    <>
      {options.map((option, index) => (
        <div key={option.id} className="setting-row reschedule_option">
          <CommitInput
            value={option.name}
            on_commit={(event) => update(option.id, { name: event.currentTarget.value.trim() || option.name })}
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
            <CommitInput
              type="number"
              min="0"
              step="1"
              className="input-xs"
              value={option.days}
              on_commit={(event) => update(option.id, { days: Math.max(0, Math.round(Number(event.currentTarget.value) || 0)) })}
              aria-label="Days from today"
            />
          ) : (
            <button className="recurrence_button reschedule_rule" onClick={() => set_picking_rule_id(option.id)}>
              {(option.rule && describe_rule(option.rule, rule_format(null))) || 'Choose a rule'}
            </button>
          )}
          <RowActions
            index={index}
            count={options.length}
            remove_label={`Remove ${option.name}`}
            on_move={move}
            on_remove={() => on_change(options.filter((each) => each.id !== option.id))}
          />
        </div>
      ))}

      <button className="fit-content" onClick={add}>
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
// Task detail sections
// ============================================================================

interface DetailSectionsEditorProps {
  order: TaskDetailSection[]
  hidden: string[]
  tag_groups: TagGroup[]
  on_change_order: (order: TaskDetailSection[]) => void
  on_change_hidden: (hidden: string[]) => void
}

// Each section of a task's details with a switch to show it and buttons to move it up or down.
function DetailSectionsEditor({ order, hidden, tag_groups, on_change_order, on_change_hidden }: DetailSectionsEditorProps) {
  function set_shown(section: TaskDetailSection, is_shown: boolean): void {
    const others = hidden.filter((each) => each !== section)
    on_change_hidden(is_shown ? others : [...others, section])
  }

  return (
    <>
      {order.map((section, index) => {
        const name = detail_section_name(section, tag_groups)
        return (
          <div key={section} className="setting-row reschedule_option">
            <span className="detail_section_name">{name}</span>
            <Switch label={`Show ${name}`} checked={!hidden.includes(section)} on_change={(is_shown) => set_shown(section, is_shown)} />
            <RowActions index={index} count={order.length} remove_label="" on_move={(from, to) => on_change_order(moved(order, from, to))} />
          </div>
        )
      })}
    </>
  )
}

// ============================================================================
// Relationships
// ============================================================================

interface RelationshipsEditorProps {
  relationships: TaskRelationship[]
  tasks: Task[]
  on_change: (relationships: TaskRelationship[]) => void
}

// The kinds of links tasks can have, each named from both ends, in the order a task's details offer them.
function RelationshipsEditor({ relationships, tasks, on_change }: RelationshipsEditorProps) {
  function update(id: string, change: Partial<TaskRelationship>): void {
    on_change(relationships.map((relationship) => (relationship.id === id ? { ...relationship, ...change } : relationship)))
  }

  function move(from: number, to: number): void {
    on_change(moved(relationships, from, to))
  }

  function add(): void {
    on_change([...relationships, { id: crypto.randomUUID(), name: 'Depends on', inverse_name: 'Needed by', waiter: 'first' }])
  }

  // Taking out a relationship in use takes its links off every task, so that asks first.
  function remove(relationship: TaskRelationship): void {
    const count = tasks.reduce((total, task) => total + task.links.filter((link) => link.relationship_id === relationship.id).length, 0)
    if (count > 0 && !window.confirm(`Remove "${relationship.name}" and its ${count} ${count === 1 ? 'link' : 'links'} between tasks?`)) return
    on_change(relationships.filter((each) => each.id !== relationship.id))
  }

  return (
    <>
      {relationships.map((relationship, index) => (
        <div key={relationship.id} className="setting-row reschedule_option">
          <div className="relationship_names">
            A
            <CommitInput
              value={relationship.name}
              on_commit={(event) => update(relationship.id, { name: event.currentTarget.value.trim() || relationship.name })}
              aria-label="Name"
            />
            B, and B
            <CommitInput
              value={relationship.inverse_name}
              on_commit={(event) => update(relationship.id, { inverse_name: event.currentTarget.value.trim() || relationship.inverse_name })}
              aria-label="Inverse name"
            />
            A
          </div>
          <select
            value={relationship.waiter}
            onChange={(event) => update(relationship.id, { waiter: event.currentTarget.value as TaskRelationship['waiter'] })}
            aria-label="Which task waits"
          >
            <option value="none">Neither waits</option>
            <option value="first">A waits on B</option>
            <option value="second">B waits on A</option>
          </select>
          <RowActions
            index={index}
            count={relationships.length}
            remove_label={`Remove ${relationship.name}`}
            on_move={move}
            on_remove={() => remove(relationship)}
          />
        </div>
      ))}

      <button className="fit-content" onClick={add}>
        Add relationship
      </button>
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

  function move(from: number, to: number): void {
    on_change(moved(colors, from, to))
  }

  return (
    <>
      {colors.map((color, index) => (
        <div key={`${index}-${color}`} className="setting-row reschedule_option">
          <input type="color" className="tag_color_custom" value={color} onChange={(event) => update(index, event.currentTarget)} aria-label="Colour" />
          <CommitInput
            className="tag_color_hex"
            value={color}
            on_commit={(event) => update(index, event.currentTarget)}
            aria-label="Colour code"
          />
          <RowActions
            index={index}
            count={colors.length}
            remove_label={`Remove ${color}`}
            on_move={move}
            on_remove={() => on_change(colors.filter((_each, at) => at !== index))}
          />
        </div>
      ))}

      <button className="fit-content" onClick={() => on_change([...colors, '#64748b'])}>
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

  function move(from: number, to: number): void {
    on_change(moved(durations, from, to))
  }

  function add(): void {
    on_change([...durations, task_duration(crypto.randomUUID(), { days: 1 })])
  }

  return (
    <>
      {durations.map((duration, index) => (
        <div key={duration.id} className="setting-row reschedule_option">
          {DURATION_UNITS.map((unit) => (
            <label key={unit} className="duration_amount">
              <CommitInput
                type="number"
                min="0"
                step="1"
                className="input-xs"
                value={duration[unit]}
                on_commit={(event) => update(duration.id, { [unit]: Math.max(0, Math.round(Number(event.currentTarget.value) || 0)) })}
                aria-label={unit}
              />
              <span>{DURATION_UNIT_SHORT_NAMES[unit]}</span>
            </label>
          ))}
          <span className="duration_preview">{duration_label(duration)}</span>
          <RowActions
            index={index}
            count={durations.length}
            remove_label={`Remove ${duration_label(duration)}`}
            on_move={move}
            on_remove={() => on_change(durations.filter((each) => each.id !== duration.id))}
          />
        </div>
      ))}

      <button className="fit-content" onClick={add}>
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
  const status = use_resource(() => window.x_settings.get_mcp_status(), [settings.mcp_enabled, settings.mcp_port]).data

  function change_port(text: string): void {
    const port = Math.round(Number(text))
    if (port >= MCP_PORT_RANGE.min && port <= MCP_PORT_RANGE.max) on_change('mcp_port', port)
  }

  return (
    <>
      <SettingRow
        label="Enable MCP server"
        hint="Lets AI assistants on this computer list, add, change and complete tasks. Only programs on this computer can reach it."
        as_label
      >
        <Switch label="Enable MCP server" checked={settings.mcp_enabled} on_change={(on) => on_change('mcp_enabled', on)} />
      </SettingRow>

      <SettingRow label="Port" hint="Change it if another program already uses this one." as_label>
        <CommitInput
          type="number"
          min={MCP_PORT_RANGE.min}
          max={MCP_PORT_RANGE.max}
          step="1"
          className="input-sm"
          value={settings.mcp_port}
          on_commit={(event) => change_port(event.currentTarget.value)}
          aria-label="MCP server port"
        />
      </SettingRow>

      {status?.state === 'running' && (
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">Address</span>
            <span className="setting-hint path">{status.url}</span>
            <span className="setting-hint">
              Add it to a client as a Streamable HTTP server, such as with <code>claude mcp add --transport http x-tasks {status.url}</code>
            </span>
          </div>
          <button onClick={() => void navigator.clipboard.writeText(status.url)}>Copy</button>
        </div>
      )}

      {status?.state === 'failed' && <p className="setting-hint tone-bad">Could not start: {status.error}</p>}
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

function SyncEditor() {
  const sync = use_resource(() => window.x_settings.get_sync_status(), [], { refresh_in_milliseconds: SYNC_STATUS_POLL_MS })
  const status = sync.data
  const [server_url, set_server_url] = useState('')
  const [token, set_token] = useState('')
  const [is_busy, set_is_busy] = useState(false)
  const [error, set_error] = useState('')

  // The address field starts with the saved server, once only, so typing is never overwritten by a later poll.
  const has_prefilled = useRef(false)
  useEffect(() => {
    if (has_prefilled.current || !status) return
    has_prefilled.current = true
    if (status.server_url) set_server_url(status.server_url)
  }, [status])

  async function run(action: () => Promise<SyncStatus>): Promise<void> {
    set_is_busy(true)
    set_error('')
    try {
      await action()
      await sync.reload(true)
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
  const has_problem = status.state === 'failed' || status.state === 'needs_setup'

  return (
    <>
      {!is_connected && (
        <>
          <SettingRow label="Server address" hint="Where x-tasks-server is reached, such as https://tasks.example.org/" as_label>
            <input type="url" className="sync_input" value={server_url} onChange={(event) => set_server_url(event.currentTarget.value)} aria-label="Server address" />
          </SettingRow>

          <SettingRow label="Access token" hint={`The token the server was set up with${has_saved_token ? '; leave it empty to keep the saved one' : ''}.`} as_label>
            <input type="password" className="sync_input" value={token} onChange={(event) => set_token(event.currentTarget.value)} aria-label="Access token" />
          </SettingRow>

          <SettingRow
            label="Start syncing"
            hint="Choose once whose tasks to keep: a new device usually takes the server's, and the first device sends its own."
          >
            <button disabled={is_busy || server_url.trim() === ''} onClick={() => connect('download')}>Use the server's tasks</button>
            <button disabled={is_busy || server_url.trim() === ''} onClick={() => connect('upload')}>Send this device's tasks</button>
          </SettingRow>
        </>
      )}

      {is_connected && (
        <SettingRow label="Server" hint={<span className="path">{status.server_url}</span>}>
          <button disabled={is_busy} onClick={() => void run(() => window.x_settings.sync_now())}>Sync now</button>
          <button disabled={is_busy} onClick={() => void run(() => window.x_settings.disconnect_sync())}>Stop syncing</button>
        </SettingRow>
      )}

      {status.state !== 'off' && <p className={has_problem ? 'setting-hint tone-bad' : 'setting-hint'}>{describe_sync_status(status)}</p>}
      {error && <p className="setting-hint tone-bad">{error}</p>}

      {window.x_settings.host !== 'web' && <TrustedCertificateEditor server_url={status.server_url || server_url} />}
    </>
  )
}

// Takes the certificate authority of a server whose certificate this device does not already trust, such as a home server's own.
function TrustedCertificateEditor({ server_url }: { server_url: string }) {
  const trusted = use_resource(() => window.x_settings.get_trusted_certificate(), [])
  const saved = trusted.data
  const [pem, set_pem] = useState('')
  const [error, set_error] = useState('')
  const [offered, set_offered] = useState<ServerCertificate | null>(null)
  const [is_reading, set_is_reading] = useState(false)

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
      await window.x_settings.set_trusted_certificate(text)
      await trusted.reload(true)
      set_pem('')
    } catch (caught) {
      set_error(error_message(caught))
    }
  }

  if (!saved) return null

  return (
    <>
      <div className="setting-row">
        <div className="setting-text">
          <span className="setting-label">Trusted certificate authority</span>
          <span className="setting-hint">
            {saved.subject ? `Trusting ${saved.subject} for the server.` : 'For a server with a self-signed or private certificate: get its authority from the server, or paste the PEM certificate.'}
          </span>
          <textarea
            value={pem}
            onChange={(event) => set_pem(event.currentTarget.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            aria-label="Certificate authority in PEM form"
            rows={4}
          />
        </div>
        <button disabled={is_reading || server_url.trim() === ''} onClick={() => void read_from_server()}>Get from server</button>
        <button disabled={pem.trim() === ''} onClick={() => void save(pem)}>Trust</button>
        {saved.subject && <button onClick={() => void save('')}>Forget</button>}
      </div>
      {error && <p className="setting-hint tone-bad">{error}</p>}
      {offered && (
        <CertificateDialog
          certificate={offered}
          server_url={server_url.trim()}
          on_close={() => {
            set_offered(null)
            void trusted.reload(true)
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
        <SettingRow
          label="Backup folder"
          hint={folder_name || "Pick a folder in the phone's storage, such as Documents, where file managers and sync apps can reach the backups."}
        >
          <button onClick={() => void choose_folder()}>{folder_name ? 'Change' : 'Choose'}</button>
        </SettingRow>
      )}

      <SettingRow label="Back up now" hint="Saves a copy of every task, tag and setting, named by the time it was taken.">
        {window.x_settings.host === 'desktop' && <button onClick={() => void window.x_settings.show_backup_folder()}>Show folder</button>}
        <button onClick={() => void create()} disabled={needs_folder && !folder_name}>
          Back up
        </button>
      </SettingRow>

      <SettingRow label="Back up daily" hint="Takes a backup once a day while the app is running. Backups made by hand are always kept." as_label>
        <Switch label="Back up daily" checked={settings.auto_backup} on_change={(on) => change_automatic('auto_backup', on)} />
      </SettingRow>

      <SettingRow label="Daily backups to keep" hint="Older daily backups are deleted once there are more than this." as_label>
        <CommitInput
          type="number"
          min="1"
          step="1"
          className="input-xs"
          value={settings.auto_backups_to_keep}
          disabled={!settings.auto_backup}
          on_commit={(event) =>
            void change_automatic('auto_backups_to_keep', Math.max(1, Math.round(Number(event.currentTarget.value) || 1)))
          }
        />
      </SettingRow>

      {backups.length === 0 && <p className="setting-hint">No backups yet.</p>}

      {backups.map((backup) => (
        <SettingRow key={backup.name} label={format_taken_at(backup.taken_at)} hint={`${backup.is_automatic ? 'Daily' : 'By hand'} · ${format_size(backup.size_bytes)}`}>
          <button onClick={() => void restore(backup)}>Restore</button>
          <span className="row-actions">
            <button className="icon remove" onClick={() => void remove(backup)} aria-label={`Delete backup from ${format_taken_at(backup.taken_at)}`}>
              ×
            </button>
          </span>
        </SettingRow>
      ))}
    </>
  )
}

// ============================================================================
// Saved groupings
// ============================================================================

interface SavedGroupingsProps {
  groupings: Record<string, TaskGrouping>
  tags: Tag[]
  tag_groups: TagGroup[]
  on_change: (groupings: Record<string, TaskGrouping>) => void
}

// The views and tag selections with a grouping of their own, each of which can be changed or sent back to the default.
function SavedGroupings({ groupings, tags, tag_groups, on_change }: SavedGroupingsProps) {
  const entries = Object.entries(groupings)
  if (entries.length === 0) return <p className="setting-hint">No view has a grouping of its own yet.</p>

  return (
    <>
      {entries.map(([key, grouping]) => {
        const title = view_title(view_of_key(key), tags)
        return (
          <SettingRow key={key} label={title}>
            <select value={grouping} onChange={(event) => on_change({ ...groupings, [key]: event.currentTarget.value as TaskGrouping })} aria-label={`Grouping for ${title}`}>
              {grouping_choices(tag_groups).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="row-actions">
              <button
                className="icon remove"
                onClick={() => on_change(Object.fromEntries(entries.filter(([each_key]) => each_key !== key)))}
                aria-label={`Use the default grouping for ${title}`}
                title="Use the default grouping"
              >
                ×
              </button>
            </span>
          </SettingRow>
        )
      })}
    </>
  )
}

// ============================================================================
// Saved layouts
// ============================================================================

interface SavedLayoutsProps {
  layouts: Record<string, ViewLayout>
  tags: Tag[]
  on_change: (layouts: Record<string, ViewLayout>) => void
}

// The views and tag selections with a layout of their own, each of which can be changed or sent back to the default.
function SavedLayouts({ layouts, tags, on_change }: SavedLayoutsProps) {
  const entries = Object.entries(layouts)
  if (entries.length === 0) return <p className="setting-hint">No view has a layout of its own yet.</p>

  return (
    <>
      {entries.map(([key, layout]) => {
        const title = view_title(view_of_key(key), tags)
        return (
          <SettingRow key={key} label={title}>
            <select
              value={layout.layout}
              onChange={(event) => on_change({ ...layouts, [key]: { ...layout, layout: event.currentTarget.value as TaskLayout } })}
              aria-label={`Layout for ${title}`}
            >
              {TASK_LAYOUT_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="row-actions">
              <button
                className="icon remove"
                onClick={() => on_change(Object.fromEntries(entries.filter(([each_key]) => each_key !== key)))}
                aria-label={`Use the default layout for ${title}`}
                title="Use the default layout"
              >
                ×
              </button>
            </span>
          </SettingRow>
        )
      })}
    </>
  )
}
