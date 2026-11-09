---
title: Developer guide
nav_order: 3
has_children: true
permalink: /developer/
---

# Developer guide

This part of the documentation is for people who **build, host, extend or contribute to** X-Tasks. If you only want
to use the app, see the [user guide](../user/).

X-Tasks is written in TypeScript with React, built with Vite and electron-vite, and follows the X-Tech application
standard: shared widgets and helpers come from
[X-Libs](https://github.com/x-tech-laboratories/X-Libs) and styling from Halon. One React page runs in three hosts:

- **Electron** on the desktop, with SQLite through Node's built-in `node:sqlite`;
- a **Fastify web server** that serves the page to browsers;
- **Capacitor** on Android, with SQLite compiled to WebAssembly.

| Page                                            | Covers                                                          |
| :---------------------------------------------- | :-------------------------------------------------------------- |
| [Development setup](setup.html)                 | Building and running, the development database                  |
| [Architecture](architecture.html)               | Source layout, bridges, data model, how views and rules work    |
| [Database and migrations](database.html)        | Schema versions, adding a migration, backups                    |
| [Sync](sync.html)                               | The offline-first sync engine and protocol                      |
| [Web server](web-server.html)                   | Running and deploying `x-tasks-server`, its HTTP API            |
| [Android](android.html)                         | Building, signing and releasing the Android app                 |
| [Integrations](integrations.html)               | MCP server, task links, Trilium import, the Linux sidebar       |
| [Testing and contributing](contributing.html)   | Tests, CI, code style, these docs                               |
