# Tablet Anywhere — Inugram plugin

**English** | [Русский](README.ru.md)

A plugin for [Inugram](https://github.com/teidesu/inugram) that keeps Telegram's two-pane tablet layout (chat list + chat) in split-screen, freeform/desktop windows and portrait mode. Without it, the app only uses two panes in fullscreen.

![Inugram in a desktop window with two panes](screenshots/window.jpg)

## Why

Stock Telegram for Android drops back to a single pane whenever the app is in multi-window mode (`AndroidUtilities.isInMultiwindow`) or when a "small tablet" is in portrait. That means that on tablets, foldables and Android desktop mode (Samsung DeX, freeform windows, etc.) a resizable window always looks like a phone, even when it's wide enough for two panes.

## Install

1. Download [`dist/tablet.inu.js`](dist/tablet.inu.js) (or grab it from [Releases](../../releases)).
2. In Inugram, open **Settings → Plugins** and install the file.
3. Allow the requested permissions (`unsafe.jvm`, `unsafe.xposed`). The plugin needs them to hook the layout code.

If the layout doesn't switch right away, resize the window or rotate the device once.

## Settings

| Option | Default | Description |
| --- | --- | --- |
| Two panes in windows and split-screen | on | Main switch |
| Minimum window width | 600 dp | Below this width the app stays single-pane. The left pane needs at least 320 dp |
| Tablet even in a narrow window | off | Treats the window as a tablet even when the system reports a phone-sized window (< 600 dp smallest width). Applied after a resize, rotation or restart |

## How it works

Using xposed-style hooks (compiled routines that run on the UI thread):

- While `LaunchActivity.checkLayout()` and the launch layout's `onMeasure`/`onLayout` run, the plugin temporarily sets `isInMultiwindow = false` and makes `isSmallTablet()` return `false`, then restores the real values. Keyboard and emoji panel logic elsewhere still sees the actual multi-window state.
- Optionally, it makes `isTabletForce()` return `true` when the window is wide enough.

## Build from source

```bash
npm install
npx inu check
npx inu build   # -> dist/tablet.inu.js
```

## Compatibility

Tested on Inugram with plugin API 1. The plugin hooks Telegram internals, so a future upstream update may break it. If that happens, please open an issue.

## License

MIT
