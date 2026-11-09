---
title: Getting started
parent: User guide
nav_order: 1
---

# Getting started
{: .no_toc }

1. TOC
{:toc}

X-Tasks runs on the **desktop** (Linux), in any **web browser** through an X-Tasks server, and on **Android**. Each
desktop and Android install keeps its own database, so it works offline, and can [sync](sync-and-backups.html) with a
server so all your devices show the same tasks.

## Desktop

The desktop app is packaged with Nix:

```sh
nix run github:x-tech-laboratories/X-Tasks
```

or add the flake's package to your system. The package's desktop entry also registers `x-tasks://` links (see
[Task links](tasks.html#task-links)).

Your tasks are kept in `~/.config/x-tasks/tasks.db`, together with your settings. The Settings page shows the exact
path under **Storage**.

## Web browser

If you or someone you trust runs an X-Tasks server (see [Web server](../developer/web-server.html)), open its address
in a browser and sign in with its access token. Every page open on the server updates by itself when anything
changes, from another browser, the desktop app or a phone.

In a browser the app follows your system's light or dark theme.

You can open a particular view straight from the address by adding `?view=`:

| Address ending                | Opens                                  |
| :---------------------------- | :------------------------------------- |
| `?view=my_day`                | My Day                                 |
| `?view=upcoming`              | Upcoming                               |
| `?view=all`, `active`, `completed` | All tasks, Active, Completed      |
| `?view=reports`               | Reports                                |
| `?view=Work,Home`             | The tasks tagged Work and Home         |

## Android

Download the [latest APK](https://github.com/x-tech-laboratories/X-Tasks/releases/latest/download/x-tasks.apk) and
install it, or
[add X-Tasks to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/x-tech-laboratories/X-Tasks)
to install it and receive every new build as an update.

On a phone, the sidebar becomes a drawer behind the menu button, and a task's details fill the screen. Long-press a
task for its menu.

## Your first few minutes

1. **Add a task.** Type in the bar at the top. An **Add task** row appears under it; press it (or Down then Enter).
2. **Add a subtask.** Right-click the task (long-press on a phone) and pick **Add subtask**, or drag one task onto
   another to put it inside.
3. **Make a filter group.** In Settings › Tags, add a filter group such as *Area*, then add tags to it in the sidebar,
   such as *Work* and *Home*.
4. **Tag your tasks.** Open a task's details and pick a tag, or drag the task onto a tag in the sidebar.
5. **Click a tag** in the sidebar to see only its tasks. Click tags in several groups to narrow it further.
6. **Look at the Filters group.** It comes with two rule tags, *Actionable* and *Untagged*, that apply themselves. Read
   [Rule tags](tags-and-filters.html#rule-tags) to make your own.
