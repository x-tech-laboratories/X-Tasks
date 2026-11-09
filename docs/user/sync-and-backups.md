---
title: Sync and backups
parent: User guide
nav_order: 8
---

# Sync and backups
{: .no_toc }

1. TOC
{:toc}

## Desktop, web and mobile

X-Tasks is the same app in three places:

- the **desktop app**, with its own database on your computer;
- the **web app**, served to any browser by an X-Tasks server from the server's database;
- the **Android app**, with its own database on your phone.

The desktop and Android apps work fully offline. **Sync** keeps them in step with a server, so every device — and every
browser signed in to that server — shows the same tasks, tags and settings.

## Sync

### Setting it up

1. Open **Settings › Data › Sync** on the device.
2. Enter the **Server address**, such as `https://tasks.example.org/`, and the **Access token** the server was set up
   with.
3. Choose once **whose tasks to keep**:
   - On your **first** device, send its own tasks to the server.
   - On every **later** device, use the server's tasks.

   Either way, the data being replaced is backed up first.
4. Press **Start syncing**.

From then on, the device syncs by itself. Changes made offline are kept and sent once the server can be reached
again.

### How changes are merged

Every value a task, tag or setting holds — a title, a set of notes, a due date, one tag on one task — is synced **on
its own**, and the **latest edit of each value wins**. So editing a task's title on your phone and its notes on your
laptop keeps both edits. A subtask added on one device under a task deleted on another is deleted too.

Your [history](history.html) syncs along with everything else.

Some things stay with each device: window layout, the MCP server setting and backup settings.

### Private certificates

Android only connects over https. If your server's certificate comes from a private or self-signed authority, paste
that authority's certificate under **Trusted certificate authority** in the Sync settings, on the phone or the
desktop. The app then accepts
certificates it signed, and still refuses expired ones or ones for another server.

### Restoring and sync

Restoring a backup, on a device or on the server, pauses sync on the devices it affects until you choose again whose
tasks to keep.

## Backups

In **Settings › Data › Backups**:

- **Back up now** saves a copy of every task, tag and setting, named by when it was taken.
- **Back up daily** takes one each day while the app runs; **Daily backups to keep** limits how many stay. Backups made
  by hand are always kept.
- Each backup in the list can be **restored** or **deleted**.

On Android, pick a **Backup folder** in the phone's storage, such as Documents, where file managers and sync apps can
reach the backups. Before taking the server's tasks, the phone also saves its old ones in the app's storage.

The server keeps its own backups too; see [Web server](../developer/web-server.html).
