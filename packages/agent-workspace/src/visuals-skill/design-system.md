# Haus visuals — design system

Everything you render — inline visuals and artifact pages — wears the app's
theme. Almost every decision below is already a token; spend them instead of
inventing values and the output is native in both schemes.

## Philosophy

- **Seamless** — a visual is part of the app, not a slide dropped into it.
- **Flat** — hairlines and fills only; no shadow, gradient, glass, or glow.
- **Compact** — app density, not deck density.
- **Ink over hue** — `--foreground` and gray do the work; color is reserved
  for meaning (status, series, one emphasis), never for "this is a UI".
- **Sentence case, two weights** — 400/500, never Title Case, CAPS, or 700.
- **One idea per visual** — a second legend means a second visual.
- **Words in the reply** — no title, caption, or prose inside a visual.
- **The conversation is the container** — no bordered box around it; tiles are plates.

## Tokens

The frame preloads these on `:root`. Never hardcode a color, font, radius, or
spacing, and never write `prefers-color-scheme` — the host injects the theme.

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
| `--success` `--warning` `--error` | Status marks, dots, strokes |
| `--success-bg` `--warning-bg` `--error-bg` | Status chips and callout tints |
| `--success-foreground` `--warning-foreground` `--error-foreground` | Text on the matching tint |
| `--chart-1` … `--chart-5` | Series marks: sky, red, emerald, violet, zinc |
| `--chart-grid` | Gridlines and baselines |
| `--chart-label` | Axis and tick text |
| `--radius` | Controls, chips, inputs, nested plates |
| `--radius-card` | Cards, tiles, panels — the app's shell corner |
| `--pad-sm` `--pad-md` `--pad-lg` | Padding inside a plate, card, section |
| `--gap-xs` `--gap-sm` `--gap-md` `--gap-lg` | Gaps between elements, tiles, sections |

`--accent` is emphasis, not interactivity: training data associates blue with
"clickable", Haus does not. Controls, hover, and active states stay ink.

## Layout

- **Card, tile, panel** — the visual sits straight on the conversation: tiles
  and plates take `--surface-secondary`, `--radius`, `--pad-md`, no border. A
  bordered `--surface` card at `--radius-card` is for a bounded object only.
- **Tile row** — a grid with `gap: var(--gap-sm)`; at most 4 tiles per row.
- **Nested plate** — `--surface-secondary` and `--radius`; a plate on a plate
  goes `--surface-tertiary`. Three levels of nesting is the ceiling.
- **Chip, badge, pill** — a status or accent `-bg` tint with the matching
  `-foreground` text, `--radius`. Never bare colored text, never a solid fill.
  Delta color = direction × whether up is good: revenue up is `--success-bg`,
  returns up is `--error-bg`. `--warning-bg` is for stale or missing states
  (not synced, no data), never for a drop. Every chip carries a label, never
  color alone.
- **Sections** — `--gap-lg` between, `--gap-sm` within.
- Width `100%`; no nested scrolling and no reserved empty space.

## Native elements

In a `visual` fence the frame already styles bare `input`, `select`,
`textarea`, `button`, `input[type=range]`, and `table`, sets `accent-color`,
and scrolls wide tables. Write the bare tag — a hand-built control looks alien.

## Typography

The base body size is **14px** (`var(--app-ui-font-size)`, line-height 1.5) —
the frame sets it on `body`, so plain text is already right.

- Body text: 14px, line-height 1.5. Emphasized body: 14px weight 500.
- Title / section labels: 15–16px, weight 500.
- Secondary text, dense table cells, and code: 12–13px.
- Metadata and compact labels: 11–12px. No font-size below 11px.
- Display values: 24–36px, weight 500, line-height at least 1.08 so glyphs
  don't crop; never past 42px in a visual. Compact and rounded — whole
  dollars, 12.9K, $4.2M; never cents in a tile.
- `font-variant-numeric: tabular-nums` only where numbers align vertically:
  table columns, axis ticks. Tile values stay proportional. Never a switch to
  mono; letter spacing 0 or positive, names in `code style`, not bold.
- In inline SVG, set `svg text { font-family: var(--font-sans) }`.

### Text fitting

Font metrics vary by platform. Before putting text in a fixed box or hand-drawn
SVG, check it fits: `chars × budget + 2 × padding ≤ box width`.

| Font size | Budget per character |
| --- | --- |
| 11px | ~5.8px |
| 12px | ~6.3px |
| 14px | ~7.3px |
| 16px | ~8.4px |

