---
title: Tags and filters
parent: User guide
nav_order: 3
---

# Tags and filters
{: .no_toc }

1. TOC
{:toc}

Read [Core concepts](core-concepts.html#filter-groups-and-tags) first for why tags work the way they do. This page is
the how-to.

## Filter groups

A filter group is a named set of tags, shown as its own section of the sidebar.

- **Create** one in Settings › Tags and search › Tags, under **New filter group**: give it a name and choose **Plain
  tags** or **Rule tags**.
- **Edit** a group from its menu in the sidebar (**Edit group…**) to rename it, switch its type, or turn on **One tag
  per task**. In a one-tag-per-task group, giving a task a new tag replaces the one it had, and the task's details
  show the group as a single drop-down.
- **Reorder** groups by dragging them in the sidebar.
- **Delete** a group from its menu. Its tags go with it; tasks are kept.

Each plain group also appears as a section in a task's details, and as a column in the table layout.

## Tags

- **Add** a tag from a group's menu (**Add tag**), or put one inside another from that tag's menu (**Add tag
  inside**). Tags nest as deeply as you like.
- **Edit** a tag (**Edit tag…**) to rename it, pick a colour and an emoji icon, and choose whether it shows on task
  rows. A tag left off rows still filters and still shows in the sidebar and the task's details.
- **Move or nest** tags by dragging them in the sidebar.
- **Delete** a tag from its menu. Its sub-tags are deleted too; tasks are kept. X-Tasks asks first, unless you turn
  off **Ask before deleting a tag**.

### Giving tags to tasks

- Pick tags in the group sections of a task's details.
- Drag a task (or several selected tasks) onto a tag in the sidebar.
- Choose **Tags…** in a task's right-click menu.
- Type them when adding the task, such as `#work` with the Todoist syntax (see
  [Quick add and search](views-and-layouts.html#quick-add-and-search)).

### Colours and icons

A tag's colour marks its chips, its sidebar row and its bars on the Reports page. Turn on **Tint task rows by tag**
in Settings › Appearance to shade each row with its first coloured tag. The palette offered when picking a colour is
set in Settings › Tag colours.

## Filtering with the sidebar

Click a tag to show its tasks; click it again to clear it. Three settings in Settings › Tags shape how this works:

| Setting              | Choices                                                                                     |
| :------------------- | :------------------------------------------------------------------------------------------ |
| **Tag selection**    | One tag in all · **one tag from each group** (default) · any number of tags                 |
| **Match tasks with** | **Every selected tag** (default) · any selected tag                                         |
| **Parent tags show** | **Tasks of the tags inside it too** (default) · only tasks with that tag itself             |

With the defaults, clicking *Work* under Area and *P1* under Priority shows the tasks that are both Work and P1, and
clicking *Client B* also shows tasks tagged *Client B › Website*.

![The "Due this week" rule tag selected in the sidebar; rule tags show ƒ and a count, and a dashed outline on rows]({{ '/assets/screenshots/rule-tag-view.png' | relative_url }})

**Show empty tags** can be turned off to hide tags no task has.

Remember that a task holds its parent's tags: a subtask of a *Work* task shows under *Work* even if it has no tags of
its own.

## Rule tags

Rule tags live in rule groups. Create a group of type **Rule tags**, then add a tag to it; its dialog shows the rule
editor.

1. Choose whether tasks must match **all** of the conditions or **any** of them.
2. Add conditions. Each one is a row: pick a kind, then fill in the rest.
3. Save. The tag now applies itself to every matching task, and keeps doing so as tasks change.

A rule with no conditions matches every task. The dialog shows how many tasks match as you edit.

![The rule editor: Status is not done, Filter group has no tag from Projects, Nesting is a top-level task]({{ '/assets/screenshots/rule-editor.png' | relative_url }})

### Conditions

| Condition                 | Reads as                                                                                   |
| :------------------------ | :----------------------------------------------------------------------------------------- |
| **Status**                | is done · is not done                                                                      |
| **Tag**                   | is · is not *a plain tag* (including the tags inside it)                                   |
| **Filter group**          | has a tag from · has no tag from *a plain group*                                           |
| **Due date**              | is overdue · is today · is within the next *N* days · is set · is not set                  |
| **Start date**            | has passed · has not passed or is not set · has passed or is not set · is not set          |
| **Completed in the last** | *N* days                                                                                   |
| **Repeats**               | yes · no                                                                                   |
| **Nesting**               | is a subtask · is a top-level task                                                         |
| **Open subtasks**         | has some · has none                                                                        |
| **Tags**                  | has a tag · has no tags                                                                    |
| **Title contains**        | *some text* (not case-sensitive)                                                           |
| **Relationship**          | has · has no *relationship* (or any) to any task · an open task · a chosen task            |

Tag, Filter group and Tags conditions look at the task's own tags **and those of every task above it**, the same way
sidebar filters do. Conditions refer to plain tags and groups, so rule tags are always built from things you set
yourself.

### Ideas

- **Next actions:** the preset *Actionable*, combined in the sidebar with a Context tag such as *Phone*.
- **Waiting:** Relationship *has* Waits on *an open task*.
- **Stale someday:** Status *is not done*; Due date *is not set*; Start date *is not set*.
- **Unprioritised work:** Tag *is* Work; Filter group *has no tag from* Priority.
- **Routines done today:** Repeats *yes*; Completed in the last *1 day*.

Limit a card on the [Reports](reports.html) page to a rule tag to chart only the tasks it matches.
