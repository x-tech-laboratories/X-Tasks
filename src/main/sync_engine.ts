import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { DEVICE_ONLY_SETTINGS } from '@shared/settings'
import type { SyncChange } from '@shared/sync'

// ============================================================================
// Synced tables
// ============================================================================

// Every value sync tracks is a cell: one column of one row, holding the time it was last written and the device that wrote it.
// The newest write of each cell wins on every device; a row's presence is a cell of its own, named EXISTS_COLUMN.
const EXISTS_COLUMN = '_exists'

interface SyncedTable {
  name: string
  // The columns whose values, joined with '/', name a row the same way on every device.
  key_columns: string[]
  // Columns kept only on this device, such as a local row number.
  local_columns: string[]
  // Rows kept only on this device, by key.
  local_keys: readonly string[]
}

// Parents come before children, so a batch adds groups before their tags and tasks before their tags and completions.
const SYNCED_TABLES: SyncedTable[] = [
  { name: 'tag_groups', key_columns: ['id'], local_columns: [], local_keys: [] },
  { name: 'tags', key_columns: ['id'], local_columns: [], local_keys: [] },
  { name: 'tasks', key_columns: ['id'], local_columns: [], local_keys: [] },
  { name: 'task_tags', key_columns: ['task_id', 'tag_id'], local_columns: [], local_keys: [] },
  { name: 'task_completions', key_columns: ['uid'], local_columns: ['id'], local_keys: [] },
  { name: 'settings', key_columns: ['key'], local_columns: [], local_keys: DEVICE_ONLY_SETTINGS }
]

const TABLES_BY_NAME = new Map(SYNCED_TABLES.map((table) => [table.name, table]))

function key_sql(table: SyncedTable, alias: string): string {
  return table.key_columns.map((column) => `${alias}."${column}"`).join(` || '/' || `)
}

// The condition a row must meet to sync, written against the given row alias.
function filter_sql(table: SyncedTable, alias: string): string {
  if (table.local_keys.length === 0) return '1'
  return `${key_sql(table, alias)} NOT IN (${table.local_keys.map((key) => `'${key}'`).join(', ')})`
}

function synced_columns(database: DatabaseSync, table: SyncedTable): string[] {
  const columns = database.prepare(`PRAGMA table_info("${table.name}")`).all() as { name: string }[]
  return columns.map((column) => column.name).filter((name) => !table.local_columns.includes(name))
}

// ============================================================================
// Triggers
// ============================================================================

