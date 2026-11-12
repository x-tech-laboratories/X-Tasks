import 'recurrence-input'
import { useRef, type FormEvent } from 'react'
import type { RecurrenceInputElement } from 'recurrence-input'

import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'

// ============================================================================
// Recurrence picker
// ============================================================================

interface RecurrencePickerProps {
  recurrence: string
  anchor: string | null
  on_save: (recurrence: string) => void
  on_close: () => void
}

const FORM_ID = 'recurrence_picker_form'

// Hourly rules and set times stay available for a task without a time, which gets one when the rule is saved.
// The picker's form refuses to submit while the rule has a field it cannot read.
// The element shows its standard features by default; a features prop would crash, since React assigns it to the
// element's read-only features property instead of setting the attribute.
export function RecurrencePicker({ recurrence, anchor, on_save, on_close }: RecurrencePickerProps) {
  const input_ref = useRef<RecurrenceInputElement>(null)

  function save(event: FormEvent): void {
    event.preventDefault()
    on_save(input_ref.current?.value ?? recurrence)
    on_close()
  }

  return (
    <Dialog
      title="Repeat"
      class_name="recurrence_dialog"
      on_close={on_close}
      buttons={
        <>
          <button type="button" onClick={on_close}>Cancel</button>
          <button type="submit" form={FORM_ID} className="accent solid">Save</button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save}>
        <recurrence-input ref={input_ref} value={recurrence} time-mode="floating" start={anchor ?? undefined} />
      </form>
    </Dialog>
  )
}
