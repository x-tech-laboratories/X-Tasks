---
title: Sync and backups
sidebar:
  order: 8
---

## Desktop, web and mobile

X-Tasks is the same app in three places:

- the **desktop app**, with its own database on your computer;
- the **web app**, served to any browser by an X-Tasks server from the server's database;
- the **Android app**, with its own database on your phone.

Every copy works fully offline. **Sync** keeps the copies in step with each other, so every device, and every browser
signed in to a server, shows the same tasks, tags and settings. There is no central copy: each device syncs with the
devices it is paired with, and passes on what it took from the others.

## Sync

### Pairing two devices

1. On a device the other can reach, open **Settings › Data › Sync** and press **Show pairing code**. A server can always
   be reached; an admin finds its Sync section in the browser. A desktop can be reached once **Let other devices
   connect** is on.
2. On the other device, paste the code under **Pair with a device** and press **Pair**. The code works once, for ten
   minutes.

The two copies merge: nothing is replaced and nothing is asked. The devices each was paired with are introduced to the
other, so a phone paired with your laptop also syncs with your server.

From then on, each device syncs by itself. Changes made offline are kept and sent once another device can be reached
again. **Remove** next to a paired device stops it syncing with every device.

### How changes are merged

Every value a task, tag or setting holds — a title, a set of notes, a due date, one tag on one task — is synced **on
its own**, and the **latest edit of each value wins**. So editing a task's title on your phone and its notes on your
laptop keeps both edits. A subtask added on one device under a task deleted on another is deleted too.

Your [history](/user/history/) syncs along with everything else.

Some things stay with each device: window layout, the MCP server setting and backup settings.

### Safety

Every message between two devices is sealed with both devices' keys, so nobody else can read or change it, even on
plain http at home. Sync needs no password: a device is trusted because you paired it.

### Restoring and sync

Restoring a backup, on a device or on the server, makes every paired device match the restored tasks. Each of them
backs itself up first.

## Backups

In **Settings › Data › Backups**:

- **Back up now** saves a copy of every task, tag and setting, named by when it was taken.
- **Back up daily** takes one each day while the app runs; **Daily backups to keep** limits how many stay. Backups made
  by hand are always kept.
- Each backup in the list can be **restored** or **deleted**.

On Android, pick a **Backup folder** in the phone's storage, such as Documents, where file managers and sync apps can
reach the backups. Before taking the server's tasks, the phone also saves its old ones in the app's storage.

The server keeps its own backups too; see [Web server](/developer/web-server/).
