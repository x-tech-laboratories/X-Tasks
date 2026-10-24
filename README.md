# X-Tasks

A todo manager built with Electron, Preact and TypeScript.

## Development

```sh
nix develop      # node, and an Electron that runs on NixOS
npm install
npm run dev      # hot-reloading dev build
npm run app      # build once and launch
npm run build    # typecheck and production build
nix build        # the packaged app, in ./result/bin/x-tasks
```

Tasks are stored in an SQLite database at `~/.config/x-tasks/tasks.db` on Linux, using Electron's
built-in `node:sqlite`, together with the choices made on the Settings page. Set `X_TASKS_DB` to use a
different file.

## MCP server

Turn on **MCP server** in Settings to let AI assistants on this computer read and change tasks. It listens on
`http://127.0.0.1:3917/mcp` by default, as a Streamable HTTP endpoint; the port is set in Settings too.

```sh
claude mcp add --transport http x-tasks http://127.0.0.1:3917/mcp
```

It offers tools to list tasks and tags, add, update, complete, reopen, tag, untag and remove tasks.

## Layout

- `src/main` — the Electron main process and the task database
- `src/preload` — the bridge that exposes `window.x_tasks` to the page
- `src/renderer` — the Preact interface
- `src/shared` — types and channel names used by both sides

## License

GPL-3.0-or-later
