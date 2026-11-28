---
title: Sync
sidebar:
  order: 4
---

Each desktop daemon, Android install and `x-tasks-server` owns a full database and is a **peer** of the others. There is
no hub: every peer syncs with the peers it is paired with and passes on what it took from the others, so peers that
never reach each other still end up alike.

## Cells

X-Libs' `sync_engine`, set up in `src/shared/task_sync.ts`, tracks every synced value as a **cell**: one column of one row, with the time it was last
written and the device that wrote it. A row's existence is a cell of its own. Every write to a synced table updates
its cells and bumps a sequence number.

When two devices change the same cell, the **newest write wins** on every device. Different cells never conflict, so
edits to different fields of the same task always merge. Batches are applied parents first: groups before their tags,
tasks before their tags, completions and time entries.

## Peers

X-Libs' `sync_peer`, set up in `src/shared/task_sync_peer.ts`, runs in the desktop daemon, on the phone and in the server.
Two devices pair through a one-time code that carries the reachable one's address and public key; every call between
them is then sealed with both devices' keys (tweetnacl's box), so it needs no account or token. Each peer keeps a cursor
per paired device, exchanges changes on a timer and after local writes, and holds a waiting call open to hear of the
other's changes at once. The list of paired devices travels with each exchange, so devices are introduced to each other
and a removal reaches every one.

| Who answers         | Where                                   | Turned on by                                       |
| :------------------ | :-------------------------------------- | :------------------------------------------------- |
| `x-tasks-server`    | `api/sync/peer`, open without sign-in   | always; `X_TASKS_SYNC_ADDRESS` names its address    |
| The desktop daemon  | its own port, announced by mDNS         | **Let other devices connect** (`sync-listening.json`) |
| A phone             | nobody; it reaches out                  |                                                    |

The server's own pairing calls are at `api/sync_device/<call>`, which only an admin may make. Each device keeps its keys
and paired devices in `sync-peers.json` beside the database, or in local storage on a phone.

A restore runs `forget_history`: the copy starts a new generation and makes each paired device match it once, removing
what the backup did not have. The receiving device backs itself up first.

## What is synced

Tasks, tags, groups, links, completions, time entries, task history and most settings. Window layout, the MCP endpoint and backup
settings stay with each device.

A subtask added on one device under a task deleted on another is removed too, so no orphans survive a merge.
