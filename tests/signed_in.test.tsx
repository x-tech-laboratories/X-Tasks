// @vitest-environment jsdom
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { SignedIn } from '../src/web/SignedIn.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  location.hash = ''
})

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

const me = { name: 'ada', role: 'admin', roles: ['user', 'admin'], access: null, via: 'session', read_only: false, totp_enabled: false, source: 'declared', has_password: true }

// ============================================================================
// Signing in
// ============================================================================

test('shows the sign-in form until the browser is signed in', async () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => (path === 'api/me' ? json({ error: 'Sign in first.' }, 401) : json({ app_name: 'X-Tasks', oidc: null }))))

  render(<SignedIn>{() => <p>tasks</p>}</SignedIn>)

  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
  expect(screen.queryByText('tasks')).toBeNull()
})

test('shows the tasks once signed in, and the account page at #/account', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(me)))

  render(<SignedIn>{(account) => <p>{`tasks for ${account.name}`}</p>}</SignedIn>)
  expect(await screen.findByText('tasks for ada')).toBeTruthy()

  location.hash = '#/account'
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy()
})
