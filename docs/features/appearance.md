---
summary: Settings > Appearance — Mode tiles (System/Light/Dark), the Theme gallery (Haus, OLED, open-license palettes, seasonal themes), custom themes with per-mode colors, each theme's Home background (patterns, uploads, effects, sliders), and the Christmas roofline's Snow, per device.
read_when:
  - changing Settings > Appearance, the Mode tiles, the Theme gallery, custom themes, the Background section, or the Snow row, or their Cmd+K commands
  - changing a Home background pattern, effect, slider, upload, or a preset's default background
  - adding or changing a color theme or a theme preview
---

# Appearance

Settings > Appearance (`settings/appearance`, under Preferences in the rail) holds how Haus looks
on this device. Every choice applies instantly and is remembered per device in local storage
(never synced to the Server), follows into other open windows, and is stamped on the document
root before the first render (`stampStoredAppearance` in `main.tsx`), so a reload never flashes
the default palette.

- **Mode**: three preview tiles, System (half light, half dark), Light, and Dark, each drawn in
  the active theme.
- **Theme**: a gallery of preview cards, each a miniature of the window drawn from that theme's
  real tokens (`theme-preview.tsx`), in the current mode. The presets:
  - **Haus**, the standard palette (id `default`).
  - **OLED**, Haus with a true black dark ground; light is Haus light.
  - Palettes with open licenses, each with a light and a dark variant: **Catppuccin** (Latte and
    Mocha, MIT), **Gruvbox** (MIT), **Everforest** (MIT), **Nord** (MIT), **One** (Atom's One
    Light and One Dark, MIT), and **Mauve** (the colors of HeroUI Pro's Mouve theme variant).
  - The seasonal themes below.
- **Create theme** copies the current theme's accent, background and foreground for both modes
  into a new custom theme and selects it. A selected custom theme shows **Name**, **Delete
  theme**, and **Colors** with Light and Dark tabs: Accent, Background and Foreground rows (a
  swatch that opens a picker, and a hex field), and **Advanced colors** for Sidebar, Card,
  Popover, Input, Button, Muted, Border, Link and Text on accent. An advanced row left empty
  shows the derived value as its placeholder; clearing a field hands the color back to
  derivation. Deleting the selected theme returns to Haus.
- **Snow** (only while a Christmas theme is on), under the gallery.
- **Background**, last: what Home draws behind its composer under the selected theme. Home
  lives in the [Capy shell](capy-shell.md), so the section and its settings-search rows show
  only while that flag is on. See [Home backgrounds](#home-backgrounds).
- **Window layout** (desktop only) stays in Settings > Preferences: see
  [Desktop Window Layout](desktop-window-layout.md).

The seasonal themes: **Halloween** is dark only: it swaps the accent for pumpkin orange, tints
the window a faint midnight indigo, and adds a few seasonal touches: a moonlit, slowly clouding
sky at the top of the sidebar and a haunted-house host's welcome in the Inbox greeting, a
different line each day. **Christmas Eve** is dark only, with a navy night tint and a candle-gold
accent; **Christmas Morning** is light only, with a faint frost tint and a candy-cane red accent.
Both greet you as an innkeeper by the fire and hang a snowy roofline along the top of the window
(see below); the Snow row picks **Puffy**, **Soft**, or **Icicles**.

## How themes are built

Every theme is tokens on HeroUI's own theming, so every component stays stock. The root carries
`data-color-theme` (the theme id), `data-theme` (the mode), and `data-palette` while a palette
theme is on; a theme preview carries the same three attributes, so it renders the real theme in
place.

- **Haus-ground themes** (Haus, OLED, the seasonal ones) layer token overrides over the default
  ladder in `styles/themes/<name>-tokens.css`.
- **Palette themes** (the open-license palettes, Mauve, and every custom theme) set base colors
  only. `styles/themes/palette-ground.css` derives the rest of the ladder from them (sidebar,
  cards, fields, buttons, lines, the desktop shell, tooltips, text on accent), the way HeroUI
  derives hover and soft fills from its base tokens. A palette's own block is
  `[data-color-theme="<id>"][data-palette][data-theme="<mode>"]`, (0,3,0), so it beats a derived
  default without relying on order.
- **Custom themes** live in `lib/custom-themes.ts`: `{ id: 'custom-<id>', name, light, dark }`,
  where each mode maps Accent, Background and Foreground (required) and the advanced roles
  (optional) to `#rrggbb`. They are stored as JSON under `haus.custom-themes`, validated on read,
  and written as one generated `<style id="haus-custom-themes">` of token blocks in the same shape
  as a palette preset, so previews, both modes, and the derivation work the same way.

While Halloween is on, the Haus mascot wears a costume: every place the ghost appears (the
sidebar mark, the web titlebar mark, the startup screen) shows a glass pumpkin with the ghost's
own eyes, drawn in the same box with the same drifting glass (`HausMascot`). Under either
Christmas theme the ghost stays itself and wears a Santa nightcap.

The Christmas themes' roofline is a run of big glowing C9 bulbs strung along the window's top
edge under a line of snow, with a light flurry falling behind it. The Snow row picks how that
snow looks; the pick is per device and kept while another theme is on.

Once a day under either Christmas theme, Santa's team flies across the Inbox: the ghost in its
nightcap in a sleigh, four pairs of reindeer, and Rudolph's red nose in the lead, about eight
seconds left to right through the empty air between the "Haus › Inbox" trail and the greeting
(`features/sleigh-ride/`). It flies the first time the Inbox is shown after 5pm, or after noon
under Christmas Morning, never in a window's first second, and only once the Inbox is focused,
visible, and at its top; an unfocused window freezes it mid-flight until focus returns. It covers
no text or control, never takes the pointer or focus, and never flies under Reduce Motion. The
day it flew is kept per device. In development, setting `haus.debug-sleigh` in localStorage
forces a ride on the next Inbox show.

Each theme also names an app icon (`appIcon`: the ghost, Halloween's pumpkin, or `santa`, the
ghost in its nightcap, which both Christmas themes show), and `useThemeAppIcon`, mounted once by
`ThemeProvider`, applies it outside the page. The browser tab's favicon links point at that icon's set: `index.html` links the
ghost set at the `public/` root, and another icon's set sits under `public/app-icons/<icon>/` with
the same file names, rendered by `bun run icons:render-favicon`. On desktop it asks the shell to
wear the same icon in the Dock (`setAppIcon`), on launch as well as on every switch, so the Dock
matches the stored theme from the start. Switching to any other theme restores the ghost on both.

A theme may pin a mode: Halloween and Christmas Eve are dark only, Christmas Morning is light
only. While one is active, Haus is in that mode everywhere (every page, the desktop window, agent
visuals), and the Mode tiles show the pinned mode, disabled. The saved Mode is kept: switching
back to another theme restores Light, Dark, or System exactly.

Cmd+K offers the same choices under Appearance: Use Light/Dark/System Mode, Use <Theme> Theme for
every preset and custom theme, and, while a Christmas theme is on, Use Puffy/Soft/Icicles Snow.
The mode commands are hidden while a theme pins the mode.

Agent visuals in chat follow the web's mode and theme. The iOS app uses the Haus theme.

Each preset is one definition in `apps/website/src/lib/color-themes.ts`: its label, its ground
(`haus` or `palette`), whether it forces a mode, its mascot, its app icon, its scene, and its
greeting pools. A custom theme wears Haus's definition with a palette ground. Every surface above
reads the active definition, never the theme's name, so Haus stays exactly the plain app (the
ghost, no scene, "Good morning, Name", your own mode) and adding a preset is one definition plus
its token CSS.

## Home backgrounds

Every theme carries a Home background (`lib/home-background.ts`): a **source**, an **effect**, and
six **adjustments**. The Background section edits the selected theme's:

- A live preview of Home's composer over the background, drawn from the real tokens.
- Source tiles: **None**, five built-in patterns, and **Image**. Picking Image with no upload
  opens the file picker. An upload stays with the theme while a pattern is picked, so switching
  back restores it; **Replace** and **Remove** manage it.
- **Effect**: None, Dither (a 4px ordered checker in soft light), Grain (a static 64px
  grayscale noise tile in overlay, generated once from a fixed seed in `lib/grain-tile.ts`), or
  Vignette (edges sink into the theme's background). The layer pays for a filter only while
  Brightness or Blur leaves its default, and for a mask only while Bottom fade is above 0.
- Sliders: **Brightness** (50 to 150%), **Blur** (0 to 100%, up to 32px), **Image opacity**,
  **Bottom fade** (a mask that fades the layer into the page toward the bottom), **Overlay
  opacity** (a wash of the theme's background color), and **Input opacity** (the composer
  surface, 20 to 100%). A drag previews live and saves once, on release.
- **Reset to defaults** restores the effect and sliders and keeps the source.

The patterns are drawn in CSS from the live tokens (`features/home-background/home-background.css`),
so each recolors with every theme in both modes, and nothing animates:

- **Dot grid**: a 22px grid of 1px dots in the foreground at 20%.
- **Contours**: topographic rings radiating from the lower-left corner, with a faint accent glow
  there.
- **Aurora**: three soft accent blobs, the accent and two hue-shifted neighbors, at the top
  corners and the bottom.
- **Horizon**: an accent glow rising from the bottom edge.
- **Ghosts**: the Haus ghost silhouette (eyes cut out) tiled sparsely at a slight tilt, in the
  foreground at 7%.

Preset defaults: Haus and OLED keep Home plain, since Haus is the plain app and OLED exists for
true black. The other presets are already opt-in looks, so each brings a pattern that suits it:
Catppuccin and Mauve Aurora, Gruvbox and One Dot grid, Everforest Contours, Nord and both
Christmas themes Horizon, and Halloween Ghosts. A new custom theme copies the background of the
theme it was created from.

Storage, per device like every Appearance choice:

- A preset stays read-only. A change under it is this device's override for that preset, kept
  in `haus.preset-backgrounds` (`lib/preset-backgrounds.ts`), so picking the preset again
  later shows the same background and nothing forks into a custom theme.
- A custom theme stores its background on its own record in `haus.custom-themes`.
- Both are validated with zod on read: a broken field falls back to its default, adjustments
  clamp to their range, and an Image source with no upload reads as None.
- Uploads are PNG, JPEG, GIF, WebP or AVIF up to 8 MB, stored as blobs in IndexedDB
  (`haus-backgrounds`, `lib/background-images.ts`); the theme keeps only the id, name and type.
  A larger or other file is refused with an inline message and the background is unchanged. A
  failed save says so the same way. The message clears when the theme changes, and an upload that
  finishes after a theme switch is dropped. Blobs no theme points at are pruned after Replace,
  Remove, and deleting a custom theme.
- At runtime an upload is one object URL shared by every reader of it (Home, the preview, the
  source tile, the Image row; `hooks/shell/background-image-urls.ts`), so the blob is read once,
  and revoked when the last reader lets go. While it loads Home draws
  nothing, and a missing blob draws nothing and shows "Missing on this device" on the Image row.
  Under Reduce Motion a GIF, WebP or AVIF shows its first frame, and turning Reduce Motion on
  or off applies at once.

`HomeBackground` (`features/home-background/home-background.tsx`) renders the active theme's
background full bleed behind Home. It takes no props and reads only theme stores, so chat
activity never re-renders it (`home-background-render-isolation.test.tsx`). It sets
`--home-input-opacity` on Home's container, which the theme layer's `.home-composer` rule reads.

Design contract: [.design/guidelines.md → Color themes](../../.design/guidelines.md#color-themes).
