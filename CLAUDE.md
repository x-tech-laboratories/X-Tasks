# X-Tasks

## The default database holds the user's real tasks

`~/.config/x-tasks/tasks.db` is the user's live task list, not test data. Every agent and subagent
working in this repo must follow these rules:

- Run tests, screenshots, demos and experiments against a throwaway database: set `X_TASKS_DB` to a
  file in the session scratchpad, or pass `--user-data-dir` pointing at a scratch folder.
- Never create sample tasks in, seed, clear, delete from or migrate the default database.
- Do not use the `x-tasks` MCP tools to make test tasks; they write straight into the real database.
  Use them only when the user asks for a change to their own tasks.
- `npm run dev` and `npm run app` open the seeded `dev-data/tasks.db`, never the real database.
  Opening the real one needs `X_TASKS_DB=~/.config/x-tasks/tasks.db`, which also applies the
  branch's migrations to it. Only do that when the user asks, and first copy `tasks.db` with its
  `-wal` and `-shm` files somewhere safe.
