import { useState, type FormEvent } from 'react'

import { Segmented } from '@x-tech-laboratories/x-libs/web/react/controls'
import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import type { Tag, TagGroup, Task } from '@shared/tasks'

// ============================================================================
// Choices
// ============================================================================

// A plain group's tags are given by hand; a rule group's tags apply themselves.
const TYPE_CHOICES: { value: 'plain' | 'rule'; label: string }[] = [
  { value: 'plain', label: 'Plain tags' },
  { value: 'rule', label: 'Rule tags' }
]

const FORM_ID = 'group_dialog_form'

// ============================================================================
// Group dialog
// ============================================================================

interface GroupDialogProps {
  heading: string
  // The group being edited, or null for a new one.
  group: TagGroup | null
  tags: Tag[]
  tasks: Task[]
  on_save: (name: string, is_rule: boolean, is_single_choice: boolean) => void
  on_close: () => void
}

// Names a filter group and picks whether its tags are given by hand or apply themselves by rules.
export function GroupDialog({ heading, group, tags, tasks, on_save, on_close }: GroupDialogProps) {
  const [name_draft, set_name_draft] = useState(group?.name ?? '')
  const [is_rule_draft, set_is_rule_draft] = useState(group?.is_rule ?? false)
  const [is_single_choice_draft, set_is_single_choice_draft] = useState(group?.is_single_choice ?? false)

  const group_tags = group ? tags.filter((tag) => tag.group_id === group.id) : []
  const group_tag_ids = new Set(group_tags.map((tag) => tag.id))
  const tagged_count = tasks.filter((task) => task.tag_ids.some((tag_id) => group_tag_ids.has(tag_id))).length
  const rule_count = group_tags.filter((tag) => tag.rule).length
  const is_changing_type = group !== null && group.is_rule !== is_rule_draft

  function save(event: FormEvent): void {
    event.preventDefault()
    const trimmed_name = name_draft.trim()
    if (!trimmed_name) return
    on_save(trimmed_name, is_rule_draft, is_single_choice_draft && !is_rule_draft)
    on_close()
  }

  // What switching the type does to the tags already in the group.
  function change_warning(): string | null {
    if (!is_changing_type) return null
    if (is_rule_draft) {
      const untagged = tagged_count > 0 ? ` and leave the ${tagged_count === 1 ? 'task' : `${tagged_count} tasks`} given them by hand` : ''
      return group_tags.length > 0 ? `Its tags become rules with no conditions, matching every task until you give them some${untagged}.` : null
    }
    return rule_count > 0 ? 'Its tags lose their rules and start on no tasks.' : null
  }

  const warning = change_warning()

  return (
    <Dialog
      title={heading}
      class_name="group_dialog"
      on_close={on_close}
      buttons={
        <>
          <button type="button" onClick={on_close}>Cancel</button>
          <button type="submit" form={FORM_ID} className="accent solid" disabled={!name_draft.trim()}>Save</button>
        </>
      }
    >
      <form id={FORM_ID} className="dialog_form" onSubmit={save}>
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name_draft} onChange={(event) => set_name_draft(event.currentTarget.value)} placeholder="Context" autoFocus />
        </label>

        <div className="field">
          <span className="field-label">Type</span>
          <Segmented label="Type" choices={TYPE_CHOICES} value={is_rule_draft ? 'rule' : 'plain'} on_change={(value) => set_is_rule_draft(value === 'rule')} />
        </div>

        <p className="setting-hint">
          {is_rule_draft
            ? 'Each tag applies itself to every task its rule matches, such as Overdue or Completed routines.'
            : 'Tags are given to tasks by hand, from their detail panel or by dragging them onto a tag.'}
        </p>
        {warning && <p className="setting-hint tone-warn">{warning}</p>}

        {/* Rules can match a task several times over, so only a plain group can limit a task to one tag. */}
        {!is_rule_draft && (
          <label className="check">
            <input type="checkbox" checked={is_single_choice_draft} onChange={(event) => set_is_single_choice_draft(event.currentTarget.checked)} />
            <span className="setting-text">
              <span className="setting-label">One tag per task</span>
              <span className="setting-hint">Giving a task another tag from this group replaces the one it had. Tasks already holding several keep them.</span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  )
}
