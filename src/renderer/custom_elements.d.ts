import type { HTMLAttributes, Ref } from 'react'
import type { RecurrenceInputElement } from 'recurrence-input'

// The page's own HTML elements, which React's element list does not name.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'recurrence-input': HTMLAttributes<RecurrenceInputElement> & {
        ref?: Ref<RecurrenceInputElement>
        value?: string
        features?: string
        start?: string
        'time-mode'?: 'utc' | 'floating'
        'all-day'?: boolean
      }
    }
  }
}
