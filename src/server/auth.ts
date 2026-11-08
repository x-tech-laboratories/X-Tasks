import { createHmac, timingSafeEqual } from 'node:crypto'

import fastify_cookie from '@fastify/cookie'
import fastify_formbody from '@fastify/formbody'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { render_login_page } from './login_page.ts'

// ============================================================================
// Settings
// ============================================================================

const SESSION_COOKIE = 'x_tasks_session'
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60
const FAILED_LOGIN_DELAY_MS = 1000

// ============================================================================
// Sign-in checks
// ============================================================================

// The cookie holds a value derived from the token, so changing the token signs every browser out.
function session_value(access_token: string): string {
  return createHmac('sha256', access_token).update('x-tasks-session').digest('hex')
}

function same_text(first: string, second: string): boolean {
  const first_bytes = Buffer.from(first)
  const second_bytes = Buffer.from(second)
  return first_bytes.length === second_bytes.length && timingSafeEqual(first_bytes, second_bytes)
}

// A browser signs in with its cookie; other programs can send the token as a bearer header instead.
export function is_signed_in(request: FastifyRequest, access_token: string): boolean {
  if (access_token === '') return true
  const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
  if (bearer !== undefined) return same_text(bearer, access_token)
  return same_text(request.cookies[SESSION_COOKIE] ?? '', session_value(access_token))
}

// A proxy that ends TLS says so in a header, and the cookie is then kept to secure connections.
function is_secure(request: FastifyRequest): boolean {
  return request.headers['x-forwarded-proto'] === 'https' || 'encrypted' in request.raw.socket
}

function set_session_cookie(request: FastifyRequest, reply: FastifyReply, value: string, max_age_seconds: number): void {
  void reply.setCookie(SESSION_COOKIE, value, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: max_age_seconds, secure: is_secure(request) })
}

// ============================================================================
// Registration
// ============================================================================

// Signs browsers in and out, and turns away every other request that carries neither the cookie nor the token.
export async function register_auth(app: FastifyInstance, access_token: string): Promise<void> {
  await app.register(fastify_cookie)
  await app.register(fastify_formbody)

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? ''
    // The Android app's preflight checks carry no credentials, and the sign-in pages are open by nature.
    if (request.method === 'OPTIONS' || path === '/login' || path === '/logout') return
    if (is_signed_in(request, access_token)) return
    // A page load goes to the login page, while a call from a page already open gets a plain refusal it can act on.
    if (path.startsWith('/api/')) return reply.code(401).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('sign in first')
    return reply.redirect('login', 303)
  })

  app.get('/login', async (_request, reply) => reply.type('text/html; charset=utf-8').send(render_login_page(false)))

  app.post<{ Body: { token?: string } }>('/login', async (request, reply) => {
    const token = request.body?.token ?? ''
    if (access_token === '' || same_text(token, access_token)) {
      set_session_cookie(request, reply, session_value(access_token), SESSION_MAX_AGE_SECONDS)
      return reply.redirect('./', 303)
    }
    await new Promise((wait) => setTimeout(wait, FAILED_LOGIN_DELAY_MS))
    return reply.code(401).type('text/html; charset=utf-8').send(render_login_page(true))
  })

  app.get('/logout', async (request, reply) => {
    set_session_cookie(request, reply, '', 0)
    return reply.redirect('login', 303)
  })
}
