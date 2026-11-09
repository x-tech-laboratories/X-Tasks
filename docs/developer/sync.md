---
title: Sync
parent: Developer guide
nav_order: 4
---

# Sync
{: .no_toc }

1. TOC
{:toc}

Each desktop and Android install owns a full database and syncs it with one `x-tasks-server`. The server is the hub;
devices never talk to each other.

## Cells

`src/main/sync_engine.ts` tracks every synced value as a **cell**: one column of one row, with the time it was last
written and the device that wrote it. A row's existence is a cell of its own. Every write to a synced table updates
its cells and bumps a sequence number.

When two devices change the same cell, the **newest write wins** on every device. Different cells never conflict, so
edits to different fields of the same task always merge. Batches are applied parents first: groups before their tags,
tasks before their tags and completions.

## Protocol

The server answers under `api/sync/`:

| Call              | Method | Does                                                                                       |
| :---------------- | :----- | :----------------------------------------------------------------------------------------- |
| `snapshot`        | GET    | Every cell the server holds, with its generation and cursor                                 |
| `exchange`        | POST   | The device sends its changes since its last sync and receives the server's since its cursor |
| `replace`         | POST   | Replaces the server's data with the device's (the "send my tasks" choice)                   |

The **generation** changes whenever a server's data is replaced or restored. A device that sees a new generation stops
syncing until its user chooses again whose tasks to keep; either choice backs up the data it replaces first.

`src/main/sync_client.ts` drives the device side: it exchanges changes on a timer and after local writes, keeps
working offline and catches up when the server is reachable again. It also listens on the server's event stream, so it
pulls other devices' changes promptly. The server address and token are kept in `sync.json` beside the database.

## What is synced

Tasks, tags, groups, links, completions, task history and most settings. Window layout, the MCP endpoint and backup
settings stay with each device.

A subtask added on one device under a task deleted on another is removed too, so no orphans survive a merge.
