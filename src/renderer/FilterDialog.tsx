import { useEffect, useRef, useState } from 'preact/hooks'

import { EMPTY_RULE, type DueCondition, type RuleCondition, type StartCondition, type Tag, type TagGroup, type TagRule, type Task } from '@shared/tasks'
import { CONDITION_CHOICES, default_condition, rule_matches, type ConditionKind } from './rules'
import { chain_tag_ids_of, last_character, subtree_ids, tag_path } from './views'

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
  { value: 'none', label: 'is not set' }
]

// ============================================================================
// Condition row
// ============================================================================

interface ConditionRowProps {
  condition: RuleCondition
  tags: Tag[]
  groups: TagGroup[]
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
        class="rule_days"
        type="number"
        min="1"
        value={days}
        onInput={(event) => on_change(Math.max(1, Number(event.currentTarget.value) || 1))}
        aria-label="Days"
      />
      <span class="rule_unit">days</span>
    </>
  )
}

function ConditionRow({ condition, tags, groups, on_change, on_remove }: ConditionRowProps) {
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
      case 'title':
        return (
          <input
            class="rule_text"
            value={condition.text}
            onInput={(event) => on_change({ ...condition, text: event.currentTarget.value })}
            placeholder="Text"
            aria-label="Title text"
          />
        )
    }
  }

  return (
    <li class="rule_condition">
      <select
        value={condition.kind}
        onChange={(event) => on_change(default_condition(event.currentTarget.value as ConditionKind, tags, groups))}
        aria-label="Condition"
      >
        {CONDITION_CHOICES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
      </select>
      {controls()}
      <button type="button" class="remove_button" onClick={on_remove} aria-label="Remove condition">
        ×
      </button>
    </li>
  )
}

// ============================================================================
// Colour picker
// ============================================================================

// A row of swatches, a None choice, and the system colour chooser for any other colour.
function ColorPicker({ color, swatches, on_change }: { color: string | null; swatches: string[]; on_change: (color: string | null) => void }) {
  return (
    <div class="tag_color_picker" role="radiogroup" aria-label="Colour">
      <button
        type="button"
        class={color === null ? 'tag_color_swatch is_none is_chosen' : 'tag_color_swatch is_none'}
        onClick={() => on_change(null)}
        role="radio"
        aria-checked={color === null}
        aria-label="No colour"
        title="No colour"
      />
      {swatches.map((swatch) => (
        <button
          key={swatch}
          type="button"
          class={color === swatch ? 'tag_color_swatch is_chosen' : 'tag_color_swatch'}
          style={{ '--tag-color': swatch }}
          onClick={() => on_change(swatch)}
          role="radio"
          aria-checked={color === swatch}
          aria-label={swatch}
          title={swatch}
        />
      ))}
      <input
        type="color"
        class={color !== null && !swatches.includes(color) ? 'tag_color_custom is_chosen' : 'tag_color_custom'}
        value={color ?? '#888888'}
        onInput={(event) => on_change(event.currentTarget.value)}
        aria-label="Other colour"
        title="Other colour"
      />
    </div>
  )
}

// ============================================================================
// Filter dialog
// ============================================================================

interface FilterDialogProps {
  heading: string
  name: string
  // The tag's rule, or null for a plain tag, which is only named here.
  rule: TagRule | null
  color: string | null
  icon: string | null
  // The preset colours offered as swatches.
  swatches: string[]
  // The tag being edited, or null for a new one.
  tag_id: string | null
  tags: Tag[]
  groups: TagGroup[]
  tasks: Task[]
  on_save: (name: string, rule: TagRule | null, color: string | null, icon: string | null) => void
  on_close: () => void
}

