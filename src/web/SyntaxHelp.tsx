import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import type { MenuItem } from '@x-tech-laboratories/x-libs/web/react/menus'
import { relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { describe_recurrence } from '@shared/schedule'
import type { SyntaxId } from '@shared/settings'
import type { Tag } from '@shared/tasks'
import { SYNTAXES, syntax_by_id, type QuickAdd, type Syntax, type SyntaxExample } from './syntax'
import { TagChip } from './TagChip'

// ============================================================================
// Switching
// ============================================================================

// The multibar's syntax menu: a quick add syntax and a search syntax picked apart, and the help for both.
export function syntax_menu_items(
  quick_add_syntax: SyntaxId, search_syntax: SyntaxId, on_change: (key: 'quick_add_syntax' | 'search_syntax', id: SyntaxId) => void, on_open_help: () => void
): MenuItem[] {
  return [
    ...SYNTAXES.map((syntax) => ({ label: `Add with ${syntax.name}`, checked: syntax.id === quick_add_syntax, radio: true, run: () => on_change('quick_add_syntax', syntax.id) })),
    ...SYNTAXES.map((syntax, index) => ({
      label: `Search with ${syntax.name}`, checked: syntax.id === search_syntax, radio: true, separator_before: index === 0, run: () => on_change('search_syntax', syntax.id)
    })),
    { label: 'Syntax help…', separator_before: true, run: on_open_help }
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
      {added_tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
      {quick_add.start_at && <span className="due_label">Starts {relative_day_label(quick_add.start_at)}</span>}
      {quick_add.due_at && <span className="due_label">Due {relative_day_label(quick_add.due_at)}</span>}
      {quick_add.recurrence && <span className="due_label">↻ {describe_recurrence(quick_add)}</span>}
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
    <button type="button" className="add_task_row" onClick={on_add} onKeyDown={(event) => event.key === 'Escape' && on_cancel()}>
      <span className="add_task_plus" aria-hidden="true">+</span>
      <span>
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
    <div className="syntax_preview" aria-live="polite">
      {problems.map((problem) => (
        <span key={problem} className="chip tone-warn">{problem}</span>
      ))}
    </div>
  )
}

// ============================================================================
// Help
// ============================================================================

export function SyntaxExamples({ examples }: { examples: SyntaxExample[] }) {
  return (
    <dl className="facts facts-rows syntax_examples">
      {examples.map((example) => (
        <div key={example.text}>
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
    <section>
      <h3 className="settings-heading">
        {heading}: {syntax.name}
      </h3>
      <p className="setting-hint">{syntax.summary}</p>
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
  const quick_add = syntax_by_id(quick_add_syntax)
  const search = syntax_by_id(search_syntax)

  return (
    <Dialog title="Writing in the bar" on_close={on_close} wide buttons={<button type="button" className="accent solid" onClick={on_close}>Close</button>}>
      <p className="setting-hint">Typing searches as you go, and Enter adds what you typed as a task. Pick each syntax from the button beside the bar or in Settings.</p>
      <SyntaxSection syntax={quick_add} heading="Adding" examples={quick_add.quick_add_examples} />
      <SyntaxSection syntax={search} heading="Searching" examples={search.search_examples} />
    </Dialog>
  )
}
