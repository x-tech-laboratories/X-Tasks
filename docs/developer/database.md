---
title: Database and migrations
parent: Developer guide
nav_order: 3
---

# Database and migrations
{: .no_toc }

1. TOC
{:toc}

## Storage

All data — tasks, tags, groups, completions, history, settings and sync state — lives in one SQLite file. The
desktop app and server use Node's built-in `node:sqlite`; Android uses `@sqlite.org/sqlite-wasm`. Both sit behind the
small interface in `src/main/sql_database.ts`, so `task_database.ts` runs unchanged on each.

The server notices writes from other programs by polling SQLite's `data_version` every second and tells open pages to
reload.

## Migrations

The schema is versioned with `PRAGMA user_version`. `SCHEMA_MIGRATIONS` in `src/main/task_database.ts` is an ordered
list; entry *n* upgrades a database from version *n* to *n + 1*, as SQL or as a function. Opening a database runs every
entry from its current version to the end.

To change the schema:

1. Append a new entry to `SCHEMA_MIGRATIONS`. Never edit or reorder an existing one: databases in the field have
   already run it.
2. Keep the migration safe to run on any older database, including one that is many versions behind.
3. Synced tables also need their columns known to the sync engine (see [Sync](sync.html)).
4. Add a test under `tests/` that opens an older database and checks the upgrade.

{: .note }
> Several branches may add migrations at the same time. Rebase onto the latest `main` before landing and move your
> entry to the end if another one landed first.

Before upgrading an older database, the desktop app, the server and the Android app save a backup of it, so a bad
migration can be undone.

## Backups

`src/main/database_backups.ts` writes backups with `VACUUM INTO`, which produces a complete, consistent copy while
the database is open. Backups are named by the time they were taken and marked as daily or by hand. Daily backups are
checked for every hour and pruned to the number the settings ask for.

Restoring first backs up the current data, so a restore can itself be undone, then resets sync so devices choose
again which copy to keep.

## History

`src/main/task_versions.ts` records task history. SQLite triggers note every task a write touches, cascades included;
after each change, one version per touched task is saved as a full snapshot, skipping tasks that ended up unchanged.
Versions that arrive by sync keep the id and time of the device that made them, so every device shows the same
history. Pruning deletes versions older than the cutoff but always keeps each task's newest one.
