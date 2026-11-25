import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { respawn_unless_quitting } from '../src/main/daemon_respawn'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('respawn_unless_quitting', () => {
  it('starts the daemon again after a moment', async () => {
    const start = vi.fn(() => Promise.resolve())

    respawn_unless_quitting(() => false, start, () => undefined, 1000)
    expect(start).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)

    expect(start).toHaveBeenCalledOnce()
  })

  it('does nothing when the window is already quitting', async () => {
    const start = vi.fn(() => Promise.resolve())

    respawn_unless_quitting(() => true, start, () => undefined, 1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(start).not.toHaveBeenCalled()
  })

  it('does nothing when the window is told to quit while it waits', async () => {
    const start = vi.fn(() => Promise.resolve())
    let is_quitting = false

    respawn_unless_quitting(() => is_quitting, start, () => undefined, 1000)
    is_quitting = true
    await vi.advanceTimersByTimeAsync(1000)

    expect(start).not.toHaveBeenCalled()
  })

  it('hands on a failed start', async () => {
    const failure = new Error('no socket')
    const on_error = vi.fn()

    respawn_unless_quitting(() => false, () => Promise.reject(failure), on_error, 1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(on_error).toHaveBeenCalledWith(failure)
  })
})
