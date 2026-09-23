# Haus visuals — marks and anatomy

Read [design-system.md](design-system.md) and [charts.md](charts.md) first.
This module is the geometry: the fixed mark specs, and the arithmetic that
turns data into coordinates. The data is the only thing allowed to be loud.

## The scaffolding

Every chart is one `<svg>` with a fixed viewBox, `width="100%"`, and no
`height` attribute:

```
<svg viewBox="0 0 736 240" width="100%" role="img"
     aria-label="Weekly revenue across eight weeks, last week highest at $8,100"
     style="font-family:var(--font-sans);display:block">
  <title>Weekly revenue, eight weeks</title>
  …
</svg>
```

- **The viewBox fixes the geometry, `width="100%"` fills the column, and the
  rendered height follows from the aspect ratio.** Never set a pixel `height`
  beside a percentage width on a plot. The drawing letterboxes: it keeps its
  aspect ratio, floats centered with dead space on both sides, and no longer
  lines up with the tiles above it. The one exception is a bare sparkline or
  meter, which stretches on purpose with `preserveAspectRatio="none"`.
- `viewBox` width is **736** by default; the viewBox height is whatever the
  chart needs and **includes the x-axis band**, not just the plot. A viewBox
  that fits the plot alone clips the axis labels.
- **Why 736: one SVG unit is one CSS pixel.** The reply column is 46rem, 736px,
  so a 736 viewBox renders at 1:1 and a 12px label is 12px on screen, the same
  small tier the app uses. A narrower column (a small window, a phone) scales
  the whole chart down together, text included, which keeps the proportions.
- **Type scale inside a chart:** 12px for ticks, axis labels, legends, and
  tooltip text; 14px is the base, as in the transcript; a direct label on a
  mark may be 13 or 14px. Nothing inside the plot goes larger, with one
  exception: a hero figure that is the chart's answer, like the total in a
  donut hole or the value on a meter, is sized like a tile value (28px), wears
  `--foreground`, and there is at most one per visual.
- `role="img"` plus an `aria-label` stating the takeaway, and a `<title>` as the
  first child. The visual still opens with the hidden summary `<h2>`.
- `font-family: var(--font-sans)` on the `<svg>`, or the text falls back to the
  browser's serif.

## The scale recipe

Compute every coordinate. A fragment's numbers are a derivation, not a
constant: copy its pixels with a different point count and the marks drift off
the axis.

```
const W = 736, H = 240;                  // the viewBox
const padL = 48, padR = 16, padT = 16, padB = 28;
const plotW = W - padL - padR;           // 672
const plotH = H - padT - padB;           // 196

const niceStep = (peak, intervals = 5) => {  // 1, 2 or 5 × 10^k
  const raw = peak / intervals;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
};
const peak = Math.max(...values);
const step = niceStep(peak);
const max = Math.ceil(peak / step) * step;
const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
const y = (v) => padT + plotH * (1 - v / max);

const slot = plotW / values.length;      // one band per category
const barW = Math.min(24, slot * 0.6);   // 24px is the hard cap
const x = (i) => padL + i * slot + (slot - barW) / 2;
```

- **The step is always 1, 2 or 5 times a power of ten, the axis runs from zero
  to the first multiple of the step at or above the peak, which gives three to
  five intervals; never hand-pick a step.** `niceStep` takes the smallest such
  step that fits the peak in five intervals, so a peak of 75 gets 20s to 80,
  $1,342 gets 500s to $1,500, and $8,100 gets 2,000s to $10,000. Draw one
  horizontal hairline per entry in `ticks`, with the value at `padL - 8`,
  right-aligned.
- **A diverging axis takes its step from the whole span, negative to positive,
  then mirrors the max on both sides.** Swings of +$62 and −$84 span 168, so the
  step is 50 and both arms run to $100: ticks at ±$100, ±$50 and $0.
- **One tick format per axis, chosen by the top tick.** Through 9,999, whole
  numbers with thousands separators: `$1,500`, not `$1.5K`. From 10,000,
  compact: `$12K`, `$1.2M`. A share axis reads in whole percents. Never mix
  formats on one axis: `$0 / $500 / $1,000 / $1,500`, not `$1K` beside `$1,500`.
- **A line or area** uses point centers instead of bar slots:
  `x = padL + i * (plotW / (points.length - 1))`.
- **A horizontal bar chart** swaps the axes: row height 32 to 40px, bar
  thickness still at most 24px, `width = plotW * v / max`, and the hairlines run
  vertically.
- **Padding follows the labels.** `padL` is wide enough for the longest tick
  (`chars × 6.3 + 8` at 12px); `padB` holds the category labels; `padT` holds
  the one direct label above the tallest mark.
