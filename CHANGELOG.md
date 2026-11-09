# Changelog

What has shipped, newest first. Work still to do is in [ROADMAP.md](ROADMAP.md). The Android app
is released separately, as `v1.0.<build>` on every push to `main`.

## Unreleased

### Added

- History of every change to a task, with word-level diffs, on a History page and from a task's
  details, and restoring any version as a new one
- Sync history between devices, and delete history older than a set number of days, as a setting
  off by default
- Rich text notes, with a full-window notes dialog
- Task map report card showing subtasks and linked tasks
- Pick a task to link from a searchable tree in the relationship and filter dialogs
- Dependency arrows in the Gantt chart to tasks outside the current view
- Keep a task's start and due dates moving together, with Duration set to Unset to unlink them
- My Day, notes, repeats and history columns in the task table, filterable and headed by icons
- Scroll the task table sideways instead of shrinking its columns, as a setting
- Show, hide and reorder the task details sections in settings
- Outline beside the settings page, with its sections regrouped by topic
- Back up an older database before upgrading its schema, on desktop and Android

### Changed

- Word a relationship's waiting choice as which task depends on the other
- Draw the shared look from Halon 0.9 and X-Libs 0.18
- Put the app's name and icon in the top bar, the task detail header in the top bar, and the theme
  button above Settings

### Fixed

- Keep right-click menus open on Linux
- Column resizing in the task table
- Tables and task views fit the pane; the phone sidebar runs from the top bar to the bottom of the
  screen
- Stop tracking a `node_modules` symlink

## 0.2.0 — 2026-11-07

### Tasks

- Edit a task's title in place
- Tag a task from its detail panel or by dragging it onto a tag
- Notes on a task
- Start and due dates
- Repeating tasks, with a Next recurrence choice when rescheduling, and moving overdue repeats to
  today or their next date each day as a setting
- My Day, which can clear itself each day and take in due tasks by itself
- Streaks on repeating tasks, and a Reports page of cards for streaks and ticks
- Upcoming view, grouped by day with the later dates of repeating tasks, and date headings for any
  view
- Priorities, as plain tag groups with MoSCoW and Standard presets
- Subtasks, collapsing a completed task once all its subtasks are done as a setting
- Reorder tasks by dragging
- Clear all completed tasks in a view
- Undo after removing a task
- Select several tasks and complete, reschedule, tag, drag or delete them all at once
- Board, calendar and Gantt layouts, kept per view or shared, as a setting
- Tasks that wait on other tasks, set in a task's details and drawn as arrows in the Gantt chart
- Relationships named from both ends in Settings, set from a dialog in a task's details and tested
  by filters

### Tags

- Rename a tag
- Nest and reorder tags by dragging
- Pick a tag in several groups at once to see tasks matching all of them, such as Area and Priority
- Rename filter groups, make each one hold plain tags or rule tags, and reorder them by dragging
- Rule tags that apply themselves to every task matching user-set conditions
- Colours and emoji icons on tags
- Tint task rows with their tag's colour, as a setting
- Hide tags no task has from the sidebar, as a setting
- Leave a tag off task rows, as an option in its dialog
- Add the typed task from an Add task row under the bar instead of on Enter
- Give new subtasks their parent's tags, as a setting
- Preset Actionable and Untagged filters, with rule conditions for open subtasks, having no tags,
  and a start date that has passed or is not set

### Finding things

- Search across all tasks, or only the view on screen, from the bar at the top
- Filter the task table by title, date and tag, and sort it by several columns at once
- Show, hide, reorder and resize the task table's columns, including start, due, done and duration
- Read tags, dates and repeats when adding, and search with operators, in a Plain, Todoist, GTG or
  Trilium syntax
- Remember the grouping picked in each view

### App

- Settings page
- Remember the selected view between launches
- Dark theme that follows the system, or a fixed light or dark choice, in the desktop app and in a
  browser
- Back up the database, and list, restore and delete backups in settings, on desktop and Android
- Package the desktop app and the web server with the Nix flake
- MCP server for AI assistants, turned on and given a port in settings
- Open a task in the desktop app from an `x-tasks://task/<id>` link, copied from its row menu
- Web server that serves the app to browsers, with a sign-in token, live updates and a NixOS module
- Sync the desktop app with the web server, offline first
- Fit the layout to phone screens, with the sidebar as a drawer
- Android app, built with Capacitor from the same page, signed and published for Obtainium

### Quality

- Tests for the task table, schedule, trees, add/search syntaxes, view helpers, reports and web
  server
- CI that typechecks, builds, tests and lints on pushes and pull requests
