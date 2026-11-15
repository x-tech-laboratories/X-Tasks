// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/settings.ts'
import { DateRangesEditor } from '../src/web/SettingsPage.tsx'

afterEach(cleanup)

// ============================================================================
// Editor
// ============================================================================

describe('DateRangesEditor', () => {
  test('a range picks before, after or between and the points it compares with', () => {
    const on_change = vi.fn()
    render(<DateRangesEditor ranges={DEFAULT_SETTINGS.date_ranges} on_change={on_change} />)

    const today = screen.getByDisplayValue('Today').closest('.date_range') as HTMLElement
    expect(within(today).getByRole('combobox', { name: 'From' })).toHaveProperty('value', 'start_of_this_day')
    expect(within(within(today).getByRole('combobox', { name: 'From' })).getByRole('option', { name: 'Start of tomorrow' })).toBeTruthy()

    fireEvent.change(within(today).getByRole('combobox', { name: 'Comparison' }), { target: { value: 'is_before' } })

    expect(on_change.mock.calls[0]![0][1]).toMatchObject({ id: 'today', comparison: 'is_before', to: 'end_of_this_day' })
  })

  test('only a between range shows both points and which ends count', () => {
    render(<DateRangesEditor ranges={DEFAULT_SETTINGS.date_ranges} on_change={() => {}} />)

    const later = screen.getByDisplayValue('Later').closest('.date_range') as HTMLElement
    const today = screen.getByDisplayValue('Today').closest('.date_range') as HTMLElement

    expect(within(later).queryByRole('combobox', { name: 'To' })).toBeNull()
    expect(within(later).queryByRole('combobox', { name: 'Ends' })).toBeNull()
    expect(within(today).getByRole('combobox', { name: 'Ends' })).toHaveProperty('value', '[]')
  })
})
