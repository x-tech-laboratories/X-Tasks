---
title: Home
layout: home
nav_order: 1
---

# X-Tasks

X-Tasks is a todo manager for the desktop, the browser and Android. Instead of splitting your work into separate
lists and projects, it keeps every task in **one big list**, lets you **nest tasks inside each other as deeply as you
like**, and lets you slice that list any way you want with **tags you design yourself**, including **rule tags** that
apply themselves.

[Read the user guide](user/){: .btn .btn-primary .mr-2 }
[Read the developer guide](developer/){: .btn }

---

## The four ideas behind X-Tasks

### 1. All tasks live in one big list

There are no separate lists or projects to file things into. Every task you add goes into the same list, and every
view you open — My Day, Upcoming, a tag, a search — is just a filter over it. A task never has to be moved between
lists; you change what it is tagged with, and it shows up wherever those tags are.

### 2. Tasks nest infinitely

Any task can hold subtasks, and those subtasks can hold their own, with no limit on depth. A project is simply a task
with subtasks; a checklist is a task with small subtasks. Subtasks follow their parent: they show under it, share its
tags, and come along into My Day and Upcoming with it.

### 3. Filter groups and tags track anything

You decide what to track. Create a **filter group** for each kind of thing you care about — Area, Context, Priority,
Energy, Client, Person — and fill it with **tags**. Tags can be nested too, coloured, given an emoji, and a group can
be limited to one tag per task (handy for a priority scale). Pick tags in the sidebar, even one from each of several
groups, to see the tasks matching all of them.

### 4. Rule tags are tags that apply themselves

A **rule group** holds tags that are never given by hand. Each one has a rule built from conditions on other tags,
groups and task attributes — status, start and due dates, repeats, nesting, open subtasks, title, relationships — and
it applies itself to every task that matches, right now. *Overdue work*, *Actionable*, *Waiting on someone* or *Done
this week* become tags you can click, combine and report on like any other.

---

## On the desktop, on the web and on your phone

The same app runs in three places, with the same features and the same look:

| Platform    | What it is                                                                                     |
| :---------- | :--------------------------------------------------------------------------------------------- |
| **Desktop** | An Electron app for Linux, with its own database on your computer. Works fully offline.         |
| **Web**     | `x-tasks-server` serves the app to any browser, signed in with an access token.                 |
| **Android** | A native app built from the same page, with its own database on the phone. Works fully offline. |

## Sync between all your devices

The desktop and Android apps keep their own copy of your tasks and **sync** it with your X-Tasks server whenever it
can be reached, so you can keep working offline and your changes go up once you are back online. Sync works value by
value: edit a task's title on your phone and its notes on your laptop, and both edits are kept. Browser pages open on
the server update by themselves the moment anything changes. See [Sync and backups](user/sync-and-backups.html).

## Every change is tracked

X-Tasks keeps a **history** of every change to every task — titles, notes, dates, tags, done state — and shows it
with word-level differences. Browse it across all tasks on the History page or for a single task from its details,
and restore any earlier version, even of a deleted task. History can sync between devices too. See
[History](user/history.html).

---

## Also in X-Tasks

- **My Day** to plan today, filled by hand or automatically from what is due.
- **Dates, durations and repeats** with full calendar rules, plus streaks for routines.
- **Five layouts** for any view: list, table, board, calendar and Gantt chart.
- **Relationships** between tasks, such as *Waits on* / *Blocks*, with arrows in the Gantt chart.
- **Quick add and search syntax** borrowed from Todoist, GTG or Trilium.
- **Reports** of streaks, ticks per day and week, ticks by tag, and a map of linked tasks.
- **Backups**, and an **MCP server** so AI assistants can work with your tasks.

## Where to go next

| You want to…                                   | Read                                               |
| :--------------------------------------------- | :------------------------------------------------- |
| Install X-Tasks and start using it             | [Getting started](user/getting-started.html)       |
| Understand the one list, nesting and tags      | [Core concepts](user/core-concepts.html)           |
| Build your own filter groups and rule tags     | [Tags and filters](user/tags-and-filters.html)     |
| Build, run or change the code                  | [Developer guide](developer/)                      |
| Host your own server                           | [Web server](developer/web-server.html)            |
