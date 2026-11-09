import { useState, type FormEvent } from 'react'

import { ColorPicker, TreePicker } from '@x-tech-laboratories/x-libs/web/react/controls'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { EmojiField } from '@x-tech-laboratories/x-libs/web/react/emoji_picker'

import { EMPTY_RULE, type DueCondition, type LinkDirection, type LinkTarget, type RuleCondition, type StartCondition, type Tag, type TagGroup, type TagRule, type Task } from '@shared/tasks'
import type { TaskRelationship } from '@shared/settings'
import { CONDITION_CHOICES, default_condition, rule_matches, type ConditionKind } from './rules'
import { subtree_ids } from '@x-tech-laboratories/x-libs/web/tree'
import { chain_tag_ids_of, tag_path } from './views'

// ============================================================================
// Choices
// ============================================================================

const DUE_CHOICES: { value: DueCondition; label: string }[] = [
  { value: 'overdue', label: 'is overdue' },
  { value: 'today', label: 'is today' },
  { value: 'within_days', label: 'is within the next' },
  { value: 'any', label: 'is set' },
  { value: 'none', label: 'is not set' }
]

const START_CHOICES: { value: StartCondition; label: string }[] = [
  { value: 'started', label: 'has passed' },
  { value: 'not_started', label: 'has not passed or is not set' },
  { value: 'passed_or_none', label: 'has passed or is not set' },
  { value: 'none', label: 'is not set' }
]

// ============================================================================
// Condition row
// ============================================================================

interface ConditionRowProps {
  condition: RuleCondition
  tags: Tag[]
  groups: TagGroup[]
  tasks: Task[]
  relationships: TaskRelationship[]
  on_change: (condition: RuleCondition) => void
  on_remove: () => void
}

// A yes-or-no condition shown as a two-way choice.
function TwoWaySelect({ value, labels, on_change }: { value: boolean; labels: [string, string]; on_change: (value: boolean) => void }) {
  return (
    <select value={value ? 'yes' : 'no'} onChange={(event) => on_change(event.currentTarget.value === 'yes')}>
      <option value="yes">{labels[0]}</option>
      <option value="no">{labels[1]}</option>
    </select>
  )
}

function DaysInput({ days, on_change }: { days: number; on_change: (days: number) => void }) {
  return (
    <>
      <input
        className="input-xs"
        type="number"
        min="1"
        value={days}
        onChange={(event) => on_change(Math.max(1, Number(event.currentTarget.value) || 1))}
        aria-label="Days"
      />
      <span className="rule_unit">days</span>
    </>
  )
}

// Each relationship read either way, or once when both its names are the same.
function link_side_choices(relationships: TaskRelationship[]): { value: string; label: string }[] {
  return relationships.flatMap((relationship) =>
    relationship.name === relationship.inverse_name
      ? [{ value: `${relationship.id}:either`, label: relationship.name }]
      : [
          { value: `${relationship.id}:forward`, label: relationship.name },
          { value: `${relationship.id}:inverse`, label: relationship.inverse_name }
        ]
  )
}

