---
title: Working with tasks
sidebar:
  order: 4
---

## Adding tasks

Type in the bar at the top of the window. As you type it also searches, and an **Add task** row appears under it.
Press that row, or Down then Enter, to add what you typed. The task goes into the view on screen: added while a tag is
selected, it gets that tag; added in My Day, it goes into My Day.

The bar can read tags, dates and repeats out of what you type, such as `Pay rent tomorrow #home every month`. See
[Quick add and search](/user/views-and-layouts/#quick-add-and-search).

To add a subtask, choose **Add subtask** from a task's right-click menu (long-press on a phone).

## Editing tasks

- **Title:** click a task's title to edit it in place.
- **Details:** click a row, or choose **Open details**, to open its details panel on the right (full screen on a
  phone). Drag the panel's edge to make it wider.

![A project task's details beside the list: its groups' tags, dates, repeat, relationships and notes](/assets/screenshots/overview.png)

The details panel holds these sections, which you can reorder or hide in Settings › Tasks › Task details:

| Section           | What it holds                                                                   |
| :---------------- | :------------------------------------------------------------------------------ |
| **My Day**        | Add the task to today's plan, or take it out                                    |
| *Each plain group*| The task's tags from that group                                                 |
| **Start**, **Due**| Dates, with or without a time                                                   |
| **Duration**      | How long the task runs: sets the due date that long after the start            |
| **Done**          | When the task was completed                                                     |
| **Reschedule**    | Quick dates such as Tomorrow or Next weekend                                    |
| **Repeat**        | How the task repeats                                                            |
| **Relationships** | Links to other tasks                                                            |
| **Streak**        | For repeating tasks, the run of times it was done on time                       |
| **Notes**         | Rich-text notes; the ⤢ button opens them in a larger dialog                     |

## Moving and nesting

Drag a task **onto** another to make it a subtask, or **above or below** it to put it beside it. Drag it onto a sidebar
tag to tag it. Click the arrow beside a task to fold or unfold its subtasks.

## Dates, durations and repeats

Each task can have a **start** date and a **due** date, each with or without a time. While the two are linked, moving
one moves the other with it; setting the **Duration** to *Unset* unlinks them.

**Task date** in Settings › Dates chooses which of the two dates a task is shown, sorted, filtered, rescheduled and put
into My Day by: due (the default) or start.

**Durations** offered in a task's details (30 minutes, 1 hour, … 3 months) and **Reschedule** options (Today,
Tomorrow, Next weekend, End of month) can be edited in Settings › Dates. A reschedule option is either a number of days
from today or the next date of a repeat rule.

**Repeats** can be anything a calendar can express — every weekday, the last day of each month, every 2 weeks on
Monday and Thursday. Completing a repeating task moves it to its next date and keeps it open, logging the tick.
**Overdue repeating tasks** can stay where they are, move to today, or skip ahead to their next date from today on,
each morning.

### Streaks

A repeating task is a **routine**. X-Tasks logs every time it is done and shows its **streak**: how many times in a
row it was done before its next occurrence came round. Turn on **Streak dots on task rows** to see the last week of
done and missed occurrences beside each routine's title.

## My Day

My Day is today's plan. Add a task from its details, its right-click menu, or by adding it while My Day is open.

![My Day with five tasks](/assets/screenshots/my-day.png)

Subtasks come along with their parent. Settings › Tasks › My Day controls how it fills and empties itself:

| Setting                                  | Default | What it does                                                           |
| :--------------------------------------- | :------ | :--------------------------------------------------------------------- |
| **Clear My Day each day**                | On      | My Day starts empty every morning                                      |
| **Add due tasks to My Day**              | Off     | Open tasks dated today or earlier go in by themselves                  |
| **Remove completed tasks from My Day**   | On      | Completing a top-level task takes it out                               |
| **Remove rescheduled tasks from My Day** | On      | Moving a task's date past today takes it out                           |

## Completing tasks

Tick a task's checkbox to complete it; this completes its subtasks too. Untick it to reopen it.
**Collapse completed branches** folds a finished task's subtasks away once they are all done.

The **Clear completed** button in a view deletes the completed tasks shown there; their ticks leave the reports too.

## Relationships

Relationships link two tasks. Choose **Add relationship…** in a task's details, pick a relationship and the other
task. The other task sees the inverse: if *A waits on B*, then B shows *Blocks A*.

New databases come with **Waits on / Blocks** and **Related to**. Edit them, or add your own such as *Depends on /
Needed by*, in Settings › Tasks › Relationships, and choose for each which task depends on the other. A waiting task
shows how many open tasks it waits on, and the Gantt chart draws an arrow to it. X-Tasks refuses links that would make
two tasks wait on each other.

Rule tags can test relationships — see [Rule tags](/user/tags-and-filters/#conditions).

## Time tracking

Press ▶ at the end of a row, or choose **Start timer** from its right-click menu, to time the work on a task. The
timer shows beside the search bar with the task's name and the time so far; click the name to open the task, or
**Stop** to end it. Only one timer runs at a time, so starting another stops the first, unless **Allow several timers
at once** is on in Settings › Tasks › Time tracking; then each running timer shows in the top bar and stops on its own,
and time that overlaps counts towards every task it was spent on. Completing a task stops its timer.

**Time spent** in a task's details shows its total and today's time, starts and stops its timer, and under **Show
entries** lists each stretch of work by day, with × to remove one. Time that runs past midnight counts towards each
day. The timer syncs, so one started on the phone shows and stops on the desktop too.

**Estimate** in the same section takes how long a task should take, typed as `1h 30m`, `1.5h`, `90m`, `1:30` or plain
minutes such as `45`; clear it to remove the estimate. A bar then fills with the time spent and says how much is left
or how far it ran over, and the task's row shows the time spent against the estimate, such as *1h 50m / 2h*, in red
once it runs over. A view's heading adds up the estimated time not yet spent on its open tasks, and My Day also shows
the time spent today on every task.

**Worklog** in the sidebar shows a week at a time: a row per task worked on, with the tasks above it, its time on each
day and its total, and each day's total along the foot. ‹ and › step through the weeks and **This week** comes back.
Click a task to open it. **Export CSV** saves the week as a timesheet, one line per task and day with its date, title,
parent tasks, tags, minutes and hours; **Copy CSV** copies the same text, which is how a phone exports it.

## Selecting several tasks

Ctrl+click rows to select them, Shift+click to select a range, or Ctrl+A for every row on screen. On a phone,
long-press a row and choose **Select**, then tap more rows.

A bar at the foot of the window then marks them done or not done, reschedules them, adds them to My Day, tags them or
deletes them all at once. Dragging any selected row moves them all together. Escape or ✕ ends the selection.

## Undo

After deleting tasks, **Ctrl+Z** (or the Undo button in the notice that appears) brings them back for a few seconds.
For anything older, use [History](/user/history/).

## Task links

**Copy link** in a task's right-click menu copies a link such as `x-tasks://task/<id>`. Opening it from another
program — a note, a chat, a calendar entry — brings the desktop app forward with that task open, or starts it.
