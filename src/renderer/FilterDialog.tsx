import { useEffect, useRef, useState } from 'preact/hooks'

import type { DueCondition, RuleCondition, StartCondition, Tag, TagRule, Task } from '@shared/tasks'
import { CONDITION_CHOICES, default_condition, EMPTY_RULE, rule_matches, type ConditionKind } from './rules'
import { chain_tag_ids_of, subtree_ids, tag_path } from './views'

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

// A plain tag is given by hand; a rule tag applies itself.
const TYPE_CHOICES: { value: boolean; label: string }[] = [
  { value: false, label: 'Plain tag' },
  { value: true, label: 'Rule' }
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

function ConditionRow({ condition, tags, on_change, on_remove }: ConditionRowProps) {
  const plain_tags = tags.filter((tag) => !tag.rule)

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
        onChange={(event) => on_change(default_condition(event.currentTarget.value as ConditionKind, tags))}
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
// Filter dialog
// ============================================================================

interface FilterDialogProps {
  heading: string
  name: string
  rule: TagRule | null
  // The tag being edited, or null for a new one.
  tag_id: string | null
  tags: Tag[]
  tasks: Task[]
  on_save: (name: string, rule: TagRule | null) => void
  on_close: () => void
}

// Names a tag and picks whether it is given by hand or applies itself by a rule, with a live count of the tasks it covers.
export function FilterDialog({ heading, name, rule, tag_id, tags, tasks, on_save, on_close }: FilterDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [name_draft, set_name_draft] = useState(name)
  const [is_rule, set_is_rule] = useState(rule !== null)
  const [rule_draft, set_rule_draft] = useState(rule ?? EMPTY_RULE)

  useEffect(() => dialog_ref.current?.showModal(), [])

  // A rule cannot test for its own tag, and other rules can only test for plain tags.
  const own_ids = tag_id ? subtree_ids(tag_id, tags) : new Set<string>()
  const condition_tags = tags.filter((tag) => !own_ids.has(tag.id))
  const rules_using_tag = tag_id ? tags.filter((tag) => tag.rule?.conditions.some((condition) => condition.kind === 'tag' && condition.tag_id === tag_id)) : []
  const hand_count = tag_id ? tasks.filter((task) => task.tag_ids.includes(tag_id)).length : 0
  const match_count = tasks.filter((task) => rule_matches(rule_draft, task, chain_tag_ids_of(task, tasks), tags)).length
  const can_be_rule = rule !== null || rules_using_tag.length === 0

  function change_condition(index: number, condition: RuleCondition): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.map((each, at) => (at === index ? condition : each)) })
  }

  function remove_condition(index: number): void {
    set_rule_draft({ ...rule_draft, conditions: rule_draft.conditions.filter((_each, at) => at !== index) })
  }

  function save(event: Event): void {
    event.preventDefault()
    const trimmed_name = name_draft.trim()
    if (!trimmed_name) return
    on_save(trimmed_name, is_rule ? rule_draft : null)
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

        <div class="filter_type">
          <span class="sidebar_heading">Type</span>
          <div class="segmented_control" role="radiogroup" aria-label="Type">
            {TYPE_CHOICES.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={is_rule === value}
                class={is_rule === value ? 'is_selected' : ''}
                disabled={value && !can_be_rule}
                onClick={() => set_is_rule(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!can_be_rule && (
          <p class="setting_hint">
            Stays a plain tag while the rules of {rules_using_tag.map((tag) => tag.name).join(', ')} test for it.
          </p>
        )}
        {!is_rule && <p class="setting_hint">Given to tasks by hand, from their detail panel or by dragging them onto it.</p>}
        {is_rule && rule === null && hand_count > 0 && (
          <p class="setting_hint">Saving as a rule takes this tag off the {hand_count === 1 ? 'task' : `${hand_count} tasks`} given it by hand.</p>
        )}

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
                  on_change={(changed) => change_condition(index, changed)}
                  on_remove={() => remove_condition(index)}
                />
              ))}
            </ul>
            {rule_draft.conditions.length === 0 && <p class="setting_hint">With no conditions, every task matches.</p>}

            <button
              type="button"
              class="rule_add"
              onClick={() => set_rule_draft({ ...rule_draft, conditions: [...rule_draft.conditions, default_condition('status', condition_tags)] })}
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
