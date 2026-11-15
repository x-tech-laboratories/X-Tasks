---
title: Developer guide
sidebar:
  order: 0
  label: Overview
---

This part of the documentation is for people who **build, host, extend or contribute to** X-Tasks. If you only want
to use the app, see the [user guide](/user/).

X-Tasks is written in TypeScript with React, built with Vite and electron-vite, and follows the X-Tech application
standard: shared widgets and helpers come from
[X-Libs](https://github.com/x-tech-laboratories/X-Libs) and styling from Halon. One React page runs in three hosts:

- **Electron** on the desktop, with SQLite through Node's built-in `node:sqlite`;
- a **Fastify web server** that serves the page to browsers;
- **Capacitor** on Android, with SQLite compiled to WebAssembly.

| Page                                            | Covers                                                          |
| :---------------------------------------------- | :-------------------------------------------------------------- |
| [Development setup](/developer/setup/)                 | Building and running, the development database                  |
| [Architecture](/developer/architecture/)               | Source layout, bridges, data model, how views and rules work    |
| [Database and migrations](/developer/database/)        | Schema versions, adding a migration, backups                    |
| [Sync](/developer/sync/)                               | The offline-first sync engine and protocol                      |
| [Web server](/developer/web-server/)                   | Running and deploying `x-tasks-server`, its HTTP API            |
| [Android](/developer/android/)                         | Building, signing and releasing the Android app                 |
| [Integrations](/developer/integrations/)               | MCP server, task links, Trilium import, the Linux sidebar       |
| [Testing and contributing](/developer/contributing/)   | Tests, CI, code style, these docs                               |
