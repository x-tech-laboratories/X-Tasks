---
title: Web server
parent: Developer guide
nav_order: 5
---

# Web server
{: .no_toc }

1. TOC
{:toc}

`x-tasks-server` serves the X-Tasks page to browsers from a database of its own, and is the hub that desktop and
Android apps [sync](sync.html) with. Pages that are open update by themselves when anything changes.

## Running it

```sh
npm run build:server
X_TASKS_TOKEN_FILE=token.txt npm run server -- --database ./server-tasks.db --port 3918
```

| Option / variable                     | Meaning                                                             |
| :------------------------------------ | :------------------------------------------------------------------ |
| `--database` / `X_TASKS_DB`           | The task database, created if missing. Required; never guessed.     |
| `--host`                              | The address to listen on. Default `127.0.0.1`.                      |
| `--port`                              | The port. Default `3918`.                                           |
| `X_TASKS_TOKEN_FILE` / `X_TASKS_TOKEN`| The access token browsers and devices sign in with.                 |

Without a token the server only listens on a loopback address. Run `npm run server -- --help` for every option.

The server takes its own daily backups and runs its own MCP server, configured from its settings like the desktop
app's.

## NixOS

`nix build .#server` builds the packaged server. The flake's NixOS module runs it as a service:

```nix
imports = [ x-tasks.nixosModules.default ];
services.x-tasks-server = {
  enable = true;
  tokenFile = config.sops.secrets.x-tasks-token.path;
};
```

| Option          | Default      | Meaning                                                         |
| :-------------- | :----------- | :-------------------------------------------------------------- |
| `enable`        | `false`      | Run the server                                                  |
| `package`       | the flake's  | The server package                                              |
| `host`          | `127.0.0.1`  | The address to listen on; anything else needs `tokenFile`       |
| `port`          | `3918`       | The port                                                        |
| `tokenFile`     | `null`       | A file holding the access token, kept out of the Nix store      |
| `openFirewall`  | `false`      | Open the port in the firewall                                   |

It keeps its database and backups in `/var/lib/x-tasks-server`. Put a TLS reverse proxy in front of it: Android only
syncs over https.

## HTTP API

Every bridge call the page makes is also an HTTP endpoint. Send the token as an `Authorization: Bearer` header and
`POST /api/<call>` with the arguments as a JSON array:

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[]' https://tasks.example.org/api/list_tasks
```

The calls are the ones listed in `src/shared/web_api.ts` (from `TASKS_METHODS` and the served settings methods in
`src/shared/bridges.ts`), such as `list_tasks`, `add_task`, `set_task_done`, `tag_task`, `list_tags` and
`list_tag_groups`.

| Path              | Purpose                                                         |
| :---------------- | :-------------------------------------------------------------- |
| `api/<call>`      | A bridge call                                                   |
| `api/events`      | A server-sent event stream: `hello` with the client id, then `changed` |
| `api/sync/<call>` | The [sync protocol](sync.html#protocol)                         |
| `login`           | Browser sign-in                                                 |

Paths are relative, so the app also works when a proxy serves it under a sub-folder. A page sends its client id in
the `x-client-id` header so the server tells every other page about its changes, but not that one.

## Opening a view from the address

`?view=` opens a view without changing the saved launch view: a built-in view (`my_day`, `upcoming`, `all`, `active`,
`completed`, `reports`) or tags by name (`?view=Work,Home`).
