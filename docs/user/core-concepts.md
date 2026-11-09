---
title: Core concepts
parent: User guide
nav_order: 2
---

# Core concepts
{: .no_toc }

1. TOC
{:toc}

X-Tasks is built on four ideas. Everything else in the app — views, layouts, reports, search — is built on top of
them.

## One big list

Every task you ever add lives in **one single list**. There are no separate lists, projects, folders or inboxes to
choose between when you add something, and nothing ever has to be moved from one list to another.

What looks like separate lists in the sidebar are **views**: filters over that one list.

- **My Day**, **Upcoming**, **All tasks**, **Active** and **Completed** are built-in views.
- Clicking a **tag** shows the tasks holding that tag.
- Typing in the **search bar** narrows whatever view is on screen.

Because a view is only a filter, a task can show in many places at once: a task tagged *Work* and *Urgent*, due today,
shows under *Work*, under *Urgent*, in My Day and in Upcoming — and it is still the same task. Edit it anywhere and
the change shows everywhere.

{: .tip }
> Where another app would make you create a "Work" list and a "Home" list, X-Tasks has you create an *Area* filter
> group with *Work* and *Home* tags. You get the same lists, plus the ability to combine them with every other tag.

## Infinite nesting

Any task can have **subtasks**, and any subtask can have subtasks of its own, **with no limit on depth**.

- A **project** is just a task with subtasks.
- A **checklist** is a task whose subtasks are its steps.
- A large goal can be broken into phases, phases into tasks, and tasks into steps, as deep as is useful.

To nest a task, right-click it (long-press on a phone) and choose **Add subtask**, or **drag** a task onto another to
put it inside, or beside another to put it next to it. Click the arrow beside a task to fold its subtasks away.

Subtasks **follow their parent**:

- A subtask shows **wherever its parent does**. It counts as holding its parent's tags (and its grandparent's, and so
  on up), so tagging a project *Work* puts all its steps under *Work* too. Turn on **Subtasks start with their parent's
  tags** in Settings › Tasks if you would rather each new subtask get its own copy of the tags.
- When a task is in **My Day** or **Upcoming**, its subtasks come with it.
- **Completing** a task completes its subtasks too.
- **Deleting** a task deletes its subtasks.

Rule tags can tell subtasks and top-level tasks apart, and can test whether a task still has open subtasks; the
preset *Actionable* tag uses this to show only the tasks you can work on next.

## Filter groups and tags

Tags are how you describe tasks, and **you decide what to describe**. Tags belong to **filter groups**, and each group
is its own section in the sidebar. Make one group per thing you want to track:

| Filter group | Example tags                                   |
| :----------- | :--------------------------------------------- |
| Area         | Work, Home, Health, Finances                   |
| Context      | Computer, Phone, Errands, Anywhere             |
| Priority     | P1, P2, P3, P4 *(one tag per task)*            |
| Energy       | Deep focus, Low energy                         |
| Person       | Alex, Sam, Manager                             |
| Client       | Client A, Client B › Website, Client B › App   |

Tags can be **nested inside other tags** (Client B › Website), coloured, and given an emoji icon. A group can be set
to **one tag per task**, which suits scales like priority or size where a task should only ever hold one value.

Select tags in the sidebar to filter. By default you can pick **one tag from each group** and see the tasks that match
all of them — *Work* in Area plus *P1* in Priority shows your urgent work. See
[Tags and filters](tags-and-filters.html) for every option.

## Rule tags: tags that apply themselves

A filter group can hold **plain tags**, which you give to tasks by hand, or **rule tags**, which you never give by
hand. Each rule tag has a **rule**: a set of conditions, matched by *all* or *any*, built from:

- the task's **other tags** and **filter groups** (has *Work*, has no tag from *Priority*);
- its **status** (done or not), and when it was **completed**;
- its **start date** and **due date** (overdue, today, within the next N days, not set);
- whether it **repeats**;
- whether it is a **subtask** or top-level, and whether it has **open subtasks**;
- whether it has **any tags at all**;
- what its **title** contains;
- its **relationships** to other tasks (waits on an open task, has none, linked to one particular task).

The tag then applies to every task matching its rule, **automatically and immediately**. When a task stops matching —
it gets done, its date moves, a tag comes off — the rule tag goes away by itself.

Some examples:

| Rule tag        | Conditions (match all)                                                 |
| :-------------- | :--------------------------------------------------------------------- |
| Overdue         | Status *is not done*; Due date *is overdue*                            |
| This week       | Status *is not done*; Due date *is within the next 7 days*             |
| Quick wins      | Status *is not done*; Tag *is* Low energy; Nesting *is a top-level task* |
| Blocked         | Relationship *has* Waits on *an open task*                             |
| Needs triage    | Filter group *has no tag from* Area                                    |
| Done this week  | Completed in the last *7 days*                                         |

Rule tags show on task rows with a dashed outline, filter the sidebar like any tag, can be combined with plain tags,
and can be counted on the Reports page. Every new database comes with a **Filters** rule group holding two presets:

- **Actionable** — not done, has a start date that has passed or none, and has no open subtasks: the tasks you can
  actually do next.
- **Untagged** — has no tags: tasks still waiting to be sorted.

See [Rule tags](tags-and-filters.html#rule-tags) for how to build them.
