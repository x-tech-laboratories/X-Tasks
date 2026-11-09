---
title: Testing and contributing
parent: Developer guide
nav_order: 8
---

# Testing and contributing
{: .no_toc }

1. TOC
{:toc}

## Tests

Tests live in `tests/` and run with Vitest:

```sh
npm test                          # everything
npx vitest run tests/views.test.ts   # one file
```

They cover the views and rule helpers, the syntaxes, schedules and streaks, reports, the table, task history, the web
server, migrations and the page itself (`app.test.tsx`, against `tests/fake_bridge.ts`). `tests/fixtures.ts` builds
tasks, tags and groups for them.

{: .warning }
> Tests, screenshots and experiments must use a throwaway database: set `X_TASKS_DB` to a scratch file or pass
> `--user-data-dir` to a scratch folder. Never touch `~/.config/x-tasks/tasks.db`.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`: `npm ci`, typecheck, build, tests and lint.
`.github/workflows/android.yml` builds and publishes the release APK on pushes to `main`.

## Code style

- TypeScript throughout, with `snake_case` names spelt out in full.
- Files are split into sections under `// ====` banners.
- Comments are one plain sentence describing what the code does now.
- Shared, app-independent widgets and helpers belong in X-Libs rather than in this repository.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), such as
`feat(sync): …` or `fix: …`.

## These docs

This site is built by GitHub Pages from the `docs/` folder of `main`, with Jekyll and the
[Just the Docs](https://just-the-docs.com) theme. User documentation lives in `docs/user/`, developer documentation in
`docs/developer/`; each page names its section with `parent:` in its front matter.

To preview it locally:

```sh
gem install --user-install jekyll jekyll-remote-theme
cd docs && jekyll serve
```

When a change adds or alters a feature, update the matching user page, and the developer page if it changes how the
code is built or fits together.
