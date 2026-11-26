---
title: AI assistants
sidebar:
  order: 10
---

The desktop app can let AI assistants on your computer read and change your tasks, through the
[Model Context Protocol](https://modelcontextprotocol.io) (MCP).

1. Turn on **Enable MCP server** in Settings › Data › MCP server. Change the **Port** if another program uses
   `3917`.
2. Add it to your assistant. For Claude Code:

   ```sh
   claude mcp add --transport http x-tasks http://127.0.0.1:3917/mcp
   ```

The assistant can then list tasks and tags, add tasks and subtasks, change, move, complete, reopen, tag, untag, link,
unlink and delete them, and list, start and stop timers. It can also search and read tasks, and list what changed
since a moment, through the four item calls every X-Tech app answers alike. Tasks carry their estimate, time spent and reminders, and adding or updating a task can set its reminders. Only programs on your own computer can reach the server.

> [!WARNING]
> An assistant works on your real tasks. Changes it makes are in [History](/user/history/) and can be restored there.
