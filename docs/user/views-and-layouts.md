---
title: Views, layouts and search
parent: User guide
nav_order: 5
---

# Views, layouts and search
{: .no_toc }

1. TOC
{:toc}

## Views

Every view is a filter over the [one big list](core-concepts.html#one-big-list).

| View          | Shows                                                                                         |
| :------------ | :-------------------------------------------------------------------------------------------- |
| **My Day**    | Today's plan, with each task's subtasks                                                       |
| **Upcoming**  | Open dated tasks by day, including the next dates of repeating tasks                          |
| **All tasks** | Everything                                                                                    |
| **Active**    | Tasks not done                                                                                |
| **Completed** | Tasks done                                                                                    |
| **Reports**   | Charts of your progress — see [Reports](reports.html)                                         |
| **History**   | Every change to every task — see [History](history.html)                                      |
| *Tags*        | Whatever tags you select in the sidebar — see [Tags and filters](tags-and-filters.html)       |

**Open on launch** in Settings › Startup picks the view the app starts on, or the one you left it on.

**Repeats in Upcoming** sets how many days ahead Upcoming lists the later dates of repeating tasks (default 7).

## Layouts

The switch at the top of a view shows its tasks in one of five layouts:

- **List** — the nested task list, with subtasks under their parents.
- **Table** — aligned columns for the title, task date, each filter group, and optionally start, due, done and
  duration. Filter by title, date and tag, sort by several columns at once, and show, hide, reorder and resize
  columns. **Scroll the table sideways** keeps column widths instead of shrinking them.
- **Board** — a column per heading of the view's grouping, or *To do* and *Done* without one. Dragging a card between
  columns changes its tag, date or done state.
- **Calendar** — month, week or day. Drag a task to move its dates, or pull an edge to change how long it runs.
  **Time slots** and **Time labels** set the step of the week and day views.
- **Gantt** — a timeline by day, week or month, with arrows for tasks that wait on others. Drag and resize bars to
  change dates.

**Layout per view** chooses how layouts are remembered: each view keeps the last one picked in it (*Remembered*,
the default), each keeps one once you press **Save layout** (*Saved by hand*), or one layout applies everywhere
(*Same everywhere*).

## Grouping

A view can put its tasks under headings: by date, or by the tags of any filter group (Area, Priority, …). Pick it at
the top of the view. **Grouping per view** remembers it the same three ways as layouts. Upcoming always groups by
date.

## Quick add and search

The bar at the top both searches and adds. **Search in** chooses whether it searches the view on screen (default) or
every task.

The button beside the bar picks a **syntax**: how the bar reads tags, dates and repeats when adding, and operators
when searching. Each can be set apart in Settings › Search.

| Syntax      | Adding                                         | Searching                          |
| :---------- | :--------------------------------------------- | :--------------------------------- |
| **Plain**   | Takes the text as typed                        | Matches words in titles and notes  |
| **Todoist** | `#tag`, `@label`, `p1`, `tomorrow at 5pm`, `every monday` | `today \| overdue`, `#work & p1` |
| **GTG**     | `tags:`, `due:`, `start:`, `every:`            | `!today !or !tomorrow`             |
| **Trilium** | `#area=Career`, `#dueDate=TODAY+7`             | `NOT(#recurrence)`                 |

Todoist is the default for both. **Syntax help** in the bar's menu, and Settings › Search, list examples for each. Words a syntax does not know are looked for in titles and notes.
