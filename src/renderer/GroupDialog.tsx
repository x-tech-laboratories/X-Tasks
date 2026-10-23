import { useEffect, useRef, useState } from 'preact/hooks'

import type { Tag, TagGroup, Task } from '@shared/tasks'

// ============================================================================
// Choices
// ============================================================================

// A plain group's tags are given by hand; a rule group's tags apply themselves.
const TYPE_CHOICES: { value: boolean; label: string }[] = [
  { value: false, label: 'Plain tags' },
  { value: true, label: 'Rule tags' }
]

// ============================================================================
// Group dialog
// ============================================================================

interface GroupDialogProps {
  heading: string
  // The group being edited, or null for a new one.
  group: TagGroup | null
  tags: Tag[]
  tasks: Task[]
  on_save: (name: string, is_rule: boolean) => void
  on_close: () => void
}

// Names a filter group and picks whether its tags are given by hand or apply themselves by rules.
export function GroupDialog({ heading, group, tags, tasks, on_save, on_close }: GroupDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [name_draft, set_name_draft] = useState(group?.name ?? '')
  const [is_rule_draft, set_is_rule_draft] = useState(group?.is_rule ?? false)

  useEffect(() => dialog_ref.current?.showModal(), [])

  const group_tags = group ? tags.filter((tag) => tag.group_id === group.id) : []
  const group_tag_ids = new Set(group_tags.map((tag) => tag.id))
  const tagged_count = tasks.filter((task) => task.tag_ids.some((tag_id) => group_tag_ids.has(tag_id))).length
  const rule_count = group_tags.filter((tag) => tag.rule).length
  const is_changing_type = group !== null && group.is_rule !== is_rule_draft

  function save(event: Event): void {
    event.preventDefault()
    const trimmed_name = name_draft.trim()
    if (!trimmed_name) return
    on_save(trimmed_name, is_rule_draft)
    on_close()
  }

  // What switching the type does to the tags already in the group.
  function change_warning(): string | null {
    if (!is_changing_type) return null
    if (is_rule_draft) {
      const untagged = tagged_count > 0 ? ` and leave the ${tagged_count === 1 ? 'task' : `${tagged_count} tasks`} given them by hand` : ''
      return group_tags.length > 0 ? `Its tags become rules with no conditions, matching every task until you give them some${untagged}.` : null
    }
    return rule_count > 0 ? `Its tags lose their rules and start on no tasks.` : null
  }

  const warning = change_warning()

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      class="recurrence_dialog group_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <form onSubmit={save}>
        <h2 class="recurrence_dialog_heading">{heading}</h2>

        <label class="task_detail_field">
          <span class="sidebar_heading">Name</span>
          <input value={name_draft} onInput={(event) => set_name_draft(event.currentTarget.value)} placeholder="Context" autofocus />
        </label>

        <div class="filter_type">
          <span class="sidebar_heading">Type</span>
          <div class="segmented_control" role="radiogroup" aria-label="Type">
            {TYPE_CHOICES.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={is_rule_draft === value}
                class={is_rule_draft === value ? 'is_selected' : ''}
                onClick={() => set_is_rule_draft(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p class="setting_hint">
          {is_rule_draft
            ? 'Each tag applies itself to every task its rule matches, such as Overdue or Completed routines.'
            : 'Tags are given to tasks by hand, from their detail panel or by dragging them onto a tag.'}
        </p>
        {warning && <p class="setting_hint group_warning">{warning}</p>}

        <footer class="recurrence_dialog_footer">
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
