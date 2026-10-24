import sqlite3_init, { type Database, type SqlValue as WasmSqlValue } from '@sqlite.org/sqlite-wasm'

import type { SqlDatabase, SqlStatement, SqlValue } from '../../main/sql_database'

// ============================================================================
// Saved copies
// ============================================================================

// The database lives in memory and is saved whole to the app's IndexedDB, which Android keeps until the app's data is cleared.
const STORE_DATABASE = 'x-tasks'
const STORE_NAME = 'files'
export const DATABASE_FILE = 'tasks.db'
export const BEFORE_SYNC_FILE = 'tasks-before-sync.db'

function open_store(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORE_DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function read_file(name: string): Promise<Uint8Array | undefined> {
  const store = await open_store()
  return new Promise((resolve, reject) => {
    const request = store.transaction(STORE_NAME).objectStore(STORE_NAME).get(name)
    request.onsuccess = () => resolve(request.result as Uint8Array | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function write_file(name: string, bytes: Uint8Array): Promise<void> {
  const store = await open_store()
  return new Promise((resolve, reject) => {
    const transaction = store.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(bytes, name)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// ============================================================================
// Connection
// ============================================================================

function to_wasm_value(value: SqlValue): WasmSqlValue {
  return typeof value === 'bigint' ? Number(value) : value
}

// Runs one statement to the end, giving back every row as an object of column values.
function run_statement(database: Database, sql: string, params: SqlValue[]): Record<string, WasmSqlValue>[] {
  const statement = database.prepare(sql)
  try {
    if (params.length > 0) statement.bind(params.map(to_wasm_value))
    const rows: Record<string, WasmSqlValue>[] = []
    while (statement.step()) rows.push(statement.get({}))
    return rows
  } finally {
    statement.finalize()
  }
}

export interface WasmTaskDatabase {
  connection: SqlDatabase
  // Saves the database now, as when the app goes to the background.
  save_now: () => Promise<void>
  // The whole database as a file, for keeping a copy.
  export_bytes: () => Uint8Array
}

const SAVE_DELAY_MS = 300

// Opens the saved database, or a new one, and saves it shortly after every change.
export async function open_wasm_database(): Promise<WasmTaskDatabase> {
  const sqlite3 = await sqlite3_init()
  const database = new sqlite3.oo1.DB(':memory:')

  const saved = await read_file(DATABASE_FILE)
  if (saved) {
    const pointer = sqlite3.wasm.allocFromTypedArray(saved)
    const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
    database.checkRc(sqlite3.capi.sqlite3_deserialize(database.pointer!, 'main', pointer, saved.byteLength, saved.byteLength, flags))
  }

  const export_bytes = (): Uint8Array => sqlite3.capi.sqlite3_js_db_export(database.pointer!)
  let save_timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> = Promise.resolve()

  const save_now = (): Promise<void> => {
    clearTimeout(save_timer)
    save_timer = undefined
    saving = saving.then(() => write_file(DATABASE_FILE, export_bytes()))
    return saving
  }
  const save_soon = (): void => {
    save_timer ??= setTimeout(() => void save_now(), SAVE_DELAY_MS)
  }

  const prepare = (sql: string): SqlStatement => ({
    run: (...params) => {
      run_statement(database, sql, params)
      save_soon()
      return { changes: database.changes(), lastInsertRowid: sqlite3.capi.sqlite3_last_insert_rowid(database.pointer!) }
    },
    get: (...params) => run_statement(database, sql, params)[0],
    all: (...params) => run_statement(database, sql, params)
  })

  const connection: SqlDatabase = {
    exec: (sql) => {
      database.exec(sql)
      save_soon()
    },
    prepare,
    close: () => database.close()
  }

  return { connection, save_now, export_bytes }
}
