import { useEffect, useRef } from 'preact/hooks'

import { describe_recurrence, task_date_label } from '@shared/schedule'
import type { SyntaxId } from '@shared/settings'
import type { Tag } from '@shared/tasks'
import type { MenuItem } from './ContextMenu'
import { SYNTAXES, syntax_by_id, type QuickAdd, type Syntax, type SyntaxExample } from './syntax'
import { tag_color_style, with_icon } from './views'

// ============================================================================
// Switching
// ============================================================================

// The multibar's syntax menu: a quick add syntax and a search syntax picked apart, and the help for both.
export function syntax_menu_items(
  quick_add_syntax: SyntaxId, search_syntax: SyntaxId, on_change: (key: 'quick_add_syntax' | 'search_syntax', id: SyntaxId) => void, on_open_help: () => void
): MenuItem[] {
  return [
    ...SYNTAXES.map((syntax) => ({ label: `Add with ${syntax.name}`, is_chosen: syntax.id === quick_add_syntax, on_select: () => on_change('quick_add_syntax', syntax.id) })),
    ...SYNTAXES.map((syntax) => ({ label: `Search with ${syntax.name}`, is_chosen: syntax.id === search_syntax, on_select: () => on_change('search_syntax', syntax.id) })),
    { label: 'Syntax help…', on_select: on_open_help }
  ]
}

// The button's name: one syntax when both match, or the quick add one, then the search one.
export function syntax_button_label(quick_add_syntax: SyntaxId, search_syntax: SyntaxId): string {
  const quick_add_name = syntax_by_id(quick_add_syntax).name
  const search_name = syntax_by_id(search_syntax).name
  return quick_add_name === search_name ? quick_add_name : `${quick_add_name} · ${search_name}`
}

// ============================================================================
// Add task row
// ============================================================================

// What a typed task would be given besides its title: the tags, dates and repeat the syntax read.
function QuickAddDetails({ quick_add, tags }: { quick_add: QuickAdd; tags: Tag[] }) {
  const added_tags = quick_add.tag_ids.map((tag_id) => tags.find((tag) => tag.id === tag_id)).filter((tag): tag is Tag => tag !== undefined)

  return (
    <>
      {added_tags.map((tag) => (
        <span key={tag.id} class={tag.color ? 'tag_chip is_rule has_color' : 'tag_chip is_rule'} style={tag_color_style(tag)}>
          {with_icon(tag, tag.name)}
        </span>
      ))}
      {quick_add.start_at && <span class="due_label">Starts {task_date_label(quick_add.start_at)}</span>}
      {quick_add.due_at && <span class="due_label">Due {task_date_label(quick_add.due_at)}</span>}
      {quick_add.recurrence && <span class="due_label">↻ {describe_recurrence(quick_add)}</span>}
    </>
  )
}

interface AddTaskRowProps {
  quick_add: QuickAdd
  tags: Tag[]
  on_add: () => void
  on_cancel: () => void
}

// A row that is not a task yet: pressing it adds what was typed, with the tags and dates the syntax read, and Down from the bar reaches it.
export function AddTaskRow({ quick_add, tags, on_add, on_cancel }: AddTaskRowProps) {
  return (
    <button
      type="button"
      class="add_task_row"
      onClick={on_add}
      onKeyDown={(event) => event.key === 'Escape' && on_cancel()}
    >
      <span class="add_task_plus" aria-hidden="true">+</span>
      <span class="add_task_label">
        Add task <strong>“{quick_add.title}”</strong>
      </span>
      <QuickAddDetails quick_add={quick_add} tags={tags} />
    </button>
  )
}

// ============================================================================
// Problems
// ============================================================================

// Shows under the multibar anything in the text that either syntax could not read.
export function SyntaxPreview({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null

  return (
    <div class="syntax_preview" aria-live="polite">
      {problems.map((problem) => (
        <span key={problem} class="syntax_problem">
          {problem}
        </span>
      ))}
    </div>
  )
}

// ============================================================================
// Help
// ============================================================================

export function SyntaxExamples({ examples }: { examples: SyntaxExample[] }) {
  return (
    <dl class="syntax_examples">
      {examples.map((example) => (
        <div key={example.text} class="syntax_example">
          <dt>
            <code>{example.text}</code>
          </dt>
          <dd>{example.meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

function SyntaxSection({ syntax, heading, examples }: { syntax: Syntax; heading: string; examples: SyntaxExample[] }) {
  return (
    <section class="syntax_help_section">
      <h3 class="sidebar_heading">
        {heading}: {syntax.name}
      </h3>
      <p class="setting_hint">{syntax.summary}</p>
      <SyntaxExamples examples={examples} />
    </section>
  )
}

interface SyntaxHelpDialogProps {
  quick_add_syntax: SyntaxId
  search_syntax: SyntaxId
  on_close: () => void
}

export function SyntaxHelpDialog({ quick_add_syntax, search_syntax, on_close }: SyntaxHelpDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  useEffect(() => dialog_ref.current?.showModal(), [])
  const quick_add = syntax_by_id(quick_add_syntax)
  const search = syntax_by_id(search_syntax)

  return (
    <dialog ref={dialog_ref} class="recurrence_dialog syntax_help_dialog" onClose={on_close}>
      <h2 class="recurrence_dialog_heading">Writing in the bar</h2>
      <p class="setting_hint">Typing searches as you go, and Enter adds what you typed as a task. Pick each syntax from the button beside the bar or in Settings.</p>
      <SyntaxSection syntax={quick_add} heading="Adding" examples={quick_add.quick_add_examples} />
      <SyntaxSection syntax={search} heading="Searching" examples={search.search_examples} />
      <footer class="recurrence_dialog_footer">
        <button type="button" class="primary_button" onClick={on_close}>
          Close
        </button>
      </footer>
    </dialog>
  )
}