If it doesn't fit: shorten the label, drop a size, or widen the box. Keep 4px
minimum between text and any container edge.

## Charts

Lead with the answer: annotate the one notable point — never a number on every
point. Label the endpoint or the extreme; ticks and tooltips carry the rest.
The takeaway belongs in your reply, never a heading or caption inside it.

**Is it a chart?**

- One number → a stat tile. Never a one-bar chart or a two-slice pie.
- A few headline numbers → a KPI row.
- A "how is X doing" or period question → a KPI row above one chart, the chart
  carrying the trend behind the numbers. Tiles alone answer no trend question.
- More than ~7 classes → a table.

**Chart.js is the default** for any chart with an axis — bar, grouped or
stacked bar, line, area. It sizes bars, ticks, and labels, holds text at 12px
at any width where hand-sized SVG text drifts, and gives tooltips free. Pinned
to `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`, any
other URL blocked, `visual` fence only. Hand-drawn inline SVG is for sparklines,
meters, and tiny marks with no axis text.

Canvas cannot read `var()`. Read tokens once at the top of the script:
`getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim()`.

**Marks**

- Bars: at most 32px thick (`maxBarThickness: 32`), rounded at the data end
  only — the baseline stays square. Never fill the slot; the band's leftover
  is air, which `categoryPercentage: 0.7` below already does.
- Lines: 2px, round joins, straight segments (`tension: 0`); no fill
  underneath unless the area is the point.
- Gridlines and axes: solid horizontal hairlines in `--chart-grid` only — no
  vertical lines, axis box, or plot border. A dashed stroke is reserved for a
  reference line (average, target), which gets a legend entry.
- One y-axis, from zero, always labeled — format the ticks with their unit.
  Ticks and axis text in `--chart-label`, 11–12px; a date axis names the
  month at least once.
- Legend: skip it for a single series. For 2+ turn Chart.js's legend off and
  build one — 10px swatches beside 12px `--muted-foreground` text, cornered at
  `calc(var(--radius) / 3)`; `--radius` would round a 10px box into a dot.
- Text never wears the series color.

**Color**

Sequential is the default: one hue in opacity steps via
`color-mix(in srgb, var(--chart-1) 45%, transparent)`. Categorical (`--chart-1`
through `--chart-4`, in order) is for genuinely independent series, 5 hues
maximum. A comparison pair — this week against last week, actual against
baseline — is `--chart-1` versus `--chart-5`, the neutral that also draws
baselines, targets, and "no data": blue against gray, never blue against blue.
Emphasis has one form: the emphasized mark in `--chart-1`, everything else in
`--chart-5` — and the period the question is about (today, yesterday, this
week) is always the emphasized mark. Never pair `--chart-2` with `--chart-3`.

Closing a hand-drawn `<svg>`: bottom `y + height` plus descenders clears the
viewBox by 8px, nothing exceeds its width, connectors stop at edges not centers.

## Fragments

Copy these and change the data. They are the house style.

### KPI row

Plates on the page, not cards on a card: no border, no `--radius-card`.
```
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$102.7K</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">↑ 12.8%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">184</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)">↑ 6.2%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Today</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">—</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--warning-bg);color:var(--warning-foreground)">Not synced yet</span>
  </div>
</div>
```

### Bar chart

Two series, so a hand-built legend; drop it for one. Keep `animation: false`.

```
<div style="display:flex;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Last week</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>Prior week</span>
</div>
<div style="position:relative;height:260px">
  <canvas id="wk" role="img" aria-label="Daily revenue, last week ahead of the prior week every day but Tuesday">Last week $6,940, prior week $6,545.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
new Chart(document.getElementById('wk'), {
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      { label: 'Last week', data: [1061, 1014, 884, 1015, 866, 938, 1162], backgroundColor: c1, borderRadius: 4, maxBarThickness: 32 },
      { label: 'Prior week', data: [932, 1162, 858, 983, 741, 732, 1137], backgroundColor: c5, borderRadius: 4, maxBarThickness: 32 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 } } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (v) => '$' + v.toLocaleString() } }
    }
  }
});
</script>
```

### Sparkline

A shape beside a number: no axes, no text, nothing to fit.

```
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label="Orders climbing over the last 14 days">
  <polyline points="0,27 10,24 20,28 30,21 40,23 50,17 60,19 70,13 80,15 90,10 100,12 110,7 120,4" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
</svg>
```

### Comparison cards

