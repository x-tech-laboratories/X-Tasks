import { useEffect, useState, type ReactNode } from 'react'

import { create_accounts_client } from '@x-tech-laboratories/x-libs/web/accounts'
import { AccountView, UsersView } from '@x-tech-laboratories/x-libs/web/react/accounts'
import { Shell } from '@x-tech-laboratories/x-libs/web/react/shell'
import { SignInForm, use_account } from '@x-tech-laboratories/x-libs/web/react/sign_in'
import { theme_choice } from '@x-tech-laboratories/x-libs/web/theme'

import app_icon from '../../resources/icon.svg?no-inline'

// ============================================================================
// Signing in
// ============================================================================

// Who the page is signed in as, for the top bar.
export interface SignedInAccount {
  name: string
  sign_out: () => void
}

// Relative, so a server behind a proxy under a folder keeps it.
const accounts = create_accounts_client({ base: 'api' })

const theme = theme_choice('x-tasks-account-theme')

// The address's hash, which opens the account pages over the tasks.
function use_hash(): string {
  const [hash, set_hash] = useState(location.hash)
  useEffect(() => {
    const changed = () => set_hash(location.hash)
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  return hash
}

// A browser's page signs in to the server first, and shows Your account at #/account and the admin's Users at #/users.
export function SignedIn({ children }: { children: (account: SignedInAccount) => ReactNode }) {
  const { account, refresh, sign_out } = use_account(accounts)
  const hash = use_hash()

  if (account.state === 'checking') return null
  if (account.state === 'signed_out') {
    return (
      <Shell brand="X-Tasks" brand_icon={app_icon} theme={theme} user={null}>
        <SignInForm client={accounts} title="X-Tasks" icon={app_icon} on_signed_in={refresh} />
      </Shell>
    )
  }

  const me = account.me
  const signed_in = { name: me.name, sign_out: () => void sign_out() }
  const page = hash === '#/account' ? <AccountView client={accounts} /> : hash === '#/users' ? <UsersView client={accounts} me={me} /> : null
  if (page === null) return <>{children(signed_in)}</>
  const is_admin = me.role === me.roles.at(-1)
  return (
    <Shell
      brand="X-Tasks"
      brand_icon={app_icon}
      brand_href="#/"
      theme={theme}
      user={me.name}
      user_href="#/account"
      on_logout={signed_in.sign_out}
      sections={[{ id: 'tasks', label: 'Tasks', href: '#/' }, ...(is_admin ? [{ id: 'users', label: 'Users', href: '#/users' }] : [])]}
      active={hash.slice(2)}
    >
      {page}
    </Shell>
  )
}
