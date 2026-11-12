import { useState, type FormEvent } from 'react'

import { Dialog } from '@x-tech-laboratories/x-libs/web/react/dialog'
import { RecurrenceField } from '@x-tech-laboratories/x-libs/web/react/recurrence'

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
export function RecurrencePicker({ recurrence, anchor, on_save, on_close }: RecurrencePickerProps) {
  const [rule, set_rule] = useState(recurrence)

  function save(event: FormEvent): void {
    event.preventDefault()
    on_save(rule)
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
        <RecurrenceField value={rule} on_change={set_rule} time_mode="floating" start={anchor} />
      </form>
    </Dialog>
  )
}
