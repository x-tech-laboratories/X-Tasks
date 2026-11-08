import { relative_day_label } from '@x-tech-laboratories/x-libs/dates'
import { describe_recurrence } from '@shared/schedule'
import type { Tag } from '@shared/tasks'
import { type QuickAdd, type SyntaxExample } from './syntax'
import { TagChip } from './TagChip'

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
        <span key={problem} className="syntax_problem">{problem}</span>
      ))}
    </div>
  )
}

// ============================================================================
// Help
// ============================================================================

export function SyntaxExamples({ examples }: { examples: SyntaxExample[] }) {
  return (
    <dl className="syntax_examples">
      {examples.map((example) => (
        <div key={example.text} className="syntax_example">
          <dt>
            <code>{example.text}</code>
          </dt>
          <dd>{example.meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
