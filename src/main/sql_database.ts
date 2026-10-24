// ============================================================================
// SQL connection
// ============================================================================

export type SqlValue = string | number | bigint | null | Uint8Array

export interface SqlStatement {
  run: (...params: SqlValue[]) => { changes: number | bigint; lastInsertRowid: number | bigint }
  get: (...params: SqlValue[]) => unknown
  all: (...params: SqlValue[]) => unknown[]
}

// The part of a synchronous SQLite connection the task database uses, met by Node's node:sqlite and by SQLite compiled to WebAssembly.
export interface SqlDatabase {
  exec: (sql: string) => void
  prepare: (sql: string) => SqlStatement
  close: () => void
}
