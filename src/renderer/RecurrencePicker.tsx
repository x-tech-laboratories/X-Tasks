import 'recurrence-input'
import type { HTMLAttributes } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { RecurrenceInputElement } from 'recurrence-input'

import { has_time } from '@shared/schedule'

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'recurrence-input': HTMLAttributes<RecurrenceInputElement> & {
        value?: string
        features?: string
        start?: string
        'time-mode'?: 'utc' | 'floating'
        'all-day'?: boolean
      }
    }
  }
}

// ============================================================================
// Recurrence picker
// ============================================================================

interface RecurrencePickerProps {
  recurrence: string
  anchor: string | null
  on_save: (recurrence: string) => void
  on_close: () => void
}

// The picker's form refuses to submit while the rule has a field it cannot read.
export function RecurrencePicker({ recurrence, anchor, on_save, on_close }: RecurrencePickerProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const input_ref = useRef<RecurrenceInputElement>(null)

  useEffect(() => dialog_ref.current?.showModal(), [])

  function save(event: Event): void {
    event.preventDefault()
    on_save(input_ref.current?.value ?? recurrence)
    on_close()
  }

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      class="recurrence_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <form onSubmit={save}>
        <h2 class="recurrence_dialog_heading">Repeat</h2>
        <recurrence-input
          ref={input_ref}
          value={recurrence}
          features="standard"
          time-mode="floating"
          all-day={anchor === null || !has_time(anchor)}
          start={anchor ?? undefined}
        />
        <footer class="recurrence_dialog_footer">
          <button type="button" onClick={on_close}>
            Cancel
          </button>
          <button type="submit" class="primary_button">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  )
}
