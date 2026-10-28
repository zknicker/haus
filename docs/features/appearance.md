---
summary: Appearance preferences — Mode (Light/Dark/System) and color Theme (Default/Halloween), per device.
read_when:
  - changing Settings > Preferences > Appearance, the Mode or Theme rows, or their Cmd+K commands
  - adding or changing a color theme
---

# Appearance

Settings > Preferences > Appearance holds how Haus looks on this device. Every row applies
instantly and is remembered per device (never synced to the Server); a Theme pick also follows
into other open windows.

- **Mode**: Light, Dark, or System (follows the OS).
- **Theme**: a color family layered over the mode, VSCode-style. **Default** is the standard Haus
  palette; **Halloween** is dark only: it swaps the accent for pumpkin orange, tints the window a
  faint midnight indigo, and adds a few seasonal touches: a moonlit, slowly clouding sky at the top
  of the sidebar and a haunted-house host's welcome in the Inbox greeting, a different line each
  day. More themes are added over time.
- **Window layout** (desktop only): see [Desktop Window Layout](desktop-window-layout.md).

While Halloween is on, the Haus mascot wears a costume: every place the ghost appears (the
sidebar mark, the web titlebar mark, the startup screen) shows a glass pumpkin with the ghost's
own eyes, drawn in the same box with the same drifting glass (`HausMascot`).

Each theme also names an app icon (`appIcon`: the ghost, or Halloween's pumpkin), and
`useThemeAppIcon`, mounted once by `ThemeProvider`, applies it outside the page. The browser tab's
favicon links point at that icon's set: `index.html` links the ghost set at the `public/` root,
and another icon's set sits under `public/app-icons/<icon>/` with the same file names, rendered by
`bun run icons:render-favicon`. On desktop it asks the shell to wear the same icon in the Dock
(`setAppIcon`), on launch as well as on every switch, so the Dock matches the stored theme from
the start. Switching back to Default restores the ghost on both.

A theme may be dark only, as Halloween is. While it is active, Haus is dark everywhere (every page,
the desktop window, agent visuals), and the Mode row shows Dark, disabled. The saved Mode is kept:
switching back to Default restores Light, Dark, or System exactly.

Cmd+K offers the same choices under Appearance: Use Light/Dark/System Mode and Use Default/Halloween
Theme. The mode commands are hidden while a dark-only theme is active.

Agent visuals in chat follow the web's mode and theme. The iOS app uses the Default theme.

Each theme is one definition in `apps/website/src/lib/color-themes.ts`: its label, whether it
forces a mode, its mascot, its app icon, its scene, and its greeting pools. Every surface above reads the active
definition, never the theme's name, so Default stays exactly the plain app (the ghost, no sky,
"Good morning, Name", your own mode) and adding a theme is one definition plus its token CSS.

Design contract: [.design/guidelines.md → Color themes](../../.design/guidelines.md#color-themes).