function ConditionRow({ condition, tags, groups, tasks, relationships, on_change, on_remove }: ConditionRowProps) {
  const plain_tags = tags.filter((tag) => !tag.rule)
  const plain_groups = groups.filter((group) => !group.is_rule)

  function controls() {
    switch (condition.kind) {
      case 'status':
        return <TwoWaySelect value={condition.is_done} labels={['is done', 'is not done']} on_change={(is_done) => on_change({ ...condition, is_done })} />
      case 'tag':
        return (
          <>
            <TwoWaySelect value={condition.has_tag} labels={['is', 'is not']} on_change={(has_tag) => on_change({ ...condition, has_tag })} />
            <select value={condition.tag_id} onChange={(event) => on_change({ ...condition, tag_id: event.currentTarget.value })} aria-label="Tag">
              {!plain_tags.some((tag) => tag.id === condition.tag_id) && <option value={condition.tag_id}>Deleted tag</option>}
              {plain_tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag_path(tag, tags)}
                </option>
              ))}
            </select>
          </>
        )
      case 'group':
        return (
          <>
            <TwoWaySelect value={condition.has_tag} labels={['has a tag from', 'has no tag from']} on_change={(has_tag) => on_change({ ...condition, has_tag })} />
            <select value={condition.group_id} onChange={(event) => on_change({ ...condition, group_id: event.currentTarget.value })} aria-label="Filter group">
              {!plain_groups.some((group) => group.id === condition.group_id) && <option value={condition.group_id}>Deleted group</option>}
              {plain_groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </>
        )
      case 'due':
        return (
          <>
            <select value={condition.when} onChange={(event) => on_change({ ...condition, when: event.currentTarget.value as DueCondition })}>
              {DUE_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            {condition.when === 'within_days' && <DaysInput days={condition.days} on_change={(days) => on_change({ ...condition, days })} />}
          </>
        )
      case 'start':
        return (
          <select value={condition.when} onChange={(event) => on_change({ ...condition, when: event.currentTarget.value as StartCondition })}>
            {START_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        )
      case 'completed_within':
        return <DaysInput days={condition.days} on_change={(days) => on_change({ ...condition, days })} />
      case 'recurring':
        return (
          <TwoWaySelect value={condition.is_recurring} labels={['yes', 'no']} on_change={(is_recurring) => on_change({ ...condition, is_recurring })} />
        )
      case 'subtask':
        return (
          <TwoWaySelect value={condition.is_subtask} labels={['is a subtask', 'is a top-level task']} on_change={(is_subtask) => on_change({ ...condition, is_subtask })} />
        )
      case 'open_subtasks':
        return <TwoWaySelect value={condition.has_open} labels={['has some', 'has none']} on_change={(has_open) => on_change({ ...condition, has_open })} />
      case 'tagged':
        return (
          <TwoWaySelect value={condition.is_tagged} labels={['has a tag', 'has no tags']} on_change={(is_tagged) => on_change({ ...condition, is_tagged })} />
        )
      case 'link': {
        const link_condition = condition
        const side = condition.relationship_id === '' ? '' : `${condition.relationship_id}:${condition.direction}`
        const side_choices = link_side_choices(relationships)

        function choose_side(value: string): void {
          const [relationship_id = '', direction = 'either'] = value.split(':')
          on_change({ ...link_condition, relationship_id, direction: direction as LinkDirection })
        }

        return (
          <>
            <TwoWaySelect value={condition.has_link} labels={['has', 'has no']} on_change={(has_link) => on_change({ ...condition, has_link })} />
            <select value={side} onChange={(event) => choose_side(event.currentTarget.value)} aria-label="Relationship">
              <option value="">any relationship</option>
              {side !== '' && !side_choices.some((choice) => choice.value === side) && <option value={side}>Deleted relationship</option>}
              {side_choices.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={condition.target} onChange={(event) => on_change({ ...condition, target: event.currentTarget.value as LinkTarget, task_id: '' })} aria-label="Linked task">
              <option value="any">any task</option>
              <option value="open">an open task</option>
              <option value="task">a chosen task</option>
            </select>
            {condition.target === 'task' && (
              <TreePicker
                label="Task"
                items={tasks}
                name_of={(task) => task.title}
                value={condition.task_id}
                placeholder={condition.task_id === '' ? 'Choose a task…' : 'Deleted task'}
                on_change={(task_id) => on_change({ ...condition, task_id })}
              />
            )}
          </>
        )
      }
      case 'title':
        return (
          <input
            className="rule_text"
            value={condition.text}
            onChange={(event) => on_change({ ...condition, text: event.currentTarget.value })}
            placeholder="Text"
            aria-label="Title text"
          />
        )
    }
  }

  return (
    <li className="rule_condition">
      <select
        value={condition.kind}
        onChange={(event) => on_change(default_condition(event.currentTarget.value as ConditionKind, tags, groups))}
        aria-label="Condition"
      >
        {CONDITION_CHOICES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
      </select>
      {controls()}
      <button type="button" className="icon remove" onClick={on_remove} aria-label="Remove condition">
        ×
      </button>
    </li>
  )
}

// ============================================================================
// Filter dialog
// ============================================================================

const FORM_ID = 'filter_dialog_form'

interface FilterDialogProps {
  heading: string
  name: string
  // The tag's rule, or null for a plain tag, which is only named here.
  rule: TagRule | null
  color: string | null
  icon: string | null
  shows_on_rows: boolean
  // The preset colours offered as swatches.
  swatches: string[]
  // The tag being edited, or null for a new one.
  tag_id: string | null
  tags: Tag[]
  groups: TagGroup[]
  tasks: Task[]
  relationships: TaskRelationship[]
  on_save: (name: string, rule: TagRule | null, color: string | null, icon: string | null, shows_on_rows: boolean) => void
  on_close: () => void
}

// Names a tag, gives it a colour and an icon and, for a rule tag, lists the conditions a task must meet to carry it, with a live count of the tasks it covers.
export function FilterDialog({ heading, name, rule, color, icon, shows_on_rows, swatches, tag_id, tags, groups, tasks, relationships, on_save, on_close }: FilterDialogProps) {
  const [name_draft, set_name_draft] = useState(name)
  const [color_draft, set_color_draft] = useState(color)
  const [icon_draft, set_icon_draft] = useState(icon)
  const [shows_on_rows_draft, set_shows_on_rows_draft] = useState(shows_on_rows)
  const [rule_draft, set_rule_draft] = useState(rule ?? EMPTY_RULE)


  const is_rule = rule !== null
  // A rule cannot test for its own tag or the tags below it.
  const own_ids = tag_id ? subtree_ids(tag_id, tags) : new Set<string>()
  const condition_tags = tags.filter((tag) => !own_ids.has(tag.id))
  const hand_count = tag_id ? tasks.filter((task) => task.tag_ids.includes(tag_id)).length : 0
  const match_count = tasks.filter((task) => rule_matches(rule_draft, task, tasks, chain_tag_ids_of(task, tasks), tags)).length

  function change_condition(index: number, condition: RuleCondition): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.map((each, at) => (at === index ? condition : each)) })
  }

  function remove_condition(index: number): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.filter((_each, at) => at !== index) })
  }

  function save(event: FormEvent): void {
    event.preventDefault()
    const trimmed_name = name_draft.trim()
    if (!trimmed_name) return
    on_save(trimmed_name, is_rule ? rule_draft : null, color_draft, icon_draft, shows_on_rows_draft)
    on_close()
  }

  function count_text(): string | null {
    if (is_rule) return match_count === 1 ? '1 task matches' : `${match_count} tasks match`
    if (!tag_id) return null
    return hand_count === 1 ? '1 task has this tag' : `${hand_count} tasks have this tag`
  }

  return (
    <Dialog
      title={heading}
      on_close={on_close}
      class_name={is_rule ? 'rule_dialog' : undefined}
      buttons={
        <>
          <span className="muted dialog_count">{count_text()}</span>
          <button type="button" onClick={on_close}>Cancel</button>
          <button type="submit" form={FORM_ID} className="accent solid" disabled={!name_draft.trim()}>Save</button>
        </>
      }
    >
      <form id={FORM_ID} className="dialog_form" onSubmit={save}>
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name_draft} onChange={(event) => set_name_draft(event.currentTarget.value)} placeholder="Completed routines" autoFocus />
        </label>

        <div className="field">
          <span className="field-label">Colour</span>
          <ColorPicker label="Colour" value={color_draft} swatches={swatches} on_change={set_color_draft} />
        </div>

        <div className="field">
          <span className="field-label">Icon</span>
          <EmojiField label="Icon" value={icon_draft} on_change={set_icon_draft} />
        </div>

        <label className="check">
          <input type="checkbox" checked={shows_on_rows_draft} onChange={(event) => set_shows_on_rows_draft(event.currentTarget.checked)} />
          Show on task rows
        </label>

        {is_rule && (
          <>
            <div className="rule_match">
              Tasks matching
              <select value={rule_draft.match} onChange={(event) => set_rule_draft({ ...rule_draft, match: event.currentTarget.value as TagRule['match'] })} aria-label="Match">
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              of these conditions
            </div>

            <ul className="rule_conditions">
              {rule_draft.conditions.map((condition, index) => (
                <ConditionRow
                  key={index}
                  condition={condition}
                  tags={condition_tags}
                  groups={groups}
                  tasks={tasks}
                  relationships={relationships}
                  on_change={(changed) => change_condition(index, changed)}
                  on_remove={() => remove_condition(index)}
                />
              ))}
            </ul>
            {rule_draft.conditions.length === 0 && <p className="setting-hint">With no conditions, every task matches.</p>}

            <button
              type="button"
              className="fit-content"
              onClick={() => set_rule_draft({ ...rule_draft, conditions: [...rule_draft.conditions, default_condition('status', condition_tags, groups)] })}
            >
              Add condition
            </button>
          </>
        )}
      </form>
    </Dialog>
  )
}
