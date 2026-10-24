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

## Web server

`x-tasks-server` serves the same app to a browser, from a database of its own, so it can run on a
server and be used from any device. Pages that are open update by themselves when another one
changes something.

```sh
npm run build:server
X_TASKS_TOKEN_FILE=token.txt npm run server -- --database ./server-tasks.db --port 3918
nix build .#server   # the packaged server, in ./result/bin/x-tasks-server
```

Browsers sign in with the access token, read from the file named by `X_TASKS_TOKEN_FILE` or from
`X_TASKS_TOKEN`. Without a token the server only listens on `127.0.0.1`. Other programs can send the
token as an `Authorization: Bearer` header and call `POST /api/<call>` with the arguments as a JSON
array, using the calls listed in `src/shared/web_api.ts`.

On NixOS, import the flake's module and put a TLS reverse proxy in front of it:

```nix
imports = [ x-tasks.nixosModules.default ];
services.x-tasks-server = {
  enable = true;
  tokenFile = config.sops.secrets.x-tasks-token.path;
};
```

It keeps its database and backups in `/var/lib/x-tasks-server`. The theme setting has no effect in a
browser, which follows the system theme.

## Layout

- `src/main` — the Electron main process and the task database
- `src/server` — the web server, which shares the task database code with `src/main`
- `src/preload` — the bridge that exposes `window.x_tasks` to the page; in a browser,
  `src/renderer/web_bridge.ts` sets up the same bridge over HTTP
- `src/renderer` — the Preact interface
- `src/shared` — types and channel names used by both sides

## License

GPL-3.0-or-later
