# Haus visuals — charts

Read [design-system.md](design-system.md) first. This module picks the form and
assigns the color. The geometry is in
[marks-and-anatomy.md](marks-and-anatomy.md), the hover layer is in
[interaction.md](interaction.md), and the finished chart is checked against
[anti-patterns.md](anti-patterns.md).

Charts are hand-written inline SVG. Read the ONE fragment file the index points
at — two at most — and change its data. The fragments are the house style;
improvising from the prose is how five agents produce five looks.

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
| Two measures in different units, same period | [paired-panels](fragments/paired-panels.md) |
| Bars and a line on two axes, when asked | [combo-bar-line](fragments/combo-bar-line.md) |
| What share of the whole, at a glance | [donut](fragments/donut.md) |
| Who is above and below a baseline | [diverging-bar](fragments/diverging-bar.md) |
| What changed per item, before → after | [dumbbell](fragments/dumbbell.md) |
| Where two measures relate | [scatter-bubble](fragments/scatter-bubble.md) |
| Which weekday-by-week cells run hot | [heat-map](fragments/heat-map.md) |
| Where in the US it sells | [map-us-states](fragments/map-us-states.md) |
| Where in the world it sells | [map-world-countries](fragments/map-world-countries.md) |
| A shape beside a number | [sparkline](fragments/sparkline.md) |

**If no row matches, do not improvise.** Take the nearest fragment by mark type
(bar, line, area, or cell), keep its scaffolding, and change only the data and
the scales. Two different shapes are two panels by default:
[paired-panels](fragments/paired-panels.md) is the worked example, and
[combo-bar-line](fragments/combo-bar-line.md) is the one plot that carries two
axes, drawn when the user asks for it.

## Is it a chart?

| What you have | What it is |
| --- | --- |
| One number | A stat tile — never a one-bar chart or a two-slice pie |
| One number against a limit | A meter (components.md), never a pie |
| A few headline numbers | A KPI row (components.md) |
| "How is X doing", any period question | A KPI row above one chart, tiles per the tile grammar |
| More than ~7 classes | A Markdown table in the reply |

## The job → the form

| What the reader must do | Form | Color job |
| --- | --- | --- |
| Compare magnitude, low to high | Bar, or a heat map for a grid | Sequential |
| Follow a trend over time | Line; area when the volume is the point | One hue |
| Tell independent series apart | Grouped bar, stacked bar, multi-line | Categorical |
| See that one series is the point | Emphasis: one mark lit, the rest gray | `--chart-1` against `--chart-5` |
| Read above and below a baseline | Diverging bar | Diverging |
| Read part-to-whole | Stacked bar, or a donut at a glance | Sequential steps |
| Compare before and after per item | Dumbbell | One hue, two steps |
| Compare two measures in different units | Paired panels on a shared x axis | Categorical |
| Overlay two measures on one plot, when asked | Bars on the left axis, a line on the right | Categorical |

Sequential is the safe default: one hue, more is darker, hard to misread. Reach
for categorical only when the series themselves are the subject, and for
emphasis when the story is that one of them moved. Emphasis is the most
underused form and usually the honest answer to "make this chart clearer".

Lead with the answer: annotate the one notable point — never a number on every
point. Label the endpoint or the extreme; ticks and the tooltip carry the rest.
The takeaway belongs in your reply, never a heading or caption inside the visual.

## Color by job

Every color is a token. Never invent one, never mix a new hue, never reorder the
slots. The palette is validated in the repo, so a token is already safe and a
value you pick is not.

- **Categorical** — for genuinely independent series, in numeric order:
  `--chart-1` blue, then `--chart-2` orange, then `--chart-3` aqua, then
  `--chart-4` yellow. The order is fixed and never cycled. A fifth series folds
  into "Other" in `--chart-5`, or the chart becomes small multiples.
- **Sequential** — one hue in steps, for anything ordered, ranked, or measured
  by size, and for the parts of one whole. Step it toward transparent:
  `color-mix(in srgb, var(--chart-1) 60%, transparent)`. Three steps is the
  usual ladder: 100%, 60%, 35%.
