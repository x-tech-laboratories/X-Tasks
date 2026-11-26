---
title: Web server
sidebar:
  order: 5
---

`x-tasks-server` serves the X-Tasks page to browsers from a database of its own, and is the hub that desktop and
Android apps [sync](/developer/sync/) with. Pages that are open update by themselves when anything changes.

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
`POST /api/call/<call>` with the arguments as a JSON list in order or by name as a JSON object:

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[]' https://tasks.example.org/api/call/list_tasks
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"task_id": "t1", "title": "Water the plants"}' https://tasks.example.org/api/call/set_task_title
```

The older path, `POST /api/<call>`, still answers in both forms for programs and installed pages written before it.

The calls are the ones listed in `src/shared/web_api.ts` (from `TASKS_METHODS` and the served settings methods in
`src/shared/bridges.ts`), such as `list_tasks`, `add_task`, `set_task_done`, `tag_task`, `list_tags` and
`list_tag_groups`.

### Items for other apps

Like every X-app, the server answers four read-only calls that let another program read tasks without knowing the
calls above, each answering with the same item shape (`id`, `kind`, `title`, `snippet`, `link`, `status`,
`changed_at`, `detail`), and the optional fifth, `get_item_texts`, for a task's whole notes. They come from X-Libs `items` (`src/shared/task_items.ts`), and a read-only token may make
them, as it may every `list_` and `get_` call.

| Call                                 | Answers                                                                                                   |
| :----------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `list_item_kinds()`                  | `[{ kind: "task", label: "Task", has_text: true }]`                                                       |
| `search_items(query, limit)`         | Tasks whose title or notes hold every word, done ones too: the title above the notes, open before done   |
| `get_items(ids)`                     | Those tasks as they are now; an id left out is gone                                                       |
| `list_item_changes(since, limit)`    | Tasks changed after `since`, oldest first, from the task history; a deleted one as `id`, `kind`, `is_deleted` |
| `get_item_texts(ids)`                | Each task's whole notes as `id`, `text`, `format` (`markdown`), `changed_at` and `is_truncated`, cut to 256 KB; a task with no notes, or gone, is left out |

A task's `status` is `done` or empty, its `snippet` is its notes as plain text, its `link` is `x-tasks://task/<id>`,
and `detail` holds `due`, `start`, `repeats`, `done_at`, `my_day`, `estimate_minutes`, `parent` and `tags` where the
task has them. Pass the last `changed_at` seen as `since` next time to miss no change.

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '["groceries", 10]' https://tasks.example.org/api/call/search_items
```

| Path              | Purpose                                                         |
| :---------------- | :-------------------------------------------------------------- |
| `api/<call>`      | A bridge call                                                   |
| `api/events`      | A server-sent event stream: `hello` with the client id, then `changed` |
| `api/sync/<call>` | The [sync protocol](/developer/sync/#protocol)                         |
| `login`           | Browser sign-in                                                 |

Paths are relative, so the app also works when a proxy serves it under a sub-folder. A page sends its client id in
the `x-client-id` header so the server tells every other page about its changes, but not that one.

## Opening a view from the address

`?view=` opens a view without changing the saved launch view: a built-in view (`my_day`, `upcoming`, `all`, `active`,
`completed`, `reports`) or tags by name (`?view=Work,Home`).
