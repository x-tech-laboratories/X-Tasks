import type { InputHTMLAttributes } from 'react'

// ============================================================================
// Fields
// ============================================================================

type CommitInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value: string | number
  on_commit: (event: { currentTarget: HTMLInputElement }) => void
}

// A field that saves once it is left or Enter is pressed, and shows the saved value again whenever that changes.
export function CommitInput({ value, on_commit, ...attributes }: CommitInputProps) {
  return (
    <input
      {...attributes}
      key={String(value)}
      defaultValue={value}
      onBlur={(event) => on_commit(event)}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  )
}
