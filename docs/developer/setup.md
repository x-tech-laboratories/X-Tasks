---
title: Development setup
parent: Developer guide
nav_order: 1
---

# Development setup
{: .no_toc }

1. TOC
{:toc}

## Requirements

Node 24 or newer. On NixOS, the flake's shell provides Node and an Electron that runs there:

```sh
nix develop
npm install
```

## Commands

| Command                   | Does                                                             |
| :------------------------ | :--------------------------------------------------------------- |
| `npm run dev`             | Hot-reloading development build of the desktop app               |
| `npm run app`             | Builds once and launches the desktop app                         |
| `npm run build`           | Typechecks and makes a production build                          |
| `npm run typecheck`       | Typechecks the main process, the page and the tests              |
| `npm test`                | Runs the Vitest suite                                            |
| `npm run lint`            | Runs oxlint                                                      |
| `npm run build:server`    | Builds the web page and the web server                           |
| `npm run server -- …`     | Runs the built web server                                        |
| `npm run build:android`   | Builds the page for Android and copies it into `android/`        |
| `npm run seed`            | Remakes the development database with fresh dates                |
| `nix build`               | The packaged desktop app, in `./result/bin/x-tasks`              |
| `nix build .#server`      | The packaged server, in `./result/bin/x-tasks-server`            |

## Databases

{: .warning }
> `~/.config/x-tasks/tasks.db` is the live task list of whoever uses the app on that machine. Never point tests,
> demos or experiments at it.

The desktop app stores tasks and settings in an SQLite file, by default `~/.config/x-tasks/tasks.db` on Linux.
`X_TASKS_DB` chooses another file.

`npm run dev` and `npm run app` open **`dev-data/tasks.db`** instead: a database of example tasks, projects, habits
with a few weeks of history, and filters, dated around the day it was made. It is created on first run from
`src/dev/seed_database.ts` and is not kept in git. Electron's own profile for these runs lives in `dev-data/profile`
(`X_TASKS_USER_DATA` moves it), so they never touch `~/.config/x-tasks`.

```sh
npm run seed                                     # remake it from scratch, with fresh dates
X_TASKS_DB=/path/to/other.db npm run app         # open another database instead
npm run server -- --database dev-data/tasks.db   # serve it from the web server
```

The seeder refuses to write to `~/.config/x-tasks/tasks.db`. Add new example data to the lists in the seeder so every
checkout gets it.

Opening a database applies any pending [migrations](database.html) to it, so opening an older file with a newer build
upgrades it.
