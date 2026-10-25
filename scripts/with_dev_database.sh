#!/usr/bin/env bash
# Runs a command against the development database, seeding it first if it is missing.
set -euo pipefail

cd "$(dirname "$0")/.."

# An X_TASKS_DB already set wins, so any other database can still be opened on purpose.
export X_TASKS_DB="${X_TASKS_DB:-$PWD/dev-data/tasks.db}"

# Electron's caches and cookies go here too, so a dev run never touches ~/.config/x-tasks.
export X_TASKS_USER_DATA="${X_TASKS_USER_DATA:-$PWD/dev-data/profile}"

if [[ ! -e "$X_TASKS_DB" ]]; then
  npx vite build -c vite.seed.config.ts --logLevel warn
  node out/seed/index.js "$X_TASKS_DB"
fi

echo "Using database $X_TASKS_DB and profile $X_TASKS_USER_DATA" >&2
exec "$@"
