// ============================================================================
// Time away
// ============================================================================

// What the watch has seen: when it last looked, and since when the computer has been left alone, if it has.
export interface IdleWatch {
  last_sample_at: number | null
  away_since: number | null
}

export const FRESH_IDLE_WATCH: IdleWatch = { last_sample_at: null, away_since: null }

// A stretch away from the computer, as times in milliseconds.
export interface AwaySpan {
  from: number
  to: number
}

// Takes one look at how long the computer has gone without input, and hands back the time away once someone comes back.
// A long gap between looks, as when the computer slept, counts as time away from the last look.
export function step_idle_watch(watch: IdleWatch, now: number, idle_seconds: number, threshold_seconds: number, poll_milliseconds: number): { watch: IdleWatch; away: AwaySpan | null } {
  const threshold_milliseconds = threshold_seconds * 1000
  const idle_since = now - idle_seconds * 1000
  let away_since = watch.away_since

  const missed_looks = watch.last_sample_at !== null && now - watch.last_sample_at >= Math.max(threshold_milliseconds, 2 * poll_milliseconds)
  if (missed_looks) away_since = Math.min(away_since ?? Infinity, watch.last_sample_at!)
  if (idle_seconds >= threshold_seconds) away_since = Math.min(away_since ?? Infinity, idle_since)

  const is_back = idle_seconds < threshold_seconds
  if (is_back && away_since !== null) {
    const span = { from: away_since, to: Math.max(away_since, idle_since) }
    return { watch: { last_sample_at: now, away_since: null }, away: span.to - span.from >= threshold_milliseconds ? span : null }
  }
  return { watch: { last_sample_at: now, away_since }, away: null }
}
