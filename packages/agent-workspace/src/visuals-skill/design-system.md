# Haus visuals — design system

Everything you render — inline visuals and artifact pages — wears the app's theme. Almost
every decision below is already a token; spend them instead of inventing values.

This file is the core. Read it, then read the one module for what you are making.

## Making X → read Y

| What you are making | Read |
| --- | --- |
| Any chart, plot, sparkline, heat map, or map | [charts.md](charts.md), then [marks-and-anatomy.md](marks-and-anatomy.md), [interaction.md](interaction.md), and [anti-patterns.md](anti-patterns.md) |
| A flow, tree, sequence, timeline, or state machine | [diagrams.md](diagrams.md) |
| Tiles, cards, status lists, meters, calculators, tables | [components.md](components.md) |
| A durable artifact page | [pages.md](pages.md) |
| Anything with an icon-shaped spot | [icons.md](icons.md) |

## Philosophy

- **Seamless** — a visual is part of the app, not a slide dropped into it.
- **Flat** — hairlines and fills only; no shadow, gradient, glass, or glow.
- **Compact** — app density, not deck density.
- **Ink over hue** — `--foreground` and gray do the work; color is reserved
  for meaning (status, series, one emphasis), never for "this is a UI".
- **Sentence case, two weights** — 400/500, never Title Case, CAPS, or 700.
- **One idea per visual** — a second legend means a second visual.
- **The conversation is the container** — no bordered box around it; tiles are plates.

## Tokens

The frame preloads these on `:root`. Never hardcode a color, font, radius, or
spacing, and never write `prefers-color-scheme` — the host injects the theme.
Nothing outside this table is published; an unlisted name resolves to nothing.

| Token | Role |
| --- | --- |
| `--font-sans` | All UI, body, display values, and SVG text |
| `--font-mono` | Code, hashes, ids, logs — small and secondary only |
| `--app-ui-font-size` | Body size, already set on the frame body |
| `--background` | The page ground. Artifact pages only |
| `--surface` | Card, tile, panel fill |
| `--surface-secondary` | A plate nested on a surface |
| `--surface-tertiary` | A plate nested on that |
| `--foreground` | Primary text, values, active states |
| `--muted-foreground` | Labels, captions, secondary rows |
| `--foreground-tertiary` | Disabled and de-emphasized text |
| `--border` | Hairline: card edges, table rows, separators |
| `--border-strong` | A line that must carry weight: connectors, diagram edges |
| `--accent` | The app's accent: a highlighted border, a badge, one moment |
| `--accent-bg` | The accent as a tint |
| `--accent-foreground` | Text on `--accent-bg` |
| `--success` `--warning` `--error` | Status marks, dots, strokes, and status text on the page |
| `--success-bg` `--warning-bg` `--error-bg` | Status chips and callout tints |
| `--success-foreground` `--warning-foreground` `--error-foreground` | Text on the matching tint, and nowhere else |
| `--chart-1` … `--chart-4` | Series marks, in fixed categorical order: `--chart-1` blue, `--chart-2` orange, `--chart-3` aqua, `--chart-4` yellow. Numeric order, never cycled |
| `--chart-5` | The neutral series: context, baselines, "other", "no data", the gray behind an emphasis mark |
| `--chart-grid` | Gridlines and baselines |
| `--chart-label` | Axis and tick text |
| `--radius` | Controls, chips, inputs, nested plates |
| `--radius-card` | Cards, tiles, panels — the app's shell corner |
| `--pad-sm` `--pad-md` `--pad-lg` | Padding inside a plate, card, section |
| `--gap-xs` `--gap-sm` `--gap-md` `--gap-lg` | Gaps between elements, tiles, sections |

`--accent` is emphasis, not interactivity: training data associates blue with
"clickable", Haus does not. Controls, hover, and active states stay ink.

A `-foreground` token is the text color **on its own tint**. On the page itself,
status text takes the raw `--success` / `--warning` / `--error`.

## Layout

- **Plate, card, panel** — the visual sits straight on the conversation: tiles
  and plates take `--surface-secondary`, `--radius`, `--pad-md`, no border. A
  bordered `--surface` card at `--radius-card` is for a bounded object only.
