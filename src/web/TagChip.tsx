import type { CSSProperties } from 'react'

import { cx } from '@x-tech-laboratories/x-libs/web/dom'

import type { Tag } from '@shared/tasks'
import { tag_color_style, with_icon } from './views'

// ============================================================================
// Tag chip
// ============================================================================

interface TagChipProps {
  tag: Tag
  // The text shown, such as the tag's whole path; its name when not given.
  label?: string
  title?: string
  // Shows a remove button, which a rule tag never gets.
  on_remove?: () => void
}

// A tag as a chip in its own colour, with a button to take it off when it can be.
export function TagChip({ tag, label = tag.name, title, on_remove }: TagChipProps) {
  const class_name = cx('chip', 'tag_chip', tag.color && 'has_color', tag.rule && 'is_rule')
  return (
    <span className={class_name} style={tag_color_style(tag) as CSSProperties | undefined} title={title}>
      {with_icon(tag, label)}
      {on_remove && !tag.rule && (
        <button type="button" className="icon" onClick={on_remove} aria-label={`Remove tag ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  )
}