- Round the numbers you write into the markup to one decimal. Coordinates with
  twelve decimals are noise in the diff and in the reply.

**Show the derivation.** Every chart fence carries one comment naming the
numbers it computed, so the next reader can check the arithmetic instead of
trusting the pixels:

```
<!-- scale: 8 bars · plot 672×196 in 736×240 · slot 84 · bar 24 · peak $8,100 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,620) = 2,000 → max = first multiple at or above the peak = 10,000 → step 2000 · max 10000 · ticks $0/$2K/$4K/$6K/$8K/$10K -->
```

Write the pair as `step <n> · max <n>`, bare numbers, once per value axis, and
add `· mirrored` on a diverging axis: the fragment lint reads that spelling.

It is the only comment a visual body may carry.

## Mark specs

| Mark | Spec |
| --- | --- |
| Bar, column | **At most 24px** thick, and never filling the slot: the band's leftover is air. 4px rounded at the data end, square at the baseline |
| Line | 2px, `stroke-linejoin="round"`, `stroke-linecap="round"`, straight segments, no curve fitting |
| Marker, end dot | `r="4"` with a 2px `--background` ring (`--surface` on a card), so a dot stays legible where it crosses a line |
| Area fill | the series hue at about 10%: `color-mix(in srgb, var(--chart-1) 10%, transparent)`, a wash and never a block |
| Gridlines | horizontal hairlines in `--chart-grid` on the value axis only, 1px, solid. No axis lines, no plot border, no box |
| Axis labels | 12px in `--chart-label`, `font-variant-numeric: tabular-nums` |
| Reference line | the one place a dash belongs, in `--chart-5`, and it always gets a legend entry |

A bar rounded at the data end only is one path, not a `<rect>` with a radius:

```
const bar = (x, yTop, w, yBase) => {
  const r = Math.min(4, w / 2, yBase - yTop);
  return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop}
          H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
};
```

**The 2px gap does the separating.** Touching marks, the segments of a stacked
bar and two adjacent bars in a group, are held apart by a 2px gap painted in
`--surface`, the same width everywhere in the chart. Never stroke a border
around a mark to separate it: a stroke is ink that is not data.

## Axes and labels

- **One y-axis by default.** A second axis only when the user asks for bars and
  a line together; then draw [combo-bar-line](fragments/combo-bar-line.md) with
  both axes zero-based, or prefer paired panels sharing an x axis. Two scales
  nobody asked for invent a correlation that is not in the data.
- The y axis starts at zero and ends at `max`, so the tallest mark sits at or
  under the top tick. An axis whose floor is the data's, a scatter's measure
  against a measure, starts at the step multiple at or below the minimum.
- A date axis names the month at least once. Twelve or fewer categories all get
  a label; past that, label every other one rather than rotating text.
- **Label selectively.** One direct label per chart: the endpoint, the extreme,
  or the one series the story is about. A number beside every mark is chaos and
  goes unread; the ticks and the tooltip carry the rest.
- A label only goes inside a bar when the rendered text fits with padding on
  both sides (`chars × 6.3 + 8 ≤ bar length` at 12px). Otherwise it moves
  outside the bar end, or drops to the tooltip. Never crop it with
  `overflow: hidden`.
- **When end labels converge, do not stack them.** Nudging labels apart
  vertically detaches them from their lines. Draw a leader line from the label
  to the line end, or facet into small multiples. Past about four converging
  series, small multiples is the answer.
- **Text never wears the series color.** Marks carry the hue; labels, values,
  and legends take `--foreground`, `--muted-foreground`, or `--chart-label`.
  Identity comes from a small mark beside the text. The one exception is a label
  set inside a filled segment, which takes the contrast color of that fill.

## Legend

Skip it for a single series: one color means the title already says what is
plotted. For two or more, build it in HTML above the `<svg>`: a swatch beside
12px `--muted-foreground` text. The swatch matches the mark: a 10px box at
`calc(var(--radius) / 3)` for bars, areas, and slices; a 10px × 2px bar for a
line; `--radius` on a 10px box rounds it into a dot.

Carry the number in the legend label for anything categorical: `US $27.5K`,
not `US`. It is the only place a stacked or multi-series chart states each
series' total without a number on every mark.

## Figures, when the form is a number

- **Stat tile**: title (12px `--muted-foreground`) → value (24–36px, weight
  500, proportional figures) → one chip, all worded per the tile grammar in
  [components](components.md). Never `tabular-nums` on a display value:
  equal-width digits make `121` look loose.
- **Meter**: track and fill are the same hue, the track a light step of it. Both
  numbers are stated in text beside it.
- **Sparkline**: a dozen points, no axes, no text, `vector-effect="non-scaling-stroke"`
  so the stroke stays 2px at any width.