- **Diverging** — `--chart-1` for the cool pole, `--chart-2` for the warm one,
  and `color-mix(in srgb, var(--chart-5) 45%, transparent)` as the neutral
  midpoint. The midpoint must read as nothing; two cool hues as the two poles
  read as two flavors of the same thing.
- **Emphasis** — the emphasized mark `--chart-1`, everything else `--chart-5`.
  The period the question is about (today, this week) is always the emphasized
  mark.
- **Comparison pair** — this week against last, actual against baseline:
  `--chart-1` against `--chart-5`. Blue against gray, never blue against blue.
- **Status** — `--success`, `--warning`, and `--error` mean good, stale, bad.
  They are reserved for state and never carry a series, and a series never
  borrows them. Status always ships with a label, never color alone.
- **Parts of one whole** — a stacked share, a donut — is not categorical. It is
  one hue in sequential steps, because the slices are one measure cut up, not
  several independent things.
- If reordering the categories would change the meaning — funnel stages, tiers,
  age bands — they are ordered, so use a sequential ramp, not separate hues.
- Color follows the entity: filtering a series out never re-deals the others'
  colors.
- `--chart-5` zinc is the neutral for context, baselines, "other", and "no
  data". Text never wears any of them.

**Series-count ladder**

| Series | What it needs |
| --- | --- |
| 1 | No legend. One label on the point that matters |
| 2–3 | An HTML legend above the plot, values in the legend labels |
| 4 | Yellow enters here, so add direct end labels beside the legend |
| 5+ | Stop. Fold the tail into "Other" in `--chart-5`, emphasize one, or send it to a table |

## Numbers

Round everything: `Math.round`, `toFixed(n)`, `toLocaleString()`. Whole dollars
in tiles and ticks, never cents. Tiles and axes share one format: whole numbers
with thousands separators through 9,999, compact from 10,000 with at most one
decimal and no trailing zero (`$6,630`, `$14.4K`, `$28K`), one format per axis,
per the tick rule in [marks and anatomy](marks-and-anatomy.md). A tile's title
and chip follow the tile grammar in [components](components.md). Negative
currency reads `-$5M`, never `$-5M`:

```
const signed = (value) =>
  (value < 0 ? '-$' : '$') + Math.abs(Math.round(value)).toLocaleString();
```

Values on the page take `font-variant-numeric: tabular-nums` wherever they line
up in a column: axis ticks, legend values, tooltip rows.

## Maps

A choropleth is a sequential chart whose categories happen to be places. Reach
for one only when the geography is the question — "where are we selling" — and
not to decorate a number three marketplaces could carry in a bar.

The geometry is real, fetched, and pinned. These four URLs are the entire
allowed network surface of a `visual` fence, and any other URL is blocked by
the frame's CSP — a hand-drawn coastline or a lookup to some other atlas will
simply not load:

| URL | What it is |
| --- | --- |
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
- An artifact page has no network at all, so it draws its data as inline SVG and
  never a map.

## Before closing the fence

- [ ] One idea. Tiles above one chart, or one chart — the rest is reply text.
- [ ] Hidden summary `<h2>` first; `role="img"`, an `aria-label` stating the
      takeaway, and a `<title>` first child on the `<svg>`.
- [ ] Every coordinate derived from the data, with the `<!-- scale: … -->`
      comment showing the derivation.
- [ ] Ticks from the rule: step = the smallest of 1, 2, 5 × 10^k at or above
      peak/5, max = the first multiple of it at or above the peak.
- [ ] No heading, caption, or prose in the body. No bordered wrapper.
- [ ] Every color, radius, pad, and gap is a `var(--…)`. No hex, no `rgb()`.
- [ ] Bars at most 24px wide; 4px rounded at the data end, square at the baseline.
- [ ] The hover layer is present, with the tooltip on a `--surface` plate.
- [ ] Every number rounded — ticks, labels, tooltip.
- [ ] Exactly one label on the chart, on the mark the question is about.
- [ ] Y axis from zero, one y-axis unless the user asked for bars and a line
      together, hairlines on the value axis only.
- [ ] Legend only past one series, with values in the labels.
- [ ] A label that will not fit moves outside the bar or drops to the tooltip;
      it is never cropped by `overflow: hidden`.
- [ ] Categorical hues in numeric order. Status colors mean status.