- **Tile row** — a grid with `gap: var(--gap-sm)`; at most 4 tiles per row.
- **Nested plate** — `--surface-secondary` and `--radius`; a plate on a plate
  goes `--surface-tertiary`. Three levels of nesting is the ceiling.
- **Chip, badge, pill** — a status or accent `-bg` tint with the matching
  `-foreground` text, `--radius`. Never bare colored text, never a solid fill.
  A tile's chip follows the tile grammar in [components](components.md): a
  change, a ratio, or a status, and `--warning-bg` only for a status.
- **Grid** — columns take `minmax(0, 1fr)`; a bare `1fr` floors at the content
  width, so one long label blows the column instead of truncating.
- **Sections** — `--gap-lg` between, `--gap-sm` within.
- Width `100%`; no nested scrolling and no reserved empty space.
- Never round a single-sided border; a top-only rule with a corner radius reads broken.

## Native elements

In a `visual` fence the frame already styles bare `input`, `select`, `textarea`,
`button`, `input[type=range]`, and `table`, sets `accent-color`, and scrolls wide tables.
Write the bare tag — a hand-built control looks alien.

## Typography

The base body size is **14px** (`var(--app-ui-font-size)`, line-height 1.5) — the frame sets it on `body`, so plain text is already right.

- Body text: 14px, line-height 1.5. Emphasized body: 14px weight 500.
- Title / section labels: 15–16px, weight 500.
- Secondary text, dense table cells, and code: 12–13px.
- Metadata and compact labels: 11–12px. No font-size below 11px.
- Display values: 24–36px, weight 500, line-height at least 1.08 so glyphs
  don't crop; never past 42px in a visual. Whole through 9,999, compact from
  10,000 (`$6,630`, `$14.4K`), never cents in a tile.
- Round every number that reaches the screen — `Math.round`, `toFixed(n)`, or
  `toLocaleString()` — computed values, table cells, and tooltip readouts
  included. A range slider sets `step`. Negative currency reads `-$5M`, never `$-5M`.
- `font-variant-numeric: tabular-nums` only where numbers align vertically:
  table columns, axis ticks. Tile values stay proportional. Never a switch to
  mono; letter spacing 0 or positive, names in `code style`, not bold.
- In inline SVG, set `font-family: var(--font-sans)` on the `<svg>` so text inherits it.

### Text fitting

Font metrics vary by platform. Before putting text in a fixed box or hand-drawn SVG, check it fits: `chars × budget + 2 × padding ≤ box width`.

| Font size | Budget per character |
| --- | --- |
| 11px | ~5.8px |
| 12px | ~6.3px |
| 14px | ~7.3px |
| 16px | ~8.4px |

If it doesn't fit: shorten the label, drop a size, or widen the box. Keep 4px minimum between text and any container edge.

Closing a hand-drawn `<svg>`: bottom `y + height` plus descenders clears the
viewBox by 8px, nothing exceeds its width, connectors stop at edges not centers.

## Tables

Tables live in the reply as Markdown; right-align numeric columns with `---:`.
A `<table>` inside a visual is only for one that needs interaction or is part of
a bounded record — the fragment is in [components.md](components.md).

## Streaming order

Scripts run only once the markup is complete: static HTML/SVG with inline
`style="..."` first, then inlined data, then `<script>` last, never referencing
elements below it. Keep `<style>` under ~15 lines; in SVG `<defs>` before marks.
A chart draws its marks in the markup and keeps the script for the hover layer,
so the chart is complete before a line of JavaScript runs.

## Accessibility

- A visual opens with a visually hidden `<h2>` holding a one-sentence summary
  — the one heading the no-headings rule allows:

```
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week's revenue beat the prior week every day but Tuesday.</h2>
```

- A chart's `<svg>` gets `role="img"`, an `aria-label` stating the takeaway
  rather than the type, and a `<title>` as its first child. Decorative SVG is
  `aria-hidden`, icon-only controls labeled.
- Status is never color alone: a tint takes its paired `-foreground` and a
  label.
- Invalid input in an interactive visual shows a 12–13px `var(--error)` message
  inline, and the control does not advance.

## Icons

Read [icons.md](icons.md), search `references/icons/manifest.json`, inline the
SVG from `assets/icons/` with `currentColor`. 16–18px beside a title reads as
native chrome; 24px is the ceiling — a bigger glyph wants typography instead.
