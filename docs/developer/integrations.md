---
title: Integrations
parent: Developer guide
nav_order: 7
---

# Integrations
{: .no_toc }

1. TOC
{:toc}

## MCP server

`src/main/mcp_server.ts` serves a Streamable HTTP MCP endpoint, by default `http://127.0.0.1:3917/mcp`, when **Enable
MCP server** is on. It listens on loopback only.

| Tool           | Does                                                                                  |
| :------------- | :------------------------------------------------------------------------------------ |
| `list_tasks`   | Tasks with notes (Markdown), dates, recurrence, My Day day, parent and tags           |
| `list_tags`    | Tag groups, each with its tags; rule tags are marked and cannot be given by hand      |
| `add_task`     | Adds a task, or a subtask when `parent_id` is given                                   |
| `update_task`  | Changes a task; fields left out stay as they are                                      |
| `complete_task`| Completes a task and its subtasks; a repeating task moves to its next occurrence     |
| `reopen_task`  | Marks a completed task not done                                                       |
| `tag_task`     | Gives a tag; in a one-tag-per-task group it replaces the old one                      |
| `untag_task`   | Takes a tag off                                                                       |
| `link_tasks`   | Links two tasks by a relationship                                                     |
| `unlink_tasks` | Removes the link between two tasks                                                    |
| `remove_task`  | Deletes a task and all its subtasks                                                   |

Changes made through MCP are announced to the page, so it updates at once.

## Task links

The desktop app handles `x-tasks://task/<id>` links: **Copy link** in a task's menu makes one, and opening it brings
the app forward with that task's details open, or starts it. The Nix package's desktop entry registers the scheme.
Only the app on the default database takes links from later launches, so a run with `X_TASKS_DB` set never hands its
link to another window.

## Importing from Trilium

`scripts/import_trilium_note.mjs` copies Trilium task notes in through the MCP endpoint and Trilium's own MCP server.
Each note becomes a task with its content and attributes in the notes, its type, priority and area as tags, its dates
and repeat rule, and its checklist and child notes as subtasks.

```sh
TRILIUM_ETAPI_TOKEN=... node scripts/import_trilium_note.mjs             # paste note ids one at a time
TRILIUM_ETAPI_TOKEN=... node scripts/import_trilium_note.mjs --dry-run ID # show the tasks without adding them
```

A note whose title is already on the list is skipped, unless the existing task is empty, which is filled in instead.
`TRILIUM_MCP_URL` and `X_TASKS_MCP_URL` change the endpoints.

## Linux sidebar

The [linux-sidebar](https://github.com/BeatLink/linux-sidebar) `web` plugin can show the whole app in a docked strip:
set its address to the server with `?view=my_day`. The page then takes the sidebar's colours and font from the
`--sidebar-*` CSS variables the plugin provides, and below 700 pixels it uses the phone layout.

## Quick-add and search syntaxes

Each syntax in `src/web/syntax/` turns typed text into a new task's title, tags, dates and repeat, and a search into
one query that every syntax matches the same way (`matching.ts`). They share one reader for dates (`dates.ts`) and
repeats (`repeats.ts`). To add a syntax, implement the interface in `types.ts`, register it in `index.ts`, add its id
to `SyntaxId` in `src/shared/settings.ts`, and give it help examples, which the Syntax help dialog and Settings show.
