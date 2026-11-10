import { create_sync_client, type SyncClient, type SyncStorage } from '@x-tech-laboratories/x-libs/sync_client'

import { CHANGED_EVENT, CLIENT_ID_HEADER, EVENTS_PATH, HELLO_EVENT } from '@shared/web_api'
import { open_database } from './task_database'
import { task_sync } from './task_sync'

// ============================================================================
// Sync client
// ============================================================================

// A device's side of sync, on the platform's storage; the callback runs whenever changes from elsewhere land in the database.
export function create_task_sync_client(storage: SyncStorage, on_remote_change: () => void): SyncClient {
  return create_sync_client({
    engine: task_sync,
    database: open_database,
    storage,
    on_remote_change,
    paths: { events: EVENTS_PATH },
    hello_event: HELLO_EVENT,
    changed_event: CHANGED_EVENT,
    client_id_header: CLIENT_ID_HEADER,
    data_name: 'tasks'
  })
}
