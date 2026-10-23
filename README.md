# X-Tasks

A todo manager built with Electron, Preact and TypeScript.

## Development

```sh
nix develop      # node, and an Electron that runs on NixOS
npm install
npm run dev      # hot-reloading dev build
npm run app      # build once and launch
npm run build    # typecheck and production build
```

Tasks are saved as JSON in Electron's user data folder (`~/.config/x-tasks/tasks.json` on Linux).
Set `X_TASKS_FILE` to use a different file.

## Layout

- `src/main` — the Electron main process and the task file store
- `src/preload` — the bridge that exposes `window.x_tasks` to the page
- `src/renderer` — the Preact interface
- `src/shared` — types and channel names used by both sides

## License

GPL-3.0-or-later
