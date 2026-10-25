import { useEffect, useRef, useState } from 'preact/hooks'

import type { ServerCertificate } from '@shared/settings'

// ============================================================================
// Watching sync
// ============================================================================

const SYNC_CHECK_MS = 3000

// The server address and error of a failed sync, or empty while sync works.
async function current_failure(): Promise<{ key: string; server_url: string }> {
  const status = await window.x_settings.get_sync_status()
  if (status.state !== 'offline' || !status.server_url) return { key: '', server_url: '' }
  return { key: `${status.server_url} ${status.error}`, server_url: status.server_url }
}

// Asks the user to trust the server's authority whenever sync fails because this device does not know it.
export function UntrustedCertificatePrompt() {
  const [offer, set_offer] = useState<{ certificate: ServerCertificate; server_url: string } | null>(null)
  const inspected_failure = useRef('')
  const declined = useRef(new Set<string>())

  useEffect(() => {
    if (window.x_settings.host === 'web') return
    let is_checking = false
    const check = async (): Promise<void> => {
      if (is_checking) return
      is_checking = true
      try {
        // Each failure is inspected once; it is looked at again only after sync recovers or fails differently.
        const failure = await current_failure()
        if (failure.key === inspected_failure.current) return
        inspected_failure.current = failure.key
        if (!failure.key) return
        const certificate = await window.x_settings.inspect_server_certificate(failure.server_url)
        if (certificate && !declined.current.has(certificate.fingerprint)) set_offer({ certificate, server_url: failure.server_url })
      } finally {
        is_checking = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), SYNC_CHECK_MS)
    return () => clearInterval(timer)
  }, [])

  if (!offer) return null

  return (
    <CertificateDialog
      certificate={offer.certificate}
      server_url={offer.server_url}
      on_close={(is_trusted) => {
        if (!is_trusted) declined.current.add(offer.certificate.fingerprint)
        set_offer(null)
      }}
    />
  )
}

// ============================================================================
// Certificate dialog
// ============================================================================

interface CertificateDialogProps {
  certificate: ServerCertificate
  server_url: string
  on_close: (is_trusted: boolean) => void
}

// Shows who the authority is and its fingerprint, so the user can check it before trusting it.
export function CertificateDialog({ certificate, server_url, on_close }: CertificateDialogProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null)
  const [error, set_error] = useState('')
  const [is_busy, set_is_busy] = useState(false)

  useEffect(() => dialog_ref.current?.showModal(), [])

  async function trust(event: Event): Promise<void> {
    event.preventDefault()
    set_is_busy(true)
    set_error('')
    try {
      await window.x_settings.set_trusted_certificate(certificate.pem)
      void window.x_settings.sync_now()
      on_close(true)
    } catch (caught) {
      set_error(caught instanceof Error ? caught.message : String(caught))
      set_is_busy(false)
    }
  }

  return (
    <dialog ref={dialog_ref} class="recurrence_dialog certificate_dialog" onClose={() => on_close(false)}>
      <form onSubmit={(event) => void trust(event)}>
        <h2 class="recurrence_dialog_heading">Trust this server's certificate?</h2>
        <p class="setting_hint">
          The sync server at {new URL(server_url).host} has a certificate from an authority this device does not know. If it is the authority you set up for
          your own server, trusting it lets sync connect.
        </p>

        <dl class="certificate_details">
          <dt class="sidebar_heading">Authority</dt>
          <dd>{certificate.subject}</dd>
          <dt class="sidebar_heading">SHA-256 fingerprint</dt>
          <dd class="setting_path">{certificate.fingerprint}</dd>
        </dl>

        <p class="setting_hint">
          Check the fingerprint against your authority's own copy first. A first connection is started again from Settings once the authority is trusted.
        </p>
        {error && <p class="setting_hint group_warning">{error}</p>}

        <footer class="recurrence_dialog_footer">
          <button type="button" onClick={() => on_close(false)}>
            Not now
          </button>
          <button type="submit" class="primary_button" disabled={is_busy}>
            Trust and sync
          </button>
        </footer>
      </form>
    </dialog>
  )
}
