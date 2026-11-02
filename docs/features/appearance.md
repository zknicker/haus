---
summary: Appearance preferences — Mode (Light/Dark/System), color Theme (Default, Halloween, Christmas Eve, Christmas Morning), and the Christmas roofline's Snow, per device.
read_when:
  - changing Settings > Preferences > Appearance, the Mode, Theme, or Snow rows, or their Cmd+K commands
  - adding or changing a color theme
---

# Appearance

Settings > Preferences > Appearance holds how Haus looks on this device. Every row applies
instantly and is remembered per device (never synced to the Server); a Theme or Snow pick also
follows into other open windows.

- **Mode**: Light, Dark, or System (follows the OS).
- **Theme**: a color family layered over the mode, VSCode-style. **Default** is the standard Haus
  palette; **Halloween** is dark only: it swaps the accent for pumpkin orange, tints the window a
  faint midnight indigo, and adds a few seasonal touches: a moonlit, slowly clouding sky at the top
  of the sidebar and a haunted-house host's welcome in the Inbox greeting, a different line each
  day. **Christmas Eve** is dark only, with a navy night tint and a candle-gold accent;
  **Christmas Morning** is light only, with a faint frost tint and a candy-cane red accent. Both
  greet you as an innkeeper by the fire and hang a snowy roofline along the top of the window
  (see below). More themes are added over time.
- **Snow** (only while a Christmas theme is on): the snow on the roofline, **Puffy**, **Soft**, or
  **Icicles**.
- **Window layout** (desktop only): see [Desktop Window Layout](desktop-window-layout.md).

While Halloween is on, the Haus mascot wears a costume: every place the ghost appears (the
sidebar mark, the web titlebar mark, the startup screen) shows a glass pumpkin with the ghost's
own eyes, drawn in the same box with the same drifting glass (`HausMascot`). Under either
Christmas theme the ghost stays itself and wears a Santa nightcap.

The Christmas themes' roofline is a run of big glowing C9 bulbs strung along the window's top
edge under a line of snow, with a light flurry falling behind it. The Snow row picks how that
snow looks; the pick is per device and kept while another theme is on.

Each theme also names an app icon (`appIcon`: the ghost, Halloween's pumpkin, or `santa`, the
ghost in its nightcap, which both Christmas themes show), and `useThemeAppIcon`, mounted once by
`ThemeProvider`, applies it outside the page. The browser tab's favicon links point at that icon's set: `index.html` links the
ghost set at the `public/` root, and another icon's set sits under `public/app-icons/<icon>/` with
the same file names, rendered by `bun run icons:render-favicon`. On desktop it asks the shell to
wear the same icon in the Dock (`setAppIcon`), on launch as well as on every switch, so the Dock
matches the stored theme from the start. Switching back to Default restores the ghost on both.

A theme may pin a mode: Halloween and Christmas Eve are dark only, Christmas Morning is light
only. While one is active, Haus is in that mode everywhere (every page, the desktop window, agent
visuals), and the Mode row shows the pinned mode, disabled. The saved Mode is kept: switching back
to Default restores Light, Dark, or System exactly.

Cmd+K offers the same choices under Appearance: Use Light/Dark/System Mode, Use
Default/Halloween/Christmas Eve/Christmas Morning Theme, and, while a Christmas theme is on, Use
Puffy/Soft/Icicles Snow. The mode commands are hidden while a theme pins the mode.

Agent visuals in chat follow the web's mode and theme. The iOS app uses the Default theme.

Each theme is one definition in `apps/website/src/lib/color-themes.ts`: its label, whether it
forces a mode, its mascot, its app icon, its scene, and its greeting pools. Every surface above
reads the active definition, never the theme's name, so Default stays exactly the plain app (the
ghost, no scene, "Good morning, Name", your own mode) and adding a theme is one definition plus its
token CSS.

Design contract: [.design/guidelines.md → Color themes](../../.design/guidelines.md#color-themes).
