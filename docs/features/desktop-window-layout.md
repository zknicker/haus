---
summary: Desktop window layouts — Band (default) and Canvas — chosen in Settings > Preferences.
read_when:
  - changing the desktop window layout setting or either layout
  - changing the window band, workspace tab styling, traffic-light placement, or where Settings sits on desktop
---

# Desktop Window Layout

The desktop window always has a full-width grey band across its top: the traffic lights over a
sidebar-width segment, then the workspace tabs (starting at the content's edge), the page's actions,
the split toggle, and Settings at the far right. The tabs copy Codex's window tabs. An open split
docks its own tab strip and pages right of the content, inside the card, behind a hairline (see
[Workspace tabs → Split](browser-tabs.md#split)).

Settings > Preferences > Appearance > **Window layout** picks what sits under the band. It applies
instantly, is remembered per device, and stays in step across open windows.

- **Band** (default): one rounded, bordered card, inset from the window edges, holds the off-white
  sidebar and the white content, split by a faint divider.
- **Canvas**: the sidebar sits straight on the grey; the content is its own rounded, bordered card.

In-app browser pages clip to the card's corner. A stored choice from the retired Classic layout
reads as Band.

The web has no window layout: its sidebar runs full height beside a single content column, with
Settings in the sidebar, exactly as before.

Architecture: [Haus App → Window Layouts](../internals/app.md#window-layouts).
