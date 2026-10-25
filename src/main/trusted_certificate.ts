import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname, join } from 'node:path'
import tls, { type DetailedPeerCertificate } from 'node:tls'

import type { ServerCertificate, TrustedCertificate } from '@shared/settings'
import { task_database_path } from './task_database'

// ============================================================================
// Trusted authority
// ============================================================================

// The chosen authority lives beside the database, like the sync settings, so a scratch database never trusts the real one.
function certificate_path(): string {
  return join(dirname(task_database_path()), 'trusted-certificate.pem')
}

// OpenSSL lists the name parts one per line from the country down; this reads them from the common name up, as Android does.
function subject_of(certificate: X509Certificate): string {
  return certificate.subject.split('\n').reverse().join(', ')
}

// Reads a PEM certificate, throwing when the text is not one.
function parse_certificate(pem: string): X509Certificate {
  try {
    return new X509Certificate(pem)
  } catch {
    throw new Error('that is not a PEM certificate')
  }
}

function read_pem(): string {
  return existsSync(certificate_path()) ? readFileSync(certificate_path(), 'utf8') : ''
}

// Node's own requests trust only its built-in list, so the system's authorities and the chosen one are added to it.
export function apply_trusted_certificates(): void {
  const pem = read_pem()
  const chosen = pem ? [pem] : []
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system'), ...chosen])])
}

export function get_trusted_certificate(): TrustedCertificate {
  const pem = read_pem()
  return { pem, subject: pem ? subject_of(parse_certificate(pem)) : '' }
}

// An empty text forgets the authority, so only servers the system trusts are reached again.
export function set_trusted_certificate(pem: string): TrustedCertificate {
  const trimmed = pem.trim()
  if (trimmed === '') rmSync(certificate_path(), { force: true })
  else {
    parse_certificate(trimmed)
    writeFileSync(certificate_path(), `${trimmed}\n`)
  }
  apply_trusted_certificates()
  return get_trusted_certificate()
}

// ============================================================================
// Server inspection
// ============================================================================

const INSPECT_TIMEOUT_MS = 10 * 1000

// Only a chain that ends at an unknown authority can be fixed by trusting one; an expired or misnamed certificate cannot.
const UNKNOWN_AUTHORITY_ERRORS = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
])

// The last certificate the server sent, which is the root when it sends one.
function top_of_chain(certificate: DetailedPeerCertificate): DetailedPeerCertificate {
  let current = certificate
  while (current.issuerCertificate && current.issuerCertificate !== current && current.issuerCertificate.raw) current = current.issuerCertificate
  return current
}

// Connects without checking the certificate, only to read it; nothing is sent over the connection.
export function inspect_server_certificate(server_url: string): Promise<ServerCertificate | null> {
  const url = new URL(server_url)
  if (url.protocol !== 'https:') return Promise.resolve(null)

  return new Promise((resolve) => {
    const socket = tls.connect({ host: url.hostname, port: Number(url.port || 443), servername: isIP(url.hostname) ? undefined : url.hostname, rejectUnauthorized: false })
    socket.setTimeout(INSPECT_TIMEOUT_MS, () => socket.destroy())
    socket.once('error', () => resolve(null))
    socket.once('close', () => resolve(null))
    socket.once('secureConnect', () => {
      // Node types this as an Error but hands over the OpenSSL code as a plain string.
      const problem = String(socket.authorizationError ?? '')
      const chain = socket.getPeerCertificate(true)
      socket.destroy()
      if (socket.authorized || !UNKNOWN_AUTHORITY_ERRORS.has(problem) || !chain.raw) return resolve(null)
      const authority = new X509Certificate(top_of_chain(chain).raw)
      resolve({ pem: authority.toString().trim(), subject: subject_of(authority), fingerprint: authority.fingerprint256 })
    })
  })
}
