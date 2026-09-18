# Haus visuals — charts

Read [design-system.md](design-system.md) first. This module carries the chart
rules and an index of copy-ready fragments. Read the ONE fragment file the
index points at — two at most — and change its data. The fragments are the
house style; improvising from the prose is how five agents produce five looks.

## Fragment index

| The question | Read |
| --- | --- |
| "How is X doing", any period question | [kpi-row](fragments/kpi-row.md) above [emphasis-bar](fragments/emphasis-bar.md) |
| This one against its own history | [emphasis-bar](fragments/emphasis-bar.md) |
| This period against the prior one | [grouped-bar](fragments/grouped-bar.md) |
| How big is each, ranked, top N | [ranked-horizontal-bar](fragments/ranked-horizontal-bar.md) |
| How did it move over time | [trend-line](fragments/trend-line.md) |
| How did the volume build up | [area](fragments/area.md) |
| How do two to four independent series compare | [multi-line](fragments/multi-line.md) |
| How does the mix shift over time | [stacked-bar](fragments/stacked-bar.md) |
| What share of the whole, at a glance | [donut](fragments/donut.md) |
| Who is above and below a baseline | [diverging-bar](fragments/diverging-bar.md) |
| What changed per item, before → after | [dumbbell](fragments/dumbbell.md) |
| Where two measures relate | [scatter-bubble](fragments/scatter-bubble.md) |
| Which weekday-by-week cells run hot | [heat-map](fragments/heat-map.md) |
| Where in the US it sells | [map-us-states](fragments/map-us-states.md) |
| Where in the world it sells | [map-world-countries](fragments/map-world-countries.md) |
| A shape beside a number | [sparkline](fragments/sparkline.md) |

## Is it a chart?

| What you have | What it is |
| --- | --- |
| One number | A stat tile — never a one-bar chart or a two-slice pie |
| One number against a limit | A meter (components.md), never a pie |
| A few headline numbers | A KPI row (components.md) |
| "How is X doing", any period question | A KPI row above one chart |
| More than ~7 classes | A Markdown table in the reply |

Lead with the answer: annotate the one notable point — never a number on every
point. Label the endpoint or the extreme; ticks and tooltips carry the rest.
The takeaway belongs in your reply, never a heading or caption inside the visual.

## Color by job

- **Sequential** — one hue in steps, for anything ordered, ranked, or measured
  by size, and for the parts of one whole. Steps come from
  `color-mix(in srgb, var(--chart-1) 60%, transparent)` in CSS; on canvas use
  the alpha helper in the area fragment. Three steps is the usual ladder:
  100%, 60%, 35%.
- **Categorical** — for genuinely independent series, in this order:
  `--chart-1` blue, then `--chart-4` violet, then `--chart-3` green, then
  `--chart-2` red **last**, only once there are four. `--chart-5` zinc is the
  neutral for context, baselines, "other", and "no data". Red enters last
  because red reads as a verdict; at four series add direct end labels so hue
  is not carrying the whole load.
- **Emphasis** — the emphasized mark `--chart-1`, everything else `--chart-5`.
  The period the question is about (today, this week) is always the emphasized
  mark.
- **Comparison pair** — this week against last, actual against baseline:
  `--chart-1` against `--chart-5`. Blue against gray, never blue against blue.
- **Parts of one whole** — a stacked share, a donut — is not categorical. It is
  one hue in sequential steps, because the slices are one measure cut up, not
  several independent things.
- **Red means negative.** `--chart-2` and `--error` are for the losing side of
  a diverging bar, a breached budget, a drop. A plain identity series does not
  borrow them, and `--success` / `--warning` / `--error` keep meaning good,
  stale, bad.
- If reordering the categories would change the meaning — funnel stages, tiers,
  age bands — they are ordered, so use a sequential ramp, not separate hues.
- Color follows the entity: filtering a series out never re-deals the others'
  colors.

**Series-count ladder**

| Series | What it needs |
| --- | --- |
| 1 | No legend. One label on the point that matters |
| 2–3 | Custom HTML legend, values in the legend labels |
| 4 | Red enters here, so add direct end labels beside the legend |
| 5+ | Stop. Emphasize one against `--chart-5`, or send it to a table |

## Marks

- **Bars** — sized to the slot: `categoryPercentage: 0.55` leaves the band's
  leftover as air at any count, and `maxBarThickness: 48` only stops a handful
  of bars going fat. `borderRadius: 4` rounds the data end only; the baseline
  stays square. Twelve or fewer categories take
  `ticks: { autoSkip: false, maxRotation: 45 }` so no label silently drops.
- **Stacked bars** never share an edge. Chart.js cuts the gap out of the mark
  rather than stroking it: `borderWidth: 2, borderColor: 'transparent',
  borderSkipped: false`. Grouped bars get their air from `barPercentage: 0.9`.
- **Lines** — 2px, round joins, straight segments (`tension: 0`). No fill
  unless the area is the point, and then at ~10%. A dashed stroke is reserved
  for a reference line (average, target), which always gets a legend entry.
- **Points** — at least 8px across (`radius: 4`), ringed in the backdrop
  (`borderColor` `--background` inline, `--surface` on a card, `borderWidth: 2`)
  so a dot on a line or a cluster of scatter points stays separate. Give sparse
  points a `hitRadius` of 12 or more; a pinpoint hover target is a broken one.
- **Gridlines and axes** — hairlines in `--chart-grid` on the value axis only,
  so they run across the bars: horizontal for a column chart, vertical for a
  horizontal bar chart. The category axis gets none, and there is no axis box
  or plot border. One y-axis, from zero, always labeled, ticks formatted with
  their unit in `--chart-label` at 11–12px. A date axis names the month at
  least once. Never two y-axes on one plot: split the chart, or index both
  series to 100 at the start.
