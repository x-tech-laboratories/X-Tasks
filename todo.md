# Todo

## Tasks

- [x] Edit a task's title in place
- [x] Tag a task from its detail panel or by dragging it onto a tag
- [x] Notes on a task
- [x] Start and due dates
- [x] Repeating tasks
- [x] My Day, which can clear itself each day and take in due tasks by itself
- [x] Streaks on repeating tasks, and a Reports page of cards for streaks and ticks
- [x] Upcoming view, grouped by day with the later dates of repeating tasks, and date headings for any view
- [x] Priorities
- [x] Subtasks
- [x] Reorder tasks by dragging
- [x] Clear all completed tasks in a view
- [x] Undo after removing a task

## Tags

- [x] Rename a tag
- [x] Nest and reorder tags by dragging
- [x] Pick a tag in several groups at once to see tasks matching all of them, such as Area and Priority
- [x] Rename filter groups, and make each one hold plain tags or rule tags
- [ ] Combine Active or Completed with the tag filter, such as Active tasks in Career
- [x] Rule tags that apply themselves to every task matching user-set conditions, such as completed routines
- [x] Reorder filter groups by dragging
- [x] Give tags a colour, shown on their chips, sidebar rows and report bars

## Finding things

- [x] Search across all tasks, or only the view on screen, from the bar at the top
- [x] Filter the task table by title, date and tag, and sort it by several columns at once
- [x] Show, hide, reorder and resize the task table's columns, including optional start, due and done date columns
- [ ] Keyboard shortcuts for adding, completing and switching views

## App

- [x] Settings page
- [x] Remember the selected view between launches
- [ ] Show an error when a database call fails instead of leaving the screen out of step
- [x] Dark theme that follows the system, or a fixed light or dark choice
- [x] Back up the database, and list, restore and delete backups in settings
- [ ] Export and import tasks as JSON
- [ ] Package the app with the Nix flake
- [x] MCP server for AI assistants, turned on and given a port in settings
- [x] Web server that serves the app to browsers, with a sign-in token, live updates and a NixOS module
- [x] Sync the desktop app with the web server, offline first
- [ ] Follow the theme setting in a browser
- [x] Fit the layout to phone screens, with the sidebar as a drawer
- [ ] Reorder and tag tasks by touch, since dragging needs a mouse
- [x] Android app, built with Capacitor from the same page
- [ ] Backups on Android

## Quality

- [ ] Tests for the database queries and schema migrations
- [ ] Tests for the view helpers in `src/renderer/views.ts`
- [ ] CI that typechecks, tests and builds

## Research

- [ ] Review Task Coach for features
- [ ] Review Planner for features
- [ ] Review Trilium addons for features
- [ ] Review Super Productivity for features
