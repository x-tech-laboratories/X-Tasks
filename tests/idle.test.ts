import { describe, expect, it } from 'vitest'

import { FRESH_IDLE_WATCH, step_idle_watch, type IdleWatch } from '../src/web/idle'

// ============================================================================
// Helpers
// ============================================================================

const MINUTE = 60_000
const POLL = 15_000
const THRESHOLD_SECONDS = 5 * 60

// Looks at each moment in turn with the idle seconds the computer reports then, and hands back every stretch away found.
function looks(samples: [minute: number, idle_seconds: number][]): { from: number; to: number }[] {
  let watch: IdleWatch = FRESH_IDLE_WATCH
  const spans: { from: number; to: number }[] = []
  for (const [minute, idle_seconds] of samples) {
    const step = step_idle_watch(watch, minute * MINUTE, idle_seconds, THRESHOLD_SECONDS, POLL)
    watch = step.watch
    if (step.away) spans.push({ from: step.away.from / MINUTE, to: step.away.to / MINUTE })
  }
  return spans
}

// ============================================================================
// Time away
// ============================================================================

describe('the idle watch', () => {
  it('finds nothing while someone keeps working', () => {
    expect(looks([[0, 0], [0.25, 10], [0.5, 3]])).toEqual([])
  })

  it('hands back the stretch from the last input to the first input after coming back', () => {
    expect(looks([[10, 0], [16, 360], [30, 1200], [31, 30]])).toEqual([{ from: 10, to: 30.5 }])
  })

  it('leaves out a pause shorter than the threshold', () => {
    expect(looks([[10, 0], [13, 180], [14, 0]])).toEqual([])
  })

  it('counts a gap between looks, as when the computer slept, as time away from the last look', () => {
    expect(looks([[10, 0], [70, 2]])).toEqual([{ from: 10, to: 69 + 58 / 60 }])
  })

  it('finds each stretch once, starting fresh after coming back', () => {
    expect(looks([[0, 0], [0.25, 15], [10, 600], [11, 0], [12, 0], [12.25, 15], [20, 480], [21, 0]])).toEqual([{ from: 0, to: 11 }, { from: 12, to: 21 }])
  })
})
