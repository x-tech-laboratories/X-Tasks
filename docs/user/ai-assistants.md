---
title: AI assistants
parent: User guide
nav_order: 10
---

# AI assistants

The desktop app can let AI assistants on your computer read and change your tasks, through the
[Model Context Protocol](https://modelcontextprotocol.io) (MCP).

1. Turn on **Enable MCP server** in Settings › Data › MCP server. Change the **Port** if another program uses
   `3917`.
2. Add it to your assistant. For Claude Code:

   ```sh
   claude mcp add --transport http x-tasks http://127.0.0.1:3917/mcp
   ```

The assistant can then list tasks and tags, add tasks and subtasks, change, complete, reopen, tag, untag, link,
unlink and delete them. Only programs on your own computer can reach the server.

{: .warning }
> An assistant works on your real tasks. Changes it makes are in [History](history.html) and can be restored there.
