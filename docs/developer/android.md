---
title: Android
parent: Developer guide
nav_order: 6
---

# Android
{: .no_toc }

1. TOC
{:toc}

The Android app is the same page inside a Capacitor WebView. It keeps its own database on the phone — SQLite compiled
to WebAssembly, saved in the app's storage after each change — and syncs with the web server as the desktop app does.

## Building

```sh
nix develop .#android     # node, a JDK and the Android SDK, whose license this shell accepts
npm install
npm run build:android     # builds the page and copies it into android/
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with:

```sh
adb install --user 0 -r app/build/outputs/apk/debug/app-debug.apk
```

Without `--user 0`, a Samsung phone also installs it into its Dual Apps profile and shows two icons.

## Emulator

```sh
nix develop .#android-emulator
x-tasks-emulator &           # starts an Android 36 emulator; its device lives in ~/.local/share/x-tasks/avd
x-tasks-emulator-install     # builds the app, then installs and opens it on the emulator only
adb -s emulator-5554 reverse tcp:3918 tcp:3918   # lets the emulator sync with a local server
```

Android only allows https, except to `localhost`, so `adb reverse` is how to test against a local plain-http server.

## Releases

Every push to `main` builds a signed release APK on GitHub Actions (`.github/workflows/android.yml`) and publishes it
as the [latest release](https://github.com/x-tech-laboratories/X-Tasks/releases/latest/download/x-tasks.apk),
numbered by the run so each installs as an update. Obtainium users get each build automatically.

The release key is made once, inside `nix develop .#android`, with `scripts/android-signing-key.sh`. It saves the key
and its password in `~/.local/share/x-tasks/signing` and uploads them as repository secrets. Back that folder up:
Android installs an update only if it carries the same key. A debug build carries a different key, so it must be
uninstalled before a release build will install.

## Platform differences

- No MCP server.
- Backups go to a folder picked in the phone's storage.
- An older database is backed up before its schema is upgraded.
- Sync needs https, so a server with a private certificate authority needs that authority pasted into the Sync
  settings, as on the desktop.