- **Zero, but not a third of the plot empty.** Keep `beginAtZero: true` and add
  an explicit `max` just above the data when the automatic ceiling leaves the
  top of the chart bare — `suggestedMax` only raises a ceiling, it never lowers
  one. Scatter is the exception: both scales take `grace: '10%'` so no point
  sits on an edge.
- Text never wears the series color. When a mark needs naming in place, put a
  small dot in the series color beside `--muted-foreground` text.

## Legend

Skip it for a single series. For two or more, turn Chart.js's own legend off
(`legend: { display: false }`) and build one in HTML above the canvas: a swatch
beside 12px `--muted-foreground` text. The swatch matches the mark — a 10px box
at `calc(var(--radius) / 3)` for bars, areas, and slices; a 10px × 2px bar for
a line. `--radius` on a 10px box rounds it into a dot.

Carry the number in the legend label for anything categorical — `US $27.5K`,
not `US`. It is the only place a stacked or multi-series chart can state each
series' total without a number on every mark.

## Tooltips

- Multi-series charts set `interaction: { mode: 'index', intersect: false }` so
  one hover lists every series at that x. Scatter uses `mode: 'nearest'`.
- Format the value in a `tooltip.callbacks.label`. Every number that reaches
  the screen is rounded — tooltip callbacks included.
- A tooltip never gates a value. Hover-only numbers are gone in a screenshot,
  so the labelled point, the ticks, and the canvas fallback text carry them.
- Build tooltip and legend text with `textContent`, never `innerHTML`, when the
  label came from data rather than from you.

## Numbers

Round everything: `Math.round`, `toFixed(n)`, `toLocaleString()`. Whole dollars
in tiles and ticks, never cents. Compact above a thousand — `$8.1K`, `$1.2M`,
`12.9K`. Negative currency reads `-$5M`, never `$-5M`:

```
const signed = (value) =>
  (value < 0 ? '-$' : '$') + Math.abs(Math.round(value)).toLocaleString();
```

## Chart.js setup

Chart.js is the default for any chart with an axis. It sizes bars, ticks, and
labels, holds text at 12px at any width where hand-sized SVG text drifts, and
gives tooltips free. Hand-drawn inline SVG is for sparklines, meters, and tiny
marks with no axis text; HTML and CSS are for heat maps and dumbbells, which
need no scale engine at all.

- Pinned to `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`.
  Any URL outside the list under Maps is blocked. `visual` fence only — an
  artifact page has no network and draws its charts as inline SVG.
- The canvas needs a positioned wrapper with an explicit height, because
  `responsive: true` measures the parent:
  `<div style="position:relative;height:260px">`. That height includes the tick
  band, not just the plot. A horizontal bar chart wants `bars × 40 + 80` pixels.
- Always `responsive: true, maintainAspectRatio: false, animation: false`.
- The canvas carries `role="img"`, an `aria-label` stating the takeaway, and
  the numbers as its fallback text between the tags.
- Canvas cannot read `var()`. Read tokens once at the top of the script:

```
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, font] =
  ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
```

## Maps

A choropleth is a sequential chart whose categories happen to be places. Reach
for one only when the geography is the question — "where are we selling" — and
not to decorate a number three marketplaces could carry in a bar.

The geometry is real, fetched, and pinned. These five URLs are the entire
allowed network surface of a `visual` fence, and any other URL is blocked by
the frame's CSP — a hand-drawn coastline or a lookup to some other atlas will
simply not load:

| URL | What it is |
| --- | --- |
| `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` | Chart.js |
| `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js` | D3, for projection and path |
| `https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js` | TopoJSON → GeoJSON |
| `https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json` | US states topology |
| `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json` | World countries topology |

- **Never hand-draw coordinates.** A shape you invent is a country that does
  not exist. Project real topology or use a bar chart.
- **Key by the topology's own ids**, which are stable where names are not:
  US states carry a two-digit FIPS string id (`'06'` California) and
  `properties.name`; world countries carry a numeric ISO 3166-1 string id
  (`'840'` the United States, `'826'` the United Kingdom, `'276'` Germany) and
  `properties.name`. Match on the id and show the name.
- **Borders are the backdrop**, not ink: stroke every feature in `--background`
  at about 0.75px, so shapes separate without a cage of lines.
- Fill is the sequential ramp in **equal-count** bands, not equal-width ones.
  Revenue by place is always skewed; a linear ramp leaves forty states in the
  lightest step. A place with no data takes `--surface-secondary`, and the
  legend says so.
- Each feature gets a `<title>` so hovering names the place and its value, and
  the `<svg>` gets `role="img"` with an `aria-label` carrying the takeaway.
- **The fetch can fail.** Catch it and render a plate that states the answer in
  words. A visual that renders nothing is worse than one that renders a
  sentence.

## Before closing the fence

- [ ] One idea. Tiles above one chart, or one chart — the rest is reply text.
- [ ] Hidden summary `<h2>` first, `role="img"` + `aria-label` + fallback text
      on the canvas.
- [ ] No heading, caption, or prose in the body. No bordered wrapper.
- [ ] Every color, radius, pad, and gap is a `var(--…)`. No hex, no `rgb()`
      except the one the alpha helper computes for canvas.
- [ ] `animation: false`; Chart.js's own legend off.
- [ ] Every number rounded — ticks, labels, tooltips.
- [ ] Exactly one label on the chart, on the mark the question is about.
- [ ] Y axis from zero, one y-axis, hairlines on the value axis only.
- [ ] Legend only past one series, with values in the labels.
- [ ] A label that will not fit moves outside the bar or drops to the tooltip;
      it is never cropped by `overflow: hidden`.
- [ ] Red only where red means negative. Status colors mean status.
