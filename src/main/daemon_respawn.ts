// ============================================================================
// Restarting a daemon that went away
// ============================================================================

// A daemon and its window are often stopped together, as when an upgrade restarts the app: the window hears its daemon
// go before it hears its own stop signal. So the window waits a moment before starting the daemon again, and does not
// if by then it is quitting itself, which would otherwise leave the old build's daemon running after the upgrade.
export const RESPAWN_DELAY_MS = 1000

export function respawn_unless_quitting(is_quitting: () => boolean, start: () => Promise<unknown>, on_error: (error: unknown) => void, delay_ms = RESPAWN_DELAY_MS): void {
  if (is_quitting()) return
  setTimeout(() => {
    if (!is_quitting()) start().catch(on_error)
  }, delay_ms)
}
