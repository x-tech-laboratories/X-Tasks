import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

import type { FastifyInstance } from 'fastify'

import { CHANGED_EVENT, HELLO_EVENT } from '@shared/web_api'

// ============================================================================
// Change events
// ============================================================================

const HEARTBEAT_MS = 25 * 1000

// Every open page's event stream, by the client id it was given.
const event_streams = new Map<string, ServerResponse>()

function send_event(stream: ServerResponse, event: string, data: string): void {
  stream.write(`event: ${event}\ndata: ${data}\n\n`)
}

// The page that made a change already shows it, so only the others are told.
export function announce_change(except_client_id = ''): void {
  for (const [client_id, stream] of event_streams) if (client_id !== except_client_id) send_event(stream, CHANGED_EVENT, '')
}

// Each page keeps one server-sent event stream open and is told through it when the data changed.
export function register_events(app: FastifyInstance): void {
  app.get('/events', (request, reply) => {
    reply.hijack()
    const stream = reply.raw
    const client_id = randomUUID()
    stream.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    stream.write('retry: 3000\n\n')
    send_event(stream, HELLO_EVENT, client_id)
    event_streams.set(client_id, stream)

    // A comment now and then keeps proxies from closing a quiet stream.
    const heartbeat = setInterval(() => stream.write(': still here\n\n'), HEARTBEAT_MS)
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      event_streams.delete(client_id)
    })
  })

  // An open stream never ends by itself, so closing the app ends each one.
  app.addHook('onClose', async () => {
    for (const stream of event_streams.values()) stream.end()
    event_streams.clear()
  })
}
