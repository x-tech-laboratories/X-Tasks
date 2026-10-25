// ============================================================================
// Changes
// ============================================================================

// One value of one row, with the version that decides which device's write wins: the later time, then the larger device id.
export interface SyncChange {
  table: string
  key: string
  column: string
  value: unknown
  ts: number
  site: string
}

// ============================================================================
// Server protocol
// ============================================================================

// A device names the server data it follows by generation; replacing or restoring the server's data starts a new one.
export interface SyncExchangeRequest {
  site: string
  generation: string
  // The server's change counter the device has seen up to.
  cursor: number
  changes: SyncChange[]
}

export interface SyncExchangeResponse {
  generation: string
  cursor: number
  changes: SyncChange[]
}

// Every row the server holds, with the counter it was read at.
export type SyncSnapshot = SyncExchangeResponse

export interface SyncReplaceRequest {
  changes: SyncChange[]
}

export interface SyncReplaceResponse {
  generation: string
  cursor: number
}

export const SYNC_EXCHANGE_PATH = 'api/sync/exchange'
export const SYNC_SNAPSHOT_PATH = 'api/sync/snapshot'
export const SYNC_REPLACE_PATH = 'api/sync/replace'

// ============================================================================
// Device status
// ============================================================================

// Which copy wins when a device first connects: the server's tasks replace this device's, or this device's replace the server's.
export type SyncDirection = 'download' | 'upload'

// Off with no server set; needs_setup when the server's data was replaced and the device must choose a direction again.
export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'needs_setup' | 'failed'

export interface SyncStatus {
  state: SyncState
  server_url: string
  // When the last exchange with the server finished, as an ISO time; empty if never.
  last_synced_at: string
  // How many rows this device changed that the server has not had yet.
  pending_changes: number
  error: string
}