// Names a tag, gives it a colour and an icon and, for a rule tag, lists the conditions a task must meet to carry it, with a live count of the tasks it covers.
export function FilterDialog({ heading, name, rule, color, icon, swatches, tag_id, tags, groups, tasks, on_save, on_close }: FilterDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [name_draft, set_name_draft] = useState(name)
  const [color_draft, set_color_draft] = useState(color)
  const [icon_draft, set_icon_draft] = useState(icon)
  const [rule_draft, set_rule_draft] = useState(rule ?? EMPTY_RULE)

  useEffect(() => dialog_ref.current?.showModal(), [])

  const is_rule = rule !== null
  // A rule cannot test for its own tag or the tags below it.
  const own_ids = tag_id ? subtree_ids(tag_id, tags) : new Set<string>()
  const condition_tags = tags.filter((tag) => !own_ids.has(tag.id))
  const hand_count = tag_id ? tasks.filter((task) => task.tag_ids.includes(tag_id)).length : 0
  const match_count = tasks.filter((task) => rule_matches(rule_draft, task, chain_tag_ids_of(task, tasks), tags)).length

  function change_condition(index: number, condition: RuleCondition): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.map((each, at) => (at === index ? condition : each)) })
  }

  function remove_condition(index: number): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.filter((_each, at) => at !== index) })
  }

  // Typing or pasting keeps only the newest character, so a new emoji replaces the old one.
  function change_icon(input: HTMLInputElement): void {
    const character = last_character(input.value)
    set_icon_draft(character)
    input.value = character ?? ''
  }

  function save(event: Event): void {
    event.preventDefault()
    const trimmed_name = name_draft.trim()
    if (!trimmed_name) return
    on_save(trimmed_name, is_rule ? rule_draft : null, color_draft, icon_draft)
    on_close()
  }

  function count_text(): string | null {
    if (is_rule) return match_count === 1 ? '1 task matches' : `${match_count} tasks match`
    if (!tag_id) return null
    return hand_count === 1 ? '1 task has this tag' : `${hand_count} tasks have this tag`
  }

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      class="recurrence_dialog rule_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <form onSubmit={save}>
        <h2 class="recurrence_dialog_heading">{heading}</h2>

        <label class="task_detail_field">
          <span class="sidebar_heading">Name</span>
          <input value={name_draft} onInput={(event) => set_name_draft(event.currentTarget.value)} placeholder="Completed routines" autofocus />
        </label>

        <div class="task_detail_field">
          <span class="sidebar_heading">Colour</span>
          <ColorPicker color={color_draft} swatches={swatches} on_change={set_color_draft} />
        </div>

        <label class="task_detail_field">
          <span class="sidebar_heading">Icon</span>
          <input
            class="tag_icon_input"
            value={icon_draft ?? ''}
            onInput={(event) => change_icon(event.currentTarget)}
            placeholder="Emoji"
          />
        </label>

        {is_rule && (
          <>
            <div class="rule_match">
              Tasks matching
              <select
                value={rule_draft.match}
                onChange={(event) => set_rule_draft({ ...rule_draft, match: event.currentTarget.value as TagRule['match'] })}
                aria-label="Match"
              >
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              of these conditions
            </div>

            <ul class="rule_conditions">
              {rule_draft.conditions.map((condition, index) => (
                <ConditionRow
                  key={index}
                  condition={condition}
                  tags={condition_tags}
                  groups={groups}
                  on_change={(changed) => change_condition(index, changed)}
                  on_remove={() => remove_condition(index)}
                />
              ))}
            </ul>
            {rule_draft.conditions.length === 0 && <p class="setting_hint">With no conditions, every task matches.</p>}

            <button
              type="button"
              class="rule_add"
              onClick={() => set_rule_draft({ ...rule_draft, conditions: [...rule_draft.conditions, default_condition('status', condition_tags, groups)] })}
            >
              Add condition
            </button>
          </>
        )}

        <footer class="recurrence_dialog_footer">
          <span class="rule_count">{count_text()}</span>
          <button type="button" onClick={on_close}>
            Cancel
          </button>
          <button type="submit" class="primary_button" disabled={!name_draft.trim()}>
            Save
          </button>
        </footer>
      </form>
    </dialog>
  )
}
