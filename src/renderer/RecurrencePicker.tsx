import 'recurrence-input'
import { useEffect, useRef, type FormEvent } from 'react'
import type { RecurrenceInputElement } from 'recurrence-input'

// ============================================================================
// Recurrence picker
// ============================================================================

interface RecurrencePickerProps {
  recurrence: string
  anchor: string | null
  on_save: (recurrence: string) => void
  on_close: () => void
}

// Hourly rules and set times stay available for a task without a time, which gets one when the rule is saved.
// The picker's form refuses to submit while the rule has a field it cannot read.
export function RecurrencePicker({ recurrence, anchor, on_save, on_close }: RecurrencePickerProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const input_ref = useRef<RecurrenceInputElement>(null)

  useEffect(() => dialog_ref.current?.showModal(), [])

  function save(event: FormEvent): void {
    event.preventDefault()
    on_save(input_ref.current?.value ?? recurrence)
    on_close()
  }

  // Escape closes only this dialog, not the task panel behind it.
  return (
    <dialog
      ref={dialog_ref}
      className="recurrence_dialog"
      onClose={on_close}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    >
      <form onSubmit={save}>
        <h2 className="recurrence_dialog_heading">Repeat</h2>
        <recurrence-input
          ref={input_ref}
          value={recurrence}
          features="standard"
          time-mode="floating"
          start={anchor ?? undefined}
        />
        <footer className="recurrence_dialog_footer">
          <button type="button" onClick={on_close}>
            Cancel
          </button>
          <button type="submit" className="primary_button">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  )
}