const NOW_MS = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`
const TRIGGER_EVENTS = ['insert', 'update', 'delete'] as const

function trigger_name(table: SyncedTable, event: (typeof TRIGGER_EVENTS)[number]): string {
  return `sync_${table.name}_${event}`
}

// A local write is stamped with the current time, or just after the cell's last version when this device's clock is behind it.
// The condition limits the stamp to cells whose value really changed.
function stamp_cell_sql(table: SyncedTable, row_key: string, column: string, condition = '1'): string {
  const cell = `table_name = '${table.name}' AND row_key = ${row_key} AND column_name = '${column}'`
  return `UPDATE sync_state SET last_seq = last_seq + 1 WHERE ${condition};
    INSERT INTO sync_cells (table_name, row_key, column_name, ts, site, seq)
      SELECT '${table.name}', ${row_key}, '${column}',
        max(${NOW_MS}, coalesce((SELECT ts + 1 FROM sync_cells WHERE ${cell}), 0)),
        (SELECT site FROM sync_state), (SELECT last_seq FROM sync_state)
      WHERE ${condition}
    ON CONFLICT (table_name, row_key, column_name) DO UPDATE SET ts = excluded.ts, site = excluded.site, seq = excluded.seq;`
}

export function drop_sync_triggers(database: DatabaseSync): void {
  for (const table of SYNCED_TABLES) for (const event of TRIGGER_EVENTS) database.exec(`DROP TRIGGER IF EXISTS ${trigger_name(table, event)}`)
}

// Triggers stamp every change the app makes, whatever code makes it; changes arriving from another device are stamped by apply_changes instead.
export function install_sync_triggers(database: DatabaseSync): void {
  drop_sync_triggers(database)
  const is_local = '(SELECT is_applying FROM sync_state) = 0'

  for (const table of SYNCED_TABLES) {
    const columns = synced_columns(database, table)
    const new_key = key_sql(table, 'NEW')
    const old_key = key_sql(table, 'OLD')

    database.exec(`CREATE TRIGGER ${trigger_name(table, 'insert')} AFTER INSERT ON "${table.name}"
      WHEN ${is_local} AND ${filter_sql(table, 'NEW')}
      BEGIN ${[EXISTS_COLUMN, ...columns].map((column) => stamp_cell_sql(table, new_key, column)).join('\n')} END`)

    const update_steps = columns.map((column) => stamp_cell_sql(table, new_key, column, `OLD."${column}" IS NOT NEW."${column}"`))
    database.exec(`CREATE TRIGGER ${trigger_name(table, 'update')} AFTER UPDATE ON "${table.name}"
      WHEN ${is_local} AND ${filter_sql(table, 'NEW')}
      BEGIN ${update_steps.join('\n')} END`)

    database.exec(`CREATE TRIGGER ${trigger_name(table, 'delete')} AFTER DELETE ON "${table.name}"
      WHEN ${is_local} AND ${filter_sql(table, 'OLD')}
      BEGIN ${stamp_cell_sql(table, old_key, EXISTS_COLUMN)} END`)
  }

  backfill_cells(database)
}

// Rows written before sync existed, and columns added since, get a version older than any real write, so any edit made anywhere beats them.
function backfill_cells(database: DatabaseSync): void {
  for (const table of SYNCED_TABLES) {
    for (const column of [EXISTS_COLUMN, ...synced_columns(database, table)]) {
      database
        .prepare(
          `INSERT OR IGNORE INTO sync_cells (table_name, row_key, column_name, ts, site, seq)
           SELECT '${table.name}', ${key_sql(table, 'row')}, '${column}', 0, '', 0 FROM "${table.name}" AS row WHERE ${filter_sql(table, 'row')}`
        )
        .run()
    }
  }
}

// ============================================================================
// Sync state
// ============================================================================

export interface SyncStateRow {
  // This device's id, stamped on every change it makes.
  site: string
  // The id of the data this database serves, when it is the server.
  generation: string
  // The server data this device follows, or empty when it follows none.
  server_generation: string
  last_seq: number
  // This device's own changes up to here have reached the server.
  pushed_seq: number
  // The server's changes up to here have reached this device.
  pulled_seq: number
}

export function read_sync_state(database: DatabaseSync): SyncStateRow {
  return database.prepare('SELECT site, generation, server_generation, last_seq, pushed_seq, pulled_seq FROM sync_state').get() as unknown as SyncStateRow
}

export function write_sync_state(database: DatabaseSync, changes: Partial<Omit<SyncStateRow, 'last_seq'>>): void {
  for (const [column, value] of Object.entries(changes)) database.prepare(`UPDATE sync_state SET "${column}" = ?`).run(value as string | number)
}

// Whether this device has changes the server has not had yet.
export function has_unpushed_changes(database: DatabaseSync): boolean {
  const { site, pushed_seq } = read_sync_state(database)
  return database.prepare('SELECT 1 FROM sync_cells WHERE seq > ? AND site = ? LIMIT 1').get(pushed_seq, site) !== undefined
}

// A restored backup is no longer the data the server and other devices have seen, so this database starts a new generation and follows no server.
export function forget_sync_history(database: DatabaseSync): void {
  write_sync_state(database, { generation: randomUUID(), server_generation: '' })
}

// ============================================================================
// Reading changes
// ============================================================================

interface CellRow {
  table_name: string
  row_key: string
  column_name: string
  ts: number
  site: string
}

function read_row(database: DatabaseSync, table: SyncedTable, row_key: string): Record<string, unknown> | undefined {
  return database.prepare(`SELECT * FROM "${table.name}" AS row WHERE ${key_sql(table, 'row')} = ? AND ${filter_sql(table, 'row')}`).get(row_key) as
    | Record<string, unknown>
    | undefined
}

// Values are read as they are now; a row since removed sends only that it is gone.
function cells_to_changes(database: DatabaseSync, cells: CellRow[]): SyncChange[] {
  const rows = new Map<string, Record<string, unknown> | undefined>()
  const changes: SyncChange[] = []

  for (const cell of cells) {
    const table = TABLES_BY_NAME.get(cell.table_name)
    if (!table) continue
    const row_id = `${cell.table_name}\u0000${cell.row_key}`
    if (!rows.has(row_id)) rows.set(row_id, read_row(database, table, cell.row_key))
    const row = rows.get(row_id)

    const base = { table: cell.table_name, key: cell.row_key, column: cell.column_name, ts: cell.ts, site: cell.site }
    if (cell.column_name === EXISTS_COLUMN) changes.push({ ...base, value: row ? 1 : 0 })
    else if (row && cell.column_name in row) changes.push({ ...base, value: row[cell.column_name] })
  }
  return changes
}

// This device's own changes the server has not had yet, and the counter they were read at.
export function collect_unpushed_changes(database: DatabaseSync): { changes: SyncChange[]; up_to_seq: number } {
  const { site, pushed_seq, last_seq } = read_sync_state(database)
  const cells = database
    .prepare('SELECT table_name, row_key, column_name, ts, site FROM sync_cells WHERE seq > ? AND seq <= ? AND site = ? ORDER BY seq')
    .all(pushed_seq, last_seq, site) as unknown as CellRow[]
  return { changes: cells_to_changes(database, cells), up_to_seq: last_seq }
}

// Every change after the cursor that another device should hear about, leaving out the ones it made itself.
export function collect_changes_since(database: DatabaseSync, cursor: number, except_site: string): { changes: SyncChange[]; up_to_seq: number } {
  const { last_seq } = read_sync_state(database)
  const cells = database
    .prepare('SELECT table_name, row_key, column_name, ts, site FROM sync_cells WHERE seq > ? AND seq <= ? AND site != ? ORDER BY seq')
    .all(cursor, last_seq, except_site) as unknown as CellRow[]
  return { changes: cells_to_changes(database, cells), up_to_seq: last_seq }
}

// Every row there is now, with its versions, enough to rebuild the data elsewhere.
export function collect_snapshot(database: DatabaseSync): { changes: SyncChange[]; up_to_seq: number } {
  const { last_seq } = read_sync_state(database)
  const changes: SyncChange[] = []

  for (const table of SYNCED_TABLES) {
    const cells = database
      .prepare(
        `SELECT table_name, row_key, column_name, ts, site FROM sync_cells
         WHERE table_name = ? AND row_key IN (SELECT ${key_sql(table, 'row')} FROM "${table.name}" AS row WHERE ${filter_sql(table, 'row')})`
      )
      .all(table.name) as unknown as CellRow[]
    changes.push(...cells_to_changes(database, cells))
  }
  return { changes, up_to_seq: last_seq }
}

// ============================================================================
// Applying changes
// ============================================================================

function is_newer(change: { ts: number; site: string }, current: { ts: number; site: string } | undefined): boolean {
  return !current || change.ts > current.ts || (change.ts === current.ts && change.site > current.site)
}

function record_cell(database: DatabaseSync, change: SyncChange): void {
  database.exec('UPDATE sync_state SET last_seq = last_seq + 1')
  database
    .prepare(
      `INSERT INTO sync_cells (table_name, row_key, column_name, ts, site, seq) VALUES (?, ?, ?, ?, ?, (SELECT last_seq FROM sync_state))
       ON CONFLICT (table_name, row_key, column_name) DO UPDATE SET ts = excluded.ts, site = excluded.site, seq = excluded.seq`
    )
    .run(change.table, change.key, change.column, change.ts, change.site)
}

type SqlValue = string | number | bigint | null

// Changes from another device for one row: whether it should exist, then each value newer than this device's.
function apply_row_changes(database: DatabaseSync, table: SyncedTable, known_columns: string[], row_key: string, changes: SyncChange[]): number {
  const current_cells = new Map(
    (database.prepare('SELECT column_name, ts, site FROM sync_cells WHERE table_name = ? AND row_key = ?').all(table.name, row_key) as unknown as CellRow[]).map(
      (cell) => [cell.column_name, cell]
    )
  )
  const where_row = `${key_sql(table, 'row')} = ? AND ${filter_sql(table, 'row')}`
  let exists = database.prepare(`SELECT 1 FROM "${table.name}" AS row WHERE ${where_row}`).get(row_key) !== undefined
  let applied = 0

  const exists_change = changes.find((change) => change.column === EXISTS_COLUMN)
  if (exists_change && is_newer(exists_change, current_cells.get(EXISTS_COLUMN))) {
    record_cell(database, exists_change)
    applied += 1
    if (exists_change.value === 1 && !exists) {
      const values = changes.filter((change) => change.column !== EXISTS_COLUMN && known_columns.includes(change.column))
      database
        .prepare(`INSERT INTO "${table.name}" (${values.map((change) => `"${change.column}"`).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`)
        .run(...values.map((change) => change.value as SqlValue))
      exists = true
    }
    if (exists_change.value === 0 && exists) {
      database.prepare(`DELETE FROM "${table.name}" WHERE rowid IN (SELECT rowid FROM "${table.name}" AS row WHERE ${where_row})`).run(row_key)
      exists = false
    }
  }

  for (const change of changes) {
    if (change.column === EXISTS_COLUMN || !known_columns.includes(change.column) || !is_newer(change, current_cells.get(change.column))) continue
    record_cell(database, change)
    applied += 1
    if (exists) {
      database
        .prepare(`UPDATE "${table.name}" SET "${change.column}" = ? WHERE rowid IN (SELECT rowid FROM "${table.name}" AS row WHERE ${where_row})`)
        .run(change.value as SqlValue, row_key)
    }
  }
  return applied
}

// Rows left pointing at something another device removed, such as a subtask added under a task deleted elsewhere, go too.
// Every device removes the same ones, so all of them end up alike without telling each other.
function remove_orphans(database: DatabaseSync): void {
  for (;;) {
    const orphans = database.prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number }[]
    if (orphans.length === 0) return
    for (const orphan of orphans) database.prepare(`DELETE FROM "${orphan.table}" WHERE rowid = ?`).run(orphan.rowid)
  }
}

function in_sync_transaction<Result>(database: DatabaseSync, work: () => Result): Result {
  database.exec('BEGIN')
  try {
    database.exec('UPDATE sync_state SET is_applying = 1')
    database.exec('PRAGMA defer_foreign_keys = ON')
    const result = work()
    remove_orphans(database)
    database.exec('UPDATE sync_state SET is_applying = 0')
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function apply_each_row(database: DatabaseSync, changes: SyncChange[]): number {
  const rows = new Map<string, { table: SyncedTable; key: string; changes: SyncChange[] }>()
  for (const change of changes) {
    const table = TABLES_BY_NAME.get(change.table)
    if (!table || table.local_keys.includes(change.key)) continue
    const row_id = `${change.table}\u0000${change.key}`
    const row = rows.get(row_id) ?? { table, key: change.key, changes: [] }
    row.changes.push(change)
    rows.set(row_id, row)
  }

  const ordered_rows = [...rows.values()].sort((first, second) => SYNCED_TABLES.indexOf(first.table) - SYNCED_TABLES.indexOf(second.table))
  const known_columns = new Map(SYNCED_TABLES.map((table) => [table, synced_columns(database, table)]))
  let applied = 0
  for (const row of ordered_rows) applied += apply_row_changes(database, row.table, known_columns.get(row.table)!, row.key, row.changes)
  return applied
}

// Applies changes from another device as one transaction, and returns how many were newer than what this device had.
export function apply_changes(database: DatabaseSync, changes: SyncChange[]): number {
  return in_sync_transaction(database, () => apply_each_row(database, changes))
}

// Swaps every synced row for another copy's data in one transaction; settings kept to this device stay.
export function replace_with_snapshot(database: DatabaseSync, changes: SyncChange[]): void {
  in_sync_transaction(database, () => {
    for (const table of [...SYNCED_TABLES].reverse()) {
      database.exec(`DELETE FROM "${table.name}" WHERE rowid IN (SELECT rowid FROM "${table.name}" AS row WHERE ${filter_sql(table, 'row')})`)
    }
    database.exec('DELETE FROM sync_cells')
    apply_each_row(database, changes)
  })
}