```
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:15px;font-weight:500">Starter</div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$0 · 1 seat · community support</div>
  </div>
  <div style="background:var(--surface-secondary);border:2px solid var(--accent);border-radius:var(--radius);padding:calc(var(--pad-md) - 2px)">
    <div style="display:flex;align-items:center;gap:var(--gap-xs)">
      <span style="font-size:15px;font-weight:500">Team</span>
      <span style="padding:1px 6px;border-radius:var(--radius);font-size:11px;background:var(--accent-bg);color:var(--accent-foreground)">Recommended</span>
    </div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$24 · 5 seats · shared workspaces</div>
  </div>
</div>
```

### Pipeline

```
<div style="display:flex;align-items:center;gap:var(--gap-xs)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm)">
    <div style="font-weight:500">Build</div>
    <div style="font-size:12px;color:var(--muted-foreground)">2m 10s</div>
  </div>
  <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    <path d="M0 6h22m-5-5 5 5-5 5" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>
  </svg>
  <div style="background:var(--accent-bg);border-radius:var(--radius);padding:var(--pad-sm);color:var(--accent-foreground)">
    <div style="font-weight:500">Test</div>
    <div style="font-size:12px">Running · 41 of 88</div>
  </div>
  <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    <path d="M0 6h22m-5-5 5 5-5 5" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>
  </svg>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm)">
    <div style="font-weight:500">Deploy</div>
    <div style="font-size:12px;color:var(--muted-foreground)">Queued</div>
  </div>
</div>
```

Flow left-to-right for pipelines, top-to-bottom for hierarchies. Highlight at
most one node. Past 9 nodes, group into labeled clusters.

### Table

A table is its own visual; never stack one under a chart of the same numbers.

```
<table>
  <caption>Spend by channel, June 2026</caption>
  <thead><tr><th>Channel</th><th style="text-align:right">Spend</th><th style="text-align:right">ROAS</th></tr></thead>
  <tbody>
    <tr><td>Search</td><td style="text-align:right">$42,300</td><td style="text-align:right">3.1×</td></tr>
    <tr><td>Social</td><td style="text-align:right">$18,900</td><td style="text-align:right">2.4×</td></tr>
  </tbody>
</table>
```

## Icons

Read [icons.md](icons.md), search `references/icons/manifest.json`, inline the
SVG from `assets/icons/` with `currentColor`. 16–18px beside a title reads as
native chrome; 24px is the ceiling — a bigger glyph wants typography instead.

## Streaming order

Scripts run only once the markup is complete: static HTML/SVG with inline
`style="..."` first, then inlined data, then `<script>` last, never referencing
elements below it. Keep `<style>` under ~15 lines; in SVG `<defs>` before marks.

## Artifact pages

Full self-contained HTML pages follow everything above, but get only the
tokens — not the frame's base styles — so they style their own elements:

- The page owns its ground: `--background` on the body, `--surface` panels,
  `--surface-secondary` nested. The only surface where you set a background.
- Renders offline from a snapshot: `data:` URIs for small images, charts as
  inline SVG, nothing fetched.
- Prose column ~48rem; tables and dashboards may go full width. One `<h1>`,
  then sentence-case section titles at 15–16px weight 500.
- Operational, not editorial: dense sections, hairline dividers, right-aligned
  numbers, mono for timestamps and ids.

```
<!doctype html>
<html><head><meta charset="utf-8"><title>June campaign report</title>
<style>
  body { margin:0; background:var(--background); color:var(--foreground);
    font-family:var(--font-sans); font-size:var(--app-ui-font-size,14px); line-height:1.5; }
  main { max-width:48rem; margin:0 auto; padding:var(--pad-lg); }
  section { margin-bottom:var(--gap-lg); }
  h1 { font-size:20px; font-weight:500; margin:0 0 4px; }
  h2 { font-size:15px; font-weight:500; margin:0 0 var(--gap-sm); }
  .muted { color:var(--muted-foreground); }
  table { width:100%; border-collapse:collapse; }
  td, th { padding:8px 12px; border-bottom:1px solid var(--border); text-align:left; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
</style></head>
<body><main>
  <h1>June campaign report</h1>
  <p class="muted">Summer glow '26 · Jun 1–30</p>
  <section>...</section>
</main></body></html>
```

## Accessibility

- A chart's `<svg>` or `<canvas>` gets `role="img"` and an `aria-label` stating
  the takeaway, not the type, and a `<canvas>` keeps the numbers as its
  fallback text. Decorative SVG is `aria-hidden`, icon-only controls labeled.
- Status is never color alone: a tint takes its paired `-foreground` and a
  label.
