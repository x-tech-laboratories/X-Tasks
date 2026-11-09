# Roadmap

What is still to do. Finished work moves to [CHANGELOG.md](CHANGELOG.md).

## Tasks

- [ ] Keyboard shortcuts for adding, completing and switching views (Ctrl+Z, Ctrl+A and Escape
  already work)
- [ ] Global shortcuts that work from any app, such as adding a task
- [ ] Attach files, links and images to a task
- [ ] Archive completed tasks out of the active list
- [ ] Simple counters and stopwatches for habits, one click from the top bar

## Time tracking

- [ ] Start and stop a timer on a task, keeping the time spent on each day
- [ ] Time estimates on tasks, with estimated against spent for a task and for the day
- [ ] Ask what to do with time spent away from the computer while a timer runs
- [ ] Remind to take a break after a stretch of continuous work
- [ ] Pomodoro timer and a focus mode that shows only the current task
- [ ] Worklog of time by day and week, exported as CSV timesheets
- [ ] Tray icon showing the current task and its timer

## Planning

- [ ] Schedule view that lays the day's tasks out in time blocks by their estimates, beside
  calendar events
- [ ] Reminders at a set time, with desktop and phone notifications
- [ ] End-of-day review of what was done and how long it took, moving what is left on
- [ ] Rate each day's focus, productivity and mood, with charts on the Reports page
- [ ] A notes page for each tag, apart from its tasks

## Integrations

- [ ] Import issues from Jira, GitHub, GitLab, Gitea, Redmine and OpenProject as tasks, sending
  status back where the service allows
- [ ] Show CalDAV and iCal calendar events beside tasks

## Tags

- [ ] Combine Active or Completed with the tag filter, such as Active tasks in Career

## App

- [ ] Show an error when a database call fails instead of leaving the screen out of step
- [ ] Export and import tasks as JSON
- [ ] Reorder and tag tasks by touch, since dragging needs a mouse
- [ ] Sync through WebDAV, Dropbox or a local file as well as the server, with end-to-end encryption
- [ ] Plugins
- [ ] Translations
- [ ] Installable desktop packages beyond Nix (in progress on `worktree-desktop-packages`)
- [ ] User and developer docs on GitHub Pages (in progress on `worktree-github-pages`)

## Quality

- [ ] Tests for the database queries; the schema migrations and the upgrade backup have some

## Research

- [ ] Review Task Coach for features
- [ ] Review Planner for features
- [ ] Review Trilium addons for features
- [ ] Review Super Productivity for features (a first pass added the items above; check its
  current docs for newer ones)
