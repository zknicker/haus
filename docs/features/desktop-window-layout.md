---
summary: Desktop window layouts — Band (default) and Canvas — chosen in Settings > Preferences.
read_when:
  - changing the desktop window layout setting or either layout
  - changing the window band, workspace tab styling, traffic-light placement, or where Settings sits on desktop
---

# Desktop Window Layout

The desktop window always has a full-width grey band across its top: the traffic lights over a
sidebar-width segment, then — starting at the content's edge — the routed page's title (split mode)
or the one tab strip (expanded mode), the page's actions, and at the far right the expand and side
pane controls. The tabs and controls copy Codex's window tabs. In split mode the side
pane docks right of the routed page, inside the card, behind a hairline, and its tab strip sits in
the band starting over the pane's edge (see
[Workspace tabs → Split and expanded modes](browser-tabs.md#split-and-expanded-modes)).

As in Codex, short hairlines in the band continue each content column's leading edge: one where the
routed page's column starts (the sidebar divider in Band, the content card's edge in Canvas) and,
while the side pane shows, one at the pane's edge before its strip. Each is the tab strip's own
divider (same color, thickness, and height), not a full-height border.

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
