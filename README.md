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

### Development database

`npm run dev` and `npm run app` open `dev-data/tasks.db` instead, a database of example tasks, projects,
habits with a few weeks of history, and filters, dated around the day it was made. It is made the
first time either command runs, from `src/dev/seed_database.ts`, and is not kept in git. Electron's own
profile for these runs lives in `dev-data/profile` (set `X_TASKS_USER_DATA` to move it), so they never
touch `~/.config/x-tasks`.

```sh
npm run seed                                     # remake it from scratch, with fresh dates
X_TASKS_DB=/path/to/other.db npm run app         # open another database instead
npm run server -- --database dev-data/tasks.db   # serve it from the web server
```

The seeder refuses to write to `~/.config/x-tasks/tasks.db`. Add new example data to the lists in
the seeder so every checkout gets it.

## MCP server

Turn on **MCP server** in Settings to let AI assistants on this computer read and change tasks. It listens on
`http://127.0.0.1:3917/mcp` by default, as a Streamable HTTP endpoint; the port is set in Settings too.

```sh
claude mcp add --transport http x-tasks http://127.0.0.1:3917/mcp
```

It offers tools to list tasks and tags, add, update, complete, reopen, tag, untag and remove tasks.

### Importing Trilium notes

`scripts/import_trilium_note.mjs` copies Trilium task notes in through this endpoint and Trilium's own
MCP server. Each note becomes a task with its content and every attribute in the notes, its type,
priority and area as tags, its dates and repeat rule, and its checklist and child notes as subtasks.

```sh
TRILIUM_ETAPI_TOKEN=... node scripts/import_trilium_note.mjs             # paste note ids one at a time
TRILIUM_ETAPI_TOKEN=... node scripts/import_trilium_note.mjs --dry-run ID # show the tasks without adding them
```

A note whose title is already on the list is skipped, unless the existing task is empty, which is
filled in instead. `TRILIUM_MCP_URL` and `X_TASKS_MCP_URL` change the endpoints.

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

## Sync

The desktop app keeps its own database and syncs it with a server, so it works offline and sends
its changes once the server can be reached. Set it up under **Sync** in Settings with the server's
address and token, and choose once whose tasks to keep: the first device sends its own, and later
ones take the server's. Either choice backs up the data it replaces.

Each value a task, tag or setting holds is synced on its own, and the latest edit of it wins, so
editing a task's title on one device and its notes on another keeps both. A subtask added under a
task deleted elsewhere goes too. Window layout, the MCP endpoint and backup settings stay with each
device. The server address and token are kept in `sync.json` beside the database.

Restoring a backup, on a device or the server, stops sync on the devices it affects until someone
chooses again which copy to keep.

## Android

The Android app is the same page inside a Capacitor WebView. It keeps its own database on the
phone, SQLite compiled to WebAssembly and saved in the app's storage after each change, and syncs
with the web server under **Sync** in Settings, as the desktop app does. On a narrow screen the
sidebar becomes a drawer behind the menu button, and a task's details fill the screen.

```sh
nix develop .#android   # node, a JDK and the Android SDK, whose license this shell accepts
npm install
npm run build:android   # builds the page and copies it into android/
cd android && ./gradlew assembleDebug   # android/app/build/outputs/apk/debug/app-debug.apk
```

Install it with `adb install --user 0 -r app/build/outputs/apk/debug/app-debug.apk`. Without
`--user 0`, a Samsung phone also installs it into its Dual Apps profile and shows two icons.

Every push to `main` builds a signed release APK on GitHub Actions and publishes it as the
[latest release](https://github.com/x-tech-laboratories/X-Tasks/releases/latest/download/x-tasks.apk),
numbered by the run so each one installs as an update.
[Add it to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/x-tech-laboratories/X-Tasks)
to install it and get each new build as an update. The release key is made once, inside
`nix develop .#android`, with `scripts/android-signing-key.sh`. It saves the key and its password
in `~/.local/share/x-tasks/signing` and uploads them as repository secrets. Back that folder up:
Android installs an update only if it carries the same key. A debug build carries a different key,
so it must be uninstalled before a release build will install.

To try the app without a phone, use the emulator shell, which adds an Android 36 emulator:

```sh
nix develop .#android-emulator
x-tasks-emulator &          # starts the emulator; its virtual device lives in ~/.local/share/x-tasks/avd
x-tasks-emulator-install    # builds the app, then installs and opens it on the emulator only
```

`adb -s emulator-5554 reverse tcp:3918 tcp:3918` lets the emulator sync with a local server.

Android only allows https, so the server must sit behind TLS; plain http works only to `localhost`,
for testing through `adb reverse tcp:3918 tcp:3918`. For a server whose certificate comes from a
private or self-signed authority, paste that authority's PEM certificate under **Trusted certificate
authority** in the Sync settings; the app then accepts certificates it signed, and still refuses
expired ones or ones for another host. The phone keeps no backups of its
own; before it takes the server's tasks it saves its old ones in the app's storage.

## Selecting several tasks

Ctrl+click rows to select them, Shift+click to select a range, or Ctrl+A for every row on screen. On a phone,
long-press a row and choose **Select**, then tap more rows. Selected rows turn blue with a bar down their left edge;
the checkbox still only completes a task. A bar at the foot of the window marks them done or not done, reschedules
them, adds them to My Day, tags them or deletes them all at once, and the same actions show on a selected row's
right-click menu. Escape or the ✕ ends the selection.

## Task links

**Copy link** in a task's right-click menu copies a link such as `x-tasks://task/<id>`. Opening it from another
program brings the desktop app forward with that task's details open, or starts the app if it is not running. The
Nix package's desktop entry registers the `x-tasks` scheme. Only the app on the default database takes links from
later launches, so a run with `X_TASKS_DB` set never hands its link to another window.

## Layout

- `src/main` — the Electron main process and the task database
- `src/server` — the web server, which shares the task database code with `src/main`
- `src/main/sync_engine.ts` — change tracking and merging; `src/main/sync_client.ts` syncs a device with the server
- `src/preload` — the bridge that exposes `window.x_tasks` to the page; in a browser,
  `src/renderer/web_bridge.ts` sets up the same bridge over HTTP
- `src/renderer` — the Preact interface; `src/renderer/android` holds the Android app's database and bridge
- `android` — the Capacitor Android project
- `src/shared` — types and channel names used by both sides

## License

GPL-3.0-or-later
