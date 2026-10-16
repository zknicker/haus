---
summary: Desktop window layouts — Band (default) and Canvas — chosen in Settings > Preferences.
read_when:
  - changing the desktop window layout setting or either layout
  - changing the window band, its tab rows, workspace tab styling, traffic-light placement, or where Settings sits on desktop
---

# Desktop Window Layout

The desktop window always has a full-width grey band across its top: the traffic lights over a
sidebar-width segment, then — starting at the content's edge — the tab rows (ADR 0039). With one pane
one row holds every tab; with two, each pane's row spans exactly its pane, so the right row starts
over the pane divider (see [Desktop tabs → One pane or two](browser-tabs.md#one-pane-or-two)).

The band is for tabs, not for what a page says about itself. The window's Back and Forward sit over
the sidebar, right of the traffic lights and just short of the sidebar's edge (beside the traffic
lights while the sidebar is hidden); they act on the focused pane. Each page keeps its own band at the top of its pane, under the
rows: its breadcrumb (Settings' Haus › Settings › Connections › GitHub) and actions, where the web
shows them too.

Under the Halloween color theme the band's sidebar-width segment carries a moonlit sky: a dim moon
just left of Back and Forward, veiled by clouds that drift a few px a minute, on an indigo night that
is calm behind the traffic lights and fades out above the sidebar; the web paints it behind the
sidebar's titlebar strip. It is a WebGL canvas mounted only under Halloween, with no pointer events
and no drag box (`features/shell/halloween-sky.tsx`); it pauses while the window is unfocused,
hidden, or the sky is off screen, and holds one still frame under reduced motion.

The macOS Dock icon follows the theme while the App runs: `desktop:dock:set-app-icon` (`ghost` or
`pumpkin`, `electron/dock-app-icon.cjs`) swaps in the compiled pumpkin tile, and `ghost` restores
the bundle icon (`app.dock.setIcon(null)`; the compiled dev icon in development). The closed App's
Finder icon stays the ghost.

Settings is not in the band: a gear leads the sidebar footer, before the update and offline Computer
marks, its tooltip naming ⌘,. The macOS App menu's Haus › Settings… (⌘,) opens it too, including
while a browser page has focus.

Settings > Preferences > Appearance > **Window layout** picks what sits under the band. It applies
instantly, is remembered per device, and stays in step across open windows.

- **Band** (default): one rounded, bordered card, inset from the window edges, holds the off-white
  sidebar and the white content, split by a faint divider.
- **Canvas**: the sidebar sits straight on the grey; the content is its own rounded, bordered card.

In-app browser pages clip to the card's corner. A stored choice from the retired Classic layout
reads as Band.

The web has no window layout: its sidebar runs full height beside a single content column, with
Settings at the trailing end of the strip above the sidebar's navigation (no shortcut).

Architecture: [Haus App → Window Layouts](../internals/app.md#window-layouts).
