---
title: Architecture
parent: Developer guide
nav_order: 2
---

# Architecture
{: .no_toc }

1. TOC
{:toc}

## Source layout

| Path                 | Holds                                                                                          |
| :------------------- | :--------------------------------------------------------------------------------------------- |
| `src/main`           | The Electron main process and the task database code shared with the server                    |
| `src/main/task_database.ts` | Schema migrations and every task, tag and group query, over a small SQL interface       |
| `src/main/sync_engine.ts`   | Change tracking and merging                                                             |
| `src/main/sync_client.ts`   | Syncs a device with the server                                                          |
| `src/main/task_versions.ts` | Task history: triggers, snapshots, pruning                                              |
| `src/main/mcp_server.ts`    | The MCP server for AI assistants                                                        |
| `src/server`         | The Fastify web server: `main.ts` starts it, `app.ts` builds the routes, `auth.ts` signs browsers in, `events.ts` tells open pages about changes |
| `src/preload`        | The Electron bridge that exposes `window.x_tasks` to the page                                  |
| `src/web`            | The React interface                                                                            |
| `src/web/web_bridge.ts` | The same bridge over HTTP, for browsers                                                     |
| `src/web/android`    | The Android app's WebAssembly database and bridge                                              |
| `src/web/syntax`     | The Plain, Todoist, GTG and Trilium quick-add and search syntaxes                              |
| `src/shared`         | Types and channel names used on both sides                                                     |
| `src/dev`            | The development database seeder                                                                |
| `android`            | The Capacitor Android project                                                                  |
| `nix`                | The NixOS module for the server                                                                |

## One page, three hosts

The React page never touches a database directly. It calls `window.x_tasks` (tasks) and `window.x_settings`
(settings), whose method lists live in `src/shared/bridges.ts`. Each host supplies those objects differently:

```
                 ┌────────────── React page (src/web) ──────────────┐
                 │        window.x_tasks · window.x_settings         │
                 └──────┬───────────────────┬────────────────────┬──┘
          Electron IPC  │        HTTP POST   │        in-process  │
                 ┌──────▼──────┐   ┌────────▼───────┐   ┌────────▼────────┐
                 │  preload +  │   │  x-tasks-server │   │ android_bridge  │
                 │ main process│   │    (Fastify)    │   │  + SQLite WASM  │
                 └──────┬──────┘   └────────┬───────┘   └────────┬────────┘
                        └────────── task_database.ts ────────────┘
```

- **Desktop:** `src/preload` forwards each call over Electron IPC to `src/main`, which runs it against `node:sqlite`.
- **Browser:** `src/web/web_bridge.ts` posts each call to the server's `api/<call>`, and listens on `api/events` for
  changes made elsewhere.
- **Android:** `src/web/android/android_bridge.ts` runs the same database code against SQLite compiled to
  WebAssembly, saved to the app's storage after each change.

Adding a database call means adding it to `TasksApi` in `src/shared/tasks.ts`, to `TASKS_METHODS` in
`src/shared/bridges.ts`, and implementing it in `task_database.ts`; every host picks it up from there.

## Data model

The types in `src/shared/tasks.ts` describe it:

- **Task** — title, notes (Markdown), done state and time, start and due dates (local times, `YYYY-MM-DD` or
  `YYYY-MM-DDTHH:MM`), an RFC 5545 recurrence rule, the My Day day, a `parent_id`, a position among its siblings, its
  tag ids, and its links to other tasks.
- **TagGroup** — a named sidebar section, either plain or rule (`is_rule`), optionally single-choice.
- **Tag** — belongs to a group, may have a `parent_id` for nesting, a colour, an icon, and, in a rule group, a
  `TagRule`.
- **TagRule** — `match: 'all' | 'any'` and a list of `RuleCondition`s.
- **Completion** — one tick of a task, kept for streaks and reports.

### One list, nested

There is a single `tasks` table. Nesting is a `parent_id` on each row with no depth limit, and ordering is a
`position` among siblings. The page builds the tree with the X-Libs tree helpers.

### Views are filters

A view never changes data; `task_is_in_view` in `src/web/views.ts` decides, for each task, whether it shows. Two rules
make nesting feel natural:

- A task's effective tags are its own **plus those of every ancestor** (`chain_tag_ids_of`).
- My Day and Upcoming include a task when **it or an ancestor** qualifies.

### Rule tags

A rule tag's membership is never stored. `rule_matches` and `condition_holds` in `src/web/rules.ts` evaluate the rule
against each task whenever it is needed, so a rule tag is always current. Conditions can only refer to plain tags and
plain groups, so rules never depend on other rules. Rule tags cannot be given by hand, from the page or through the
MCP server.

New databases get a `filters` rule group with `filter_actionable` and `filter_untagged`, created by a migration with
fixed ids so every device shares them.

## Settings

`src/shared/settings.ts` lists every setting with its type and default. Most settings are stored in the database and
synced; per-device ones (window layout, MCP, backups) are not.
