import { randomUUID } from 'node:crypto'

import type { SyncExchangeRequest, SyncExchangeResponse, SyncReplaceRequest, SyncReplaceResponse, SyncSnapshot } from '@shared/sync'
import { create_backup } from '../main/database_backups'
import { apply_changes, collect_changes_since, collect_snapshot, read_sync_state, replace_with_snapshot, write_sync_state } from '../main/sync_engine'
import { open_database } from '../main/task_database'

// ============================================================================
// Sync calls
// ============================================================================

// A device following data the server no longer has must choose again which copy to keep.
export class GenerationMismatch extends Error {}

export class BadSyncRequest extends Error {}

function is_change_list(value: unknown): boolean {
  return Array.isArray(value) && value.every((change) => typeof change === 'object' && change !== null && 'table' in change && 'key' in change)
}

// Takes a device's changes, then gives back everyone else's since its cursor; the second value says whether anything here changed.
export function exchange_changes(request: SyncExchangeRequest): [SyncExchangeResponse, boolean] {
  if (!is_change_list(request.changes)) throw new BadSyncRequest('changes must be a list of changes')
  const database = open_database()
  const { generation } = read_sync_state(database)
  if (request.generation !== generation) throw new GenerationMismatch(`the server's data is now generation ${generation}`)

  const applied = apply_changes(database, request.changes)
  const outgoing = collect_changes_since(database, request.cursor, request.site)
  return [{ generation, cursor: outgoing.up_to_seq, changes: outgoing.changes }, applied > 0]
}

export function read_snapshot(): SyncSnapshot {
  const database = open_database()
  const snapshot = collect_snapshot(database)
  return { generation: read_sync_state(database).generation, cursor: snapshot.up_to_seq, changes: snapshot.changes }
}

// The server's data is backed up, then swapped for the device's, which starts a new generation every other device must choose against.
export function replace_data(request: SyncReplaceRequest): SyncReplaceResponse {
  if (!is_change_list(request.changes)) throw new BadSyncRequest('changes must be a list of changes')
  const database = open_database()
  create_backup()
  replace_with_snapshot(database, request.changes)

  const generation = randomUUID()
  write_sync_state(database, { generation })
  return { generation, cursor: read_sync_state(database).last_seq }
}
