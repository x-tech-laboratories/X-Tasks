import { Chip } from '@x-tech-laboratories/x-libs/web/react/badges'

import type { Tag } from '@shared/tasks'
import { with_icon } from './views'

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

// A tag as a chip in its own colour, dashed when a rule put it there, with a button to take it off when it can be.
export function TagChip({ tag, label = tag.name, title, on_remove }: TagChipProps) {
  return (
    <Chip class_name="tag_chip" title={title} color={tag.color} dashed={Boolean(tag.rule)} on_remove={tag.rule ? undefined : on_remove} remove_label={`Remove tag ${tag.name}`}>
      {with_icon(tag, label)}
    </Chip>
  )
}
