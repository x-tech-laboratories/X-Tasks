// ============================================================================
// Back button
// ============================================================================

// Raised on the window when the phone's Back button is pressed; a page that closes something with it cancels the event.
export const BACK_EVENT = 'x-tasks-back'

// Asks the page to step back, and says whether anything was there to close.
export function request_back(): boolean {
  const event = new Event(BACK_EVENT, { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
