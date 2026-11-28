import { create_sync_peer, type SyncPeer } from '@x-tech-laboratories/x-libs/sync_peer'
import type { PeerStorage } from '@x-tech-laboratories/x-libs/sync_protocol'

import { open_database } from './task_database'
import { task_sync } from './task_sync'

// ============================================================================
// Sync peer
// ============================================================================

export interface TaskSyncPeerOptions {
  storage: PeerStorage
  // What the other devices list this one as, such as "X-Tasks on laptop".
  device_name: string
  // Runs whenever changes from elsewhere land in the database.
  on_remote_change: () => void
  // Where other devices reach this one; none when it only reaches out.
  addresses?: () => string[]
  // The platform's own fetch, when given.
  fetch?: typeof globalThis.fetch
}

// This copy of the tasks as one of the paired devices, on the platform's storage.
export function create_task_sync_peer(options: TaskSyncPeerOptions): SyncPeer {
  return create_sync_peer({ app: 'x-tasks', engine: task_sync, database: open_database, ...options })
}
