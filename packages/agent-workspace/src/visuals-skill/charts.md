# Haus visuals — charts

Read [design-system.md](design-system.md) first; this module adds the chart
rules and the copy-ready fragments. Every fragment below is a complete `visual`
fence body: change the data, keep the structure.

## Is it a chart?

| What you have | What it is |
| --- | --- |
| One number | A stat tile — never a one-bar chart or a two-slice pie |
| One number against a limit | A meter (components.md), never a pie |
| A few headline numbers | A KPI row (components.md) |
| "How is X doing", any period question | A KPI row above one chart |
| More than ~7 classes | A Markdown table in the reply |

Then pick the mark from the question, not from the data shape:

| The question | The mark | Color job |
| --- | --- | --- |
| How big is each, ranked | Ranked horizontal bar | Sequential |
| How did it move over time | Line; area when one series and the volume is the point | Sequential |
| This period against last | Grouped bar | `--chart-1` vs `--chart-5` |
| This one against its history | Emphasis bar | `--chart-1` vs `--chart-5` |
| How do independent series compare | Grouped bar, multi-line | Categorical |
| How does the mix shift | Stacked bar | Categorical |
| What share of the whole, at a glance | Donut, ≤6 slices | Sequential |
| Who is above and below a baseline | Diverging bar | `--chart-1` / `--chart-2` |
| What changed per item, before → after | Dumbbell | One hue, two steps |
| Where two measures relate | Scatter or bubble | One hue |
| Which day-by-week cells run hot | Heat map | Sequential |
| A shape beside a number | Sparkline | One hue |

Lead with the answer: annotate the one notable point — never a number on every
point. Label the endpoint or the extreme; ticks and tooltips carry the rest.
The takeaway belongs in your reply, never a heading or caption inside the visual.

## Color by job

- **Sequential** — one hue in steps, for anything ordered or measured by size.
  Steps come from `color-mix(in srgb, var(--chart-1) 45%, transparent)` in CSS;
  on canvas use the alpha helper in the area fragment below.
- **Categorical** — `--chart-1` through `--chart-4`, in that order, for
  genuinely independent series. Five hues is the ceiling. Color follows the
  entity: filtering a series out never re-deals the others' colors.
- **Emphasis** — the emphasized mark `--chart-1`, everything else `--chart-5`.
  The period the question is about (today, this week) is always the emphasized
  mark.
- **Comparison pair** — this week against last, actual against baseline:
  `--chart-1` against `--chart-5`. Blue against gray, never blue against blue.
- **Diverging** — above and below a baseline: `--chart-1` one way, `--chart-2`
  the other, `--chart-5` at the zero line. Equal steps on each arm if you tint
  them. Never use `--chart-2` and `--chart-3` as a two-color pair; red against
  green is the one pairing a color-blind reader cannot split.
- **Status colors are reserved.** `--success` / `--warning` / `--error` mean
  good, stale, bad. A plain identity series never borrows them, and a series
  color never implies a verdict.
- If reordering the categories would change the meaning — funnel stages, tiers,
  age bands — they are ordered, so use a sequential ramp, not separate hues.

**Series-count ladder**

| Series | What it needs |
| --- | --- |
| 1 | No legend. One label on the point that matters |
| 2–3 | Custom HTML legend, values in the legend labels |
| 4 | Legend or direct end labels; past this, lines need dash patterns too |
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
  one. Scatter is the exception: both scales take
  `grace: '10%'` so no point sits on an edge.
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
  Any other URL is blocked. `visual` fence only — an artifact page has no
  network and draws its charts as inline SVG.
- The canvas needs a positioned wrapper with an explicit height, because
  `responsive: true` measures the parent: `<div style="position:relative;height:260px">`.
  That height includes the tick band, not just the plot. A horizontal bar chart
  wants `bars × 40 + 80` pixels.
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
- [ ] Y axis from zero, one y-axis, horizontal hairlines only.
- [ ] Legend only past one series, with values in the labels.
- [ ] A label that will not fit moves outside the bar or drops to the tooltip;
      it is never cropped by `overflow: hidden`.
- [ ] Status colors mean status. Series colors mean identity.

## Fragments

### Emphasis bar

One series, one question: the asked-about period in `--chart-1`, its history in
`--chart-5`, and the single label on the mark that answers it.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week brought in $8,100, the shop's best week since July.</h2>
<div style="position:relative;height:250px">
  <canvas id="weeks" role="img" aria-label="Weekly revenue across eight weeks, last week the highest at $8,100">Weekly revenue: $6,180, $5,940, $6,720, $6,410, $7,050, $6,880, $7,320, $8,100.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, ink, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--foreground', '--font-sans'].map(token);
const weeks = ['Jul 21', 'Jul 28', 'Aug 4', 'Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8'];
const revenue = [6180, 5940, 6720, 6410, 7050, 6880, 7320, 8100];
const focus = revenue.length - 1;
const money = (value) => '$' + Math.round(value).toLocaleString();
const callout = {
  id: 'callout',
  afterDatasetsDraw(chart) {
    const bar = chart.getDatasetMeta(0).data[focus];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'center';
    ctx.fillText(money(revenue[focus]), bar.x, bar.y - 8);
    ctx.restore();
  }
};
new Chart(document.getElementById('weeks'), {
  type: 'bar',
  data: { labels: weeks, datasets: [{ data: revenue, backgroundColor: revenue.map((_, index) => (index === focus ? c1 : c5)), borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 20 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 }, maxRotation: 45 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  },
  plugins: [callout]
});
</script>
```

### Grouped bar

This period against the prior one: two series, so a hand-built legend.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week's revenue beat the prior week every day but Tuesday.</h2>
<div style="display:flex;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Last week $6,940</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>Prior week $6,545</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="wk" role="img" aria-label="Daily revenue, last week ahead of the prior week every day but Tuesday">Last week $6,940, prior week $6,545.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const money = (value) => '$' + Math.round(value).toLocaleString();
new Chart(document.getElementById('wk'), {
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      { label: 'Last week', data: [1061, 1014, 884, 1015, 866, 938, 1162], backgroundColor: c1, borderRadius: 4, maxBarThickness: 48 },
      { label: 'Prior week', data: [932, 1162, 858, 983, 741, 732, 1137], backgroundColor: c5, borderRadius: 4, maxBarThickness: 48 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```

### Stacked bar

How the mix shifts. Categorical colors in order, the 2px separation cut out of
the mark, and each series' total in the legend so no bar needs a number on it.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The US carries about 78% of revenue every month, and all three marketplaces grew into September.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>US $27.5K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-2)"></span>GB $4.3K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-3)"></span>DE $3.6K</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="mix" role="img" aria-label="Monthly revenue split by marketplace, the US holding about 78% of the total every month">US $27.5K, GB $4.3K, DE $3.6K over six months.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c2, c3, grid, label, font] = ['--chart-1', '--chart-2', '--chart-3', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const money = (value) => '$' + Math.round(value).toLocaleString();
const series = { DE: [520, 560, 610, 590, 640, 700], GB: [640, 710, 680, 720, 760, 810], US: [4120, 4380, 4650, 4410, 4820, 5130] };
const bar = (name, color) => ({ backgroundColor: color, borderColor: 'transparent', borderSkipped: false, borderWidth: 2, data: series[name], label: name, maxBarThickness: 48 });
const stackTop = { ...bar('DE', c3), borderRadius: { topLeft: 4, topRight: 4 } };
new Chart(document.getElementById('mix'), {
  type: 'bar',
  data: { labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], datasets: [bar('US', c1), bar('GB', c2), stackTop] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } },
      y: { stacked: true, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```

### Ranked horizontal bar

Top N, sorted, value at the bar end. The value axis goes away entirely — the
numbers are on the bars, so gridlines would only add noise. Long names truncate
in the tick and come back whole in the tooltip.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The grandson baseball tee leads the last seven days at $234, about 17% ahead of the next product.</h2>
<div style="position:relative;height:400px">
  <canvas id="top" role="img" aria-label="Top eight products by revenue over seven days, led by the grandson baseball tee at $234">Top products: $234, $200, $160, $160, $92, $85, $85, $81.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, label, ink, font] = ['--chart-1', '--chart-label', '--foreground', '--font-sans'].map(token);
const rows = [
  { revenue: 234, title: "That's My Grandson Out There Baseball Grandma" },
  { revenue: 200, title: 'Mama Bee Shirt Family Bee First Bee Day Outfits' },
  { revenue: 160, title: 'Family Bee Shirts Dad Daddy First Bee Day Outfit' },
  { revenue: 160, title: 'Mermaid Security Shirt Swimmer Dad Merdad Trident' },
  { revenue: 92, title: 'Halloween Ghost Reading Read More Books Librarian' },
  { revenue: 85, title: 'I Need Baseball And Jesus Sports Mom Gift' },
  { revenue: 85, title: "I'm Not Gay I'm Super Gay LGBT Pride Rainbow" },
  { revenue: 81, title: 'Boss Of The Toss Funny Cornhole Gifts For Men' }
];
const money = (value) => '$' + Math.round(value).toLocaleString();
const clip = (text) => (text.length > 30 ? text.slice(0, 29) + '…' : text);
const ends = {
  id: 'ends',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const [index, bar] of chart.getDatasetMeta(0).data.entries()) {
      ctx.fillText(money(rows[index].revenue), bar.x + 8, bar.y);
    }
    ctx.restore();
  }
};
new Chart(document.getElementById('top'), {
  type: 'bar',
  data: { labels: rows.map((row) => row.title), datasets: [{ data: rows.map((row) => row.revenue), backgroundColor: c1, borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 52 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.x) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.7 } },
    scales: {
      x: { display: false, beginAtZero: true },
      y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 }, callback: (value, index) => clip(rows[index].title) } }
    }
  },
  plugins: [ends]
});
</script>
```

### Trend line

One series with a dashed average reference line. The reference gets a legend
entry — a dashed stroke means nothing unnamed — and the endpoint carries the
one label, ringed in the backdrop so it sits above the line.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Revenue finished the 30 days at $1,088, about 11% above the period average of $976.</h2>
<div style="display:flex;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Daily revenue</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>30-day average $976</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="trend" role="img" aria-label="Daily revenue over 30 days, ending at $1,088 against a $976 average">Daily revenue ranged $654 to $1,434 and ended at $1,088; the average was $976.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, ink, ground, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--foreground', '--background', '--font-sans'].map(token);
const days = ['Aug 17', 'Aug 18', 'Aug 19', 'Aug 20', 'Aug 21', 'Aug 22', 'Aug 23', 'Aug 24', 'Aug 25', 'Aug 26', 'Aug 27', 'Aug 28', 'Aug 29', 'Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11', 'Sep 12', 'Sep 13', 'Sep 14', 'Sep 15'];
const revenue = [811, 654, 925, 1086, 1434, 1281, 873, 922, 991, 704, 856, 1073, 1049, 812, 744, 918, 1002, 869, 1124, 1288, 947, 806, 878, 1035, 1160, 902, 831, 1009, 1213, 1088];
const money = (value) => '$' + Math.round(value).toLocaleString();
const average = Math.round(revenue.reduce((sum, value) => sum + value, 0) / revenue.length);
const last = revenue.length - 1;
const endLabel = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const point = chart.getDatasetMeta(0).data[last];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(money(revenue[last]), point.x + 10, point.y);
    ctx.restore();
  }
};
new Chart(document.getElementById('trend'), {
  type: 'line',
  data: {
    labels: days,
    datasets: [
      { label: 'Daily revenue', data: revenue, borderColor: c1, borderWidth: 2, tension: 0, pointRadius: revenue.map((_, index) => (index === last ? 4 : 0)), pointHoverRadius: 4, pointBackgroundColor: c1, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 },
      { label: '30-day average', data: revenue.map(() => average), borderColor: c5, borderWidth: 2, borderDash: [4, 4], tension: 0, pointRadius: 0, pointHoverRadius: 0 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 52 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  },
  plugins: [endLabel]
});
</script>
```

### Multi-line

Up to four independent series in categorical order, named at the line end by a
dot in the series color beside neutral text — the text never wears the color.
Past four series, add dash patterns or split the chart.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Harvest tees hold the lowest ACOS at 17%, while the holiday push climbed to 41% over the last eight weeks.</h2>
<div style="position:relative;height:260px">
  <canvas id="acos" role="img" aria-label="Weekly ACOS for four campaigns, harvest tees lowest at 17% and holiday push highest at 41%">Week 8 ACOS: harvest tees 17%, bee family 24%, dog lovers 31%, holiday push 41%.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c2, c3, c4, grid, label, muted, ground, font] = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-grid', '--chart-label', '--muted-foreground', '--background', '--font-sans'].map(token);
const campaigns = [
  { color: c1, name: 'Harvest tees', values: [24, 23, 21, 22, 20, 19, 18, 17] },
  { color: c2, name: 'Bee family', values: [21, 22, 24, 23, 25, 24, 25, 24] },
  { color: c3, name: 'Dog lovers', values: [29, 28, 30, 29, 31, 30, 32, 31] },
  { color: c4, name: 'Holiday push', values: [33, 34, 36, 35, 38, 39, 40, 41] }
];
const percent = (value) => Math.round(value) + '%';
const endNames = {
  id: 'endNames',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '12px ' + font;
    ctx.textBaseline = 'middle';
    for (const [index, campaign] of campaigns.entries()) {
      const point = chart.getDatasetMeta(index).data.at(-1);
      ctx.fillStyle = campaign.color;
      ctx.beginPath();
      ctx.arc(point.x + 10, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText(campaign.name, point.x + 18, point.y);
    }
    ctx.restore();
  }
};
new Chart(document.getElementById('acos'), {
  type: 'line',
  data: {
    labels: ['Jul 21', 'Jul 28', 'Aug 4', 'Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8'],
    datasets: campaigns.map((campaign) => ({ label: campaign.name, data: campaign.values, borderColor: campaign.color, borderWidth: 2, tension: 0, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: campaign.color, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 108 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + percent(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 8 } },
      y: { beginAtZero: true, max: 50, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, stepSize: 10, callback: (value) => percent(value) } }
    }
  },
  plugins: [endNames]
});
</script>
```

### Area

One series where the volume is the point. Canvas cannot parse `color-mix()`, so
paint the token onto a 1px canvas and read the pixel back — the one helper that
works whether the theme resolves the token to hex or to `oklch()`.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Royalties totalled $5,791 over the 30 days and ended the period at $218 a day.</h2>
<div style="position:relative;height:240px">
  <canvas id="royalties" role="img" aria-label="Daily royalties over 30 days, totalling $5,791 and ending at $218">Daily royalties ran $121 to $283 and totalled $5,791.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, grid, label, ground, font] = ['--chart-1', '--chart-grid', '--chart-label', '--background', '--font-sans'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const days = ['Aug 17', 'Aug 18', 'Aug 19', 'Aug 20', 'Aug 21', 'Aug 22', 'Aug 23', 'Aug 24', 'Aug 25', 'Aug 26', 'Aug 27', 'Aug 28', 'Aug 29', 'Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11', 'Sep 12', 'Sep 13', 'Sep 14', 'Sep 15'];
const royalties = [166, 128, 181, 219, 283, 243, 121, 184, 213, 127, 191, 206, 242, 165, 149, 188, 204, 174, 231, 259, 192, 161, 176, 209, 236, 183, 168, 205, 245, 218];
const money = (value) => '$' + Math.round(value).toLocaleString();
new Chart(document.getElementById('royalties'), {
  type: 'line',
  data: { labels: days, datasets: [{ label: 'Royalties', data: royalties, borderColor: c1, borderWidth: 2, tension: 0, fill: true, backgroundColor: fade(c1, 0.1), pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: c1, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```

### Donut

Part-to-whole at a glance, never for comparing close values — two slices within
a few percent of each other are a ranked bar. Six slices is the ceiling, the
total sits in the middle, and the percentages live in the legend.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tees are 58% of the 1,450 units sold over the 30 days; everything else trails well behind.</h2>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--gap-lg)">
  <div style="position:relative;width:200px;height:200px;flex:0 0 auto">
    <canvas id="mixdonut" role="img" aria-label="Unit mix over 30 days: tees 58%, hoodies 17%, tanks 11%, mugs 8%, totes 6%">Tees 841, hoodies 247, tanks 160, mugs 116, totes 86.</canvas>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
      <div style="font-size:24px;font-weight:500;line-height:1.1">1,450</div>
      <div style="font-size:12px;color:var(--muted-foreground)">units</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--gap-xs) var(--gap-sm);flex:1 1 260px">
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Tees 58%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 80%, transparent)"></span>Hoodies 17%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 62%, transparent)"></span>Tanks 11%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 46%, transparent)"></span>Mugs 8%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 33%, transparent)"></span>Totes 6%</span>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, ground] = ['--chart-1', '--background'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const slices = [
  { name: 'Tees', units: 841 },
  { name: 'Hoodies', units: 247 },
  { name: 'Tanks', units: 160 },
  { name: 'Mugs', units: 116 },
  { name: 'Totes', units: 86 }
];
const total = slices.reduce((sum, slice) => sum + slice.units, 0);
new Chart(document.getElementById('mixdonut'), {
  type: 'doughnut',
  data: { labels: slices.map((slice) => slice.name), datasets: [{ data: slices.map((slice) => slice.units), backgroundColor: [1, 0.8, 0.62, 0.46, 0.33].map((alpha) => fade(c1, alpha)), borderColor: ground, borderWidth: 2 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    cutout: '62%',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.label + ': ' + Math.round(item.parsed).toLocaleString() + ' units, ' + Math.round((item.parsed / total) * 100) + '%' } } }
  }
});
</script>
```

### Scatter and bubble

Two measures against each other, one bubble per campaign sized by units.
`grace: '10%'` keeps air on every side without forcing ugly end ticks, each
point is ringed in the backdrop, and the hover radius is one a finger could
hit. Scatter has no series to name, so the one label goes on the extreme.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Spend and ACOS barely track each other: the two biggest spenders sit at opposite ends of efficiency.</h2>
<div style="position:relative;height:280px">
  <canvas id="spend" role="img" aria-label="Campaign spend against ACOS, with the largest spender also the least efficient at 41%">Harvest tees $410 at 17%, bee family $530 at 24%, dog lovers $290 at 31%, holiday push $780 at 41%, cornhole $160 at 28%, mermaid $240 at 22%.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, grid, label, ink, ground, font] = ['--chart-1', '--chart-grid', '--chart-label', '--foreground', '--background', '--font-sans'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const campaigns = [
  { acos: 17, name: 'Harvest tees', spend: 410, units: 96 },
  { acos: 24, name: 'Bee family', spend: 530, units: 88 },
  { acos: 31, name: 'Dog lovers', spend: 290, units: 41 },
  { acos: 41, name: 'Holiday push', spend: 780, units: 74 },
  { acos: 28, name: 'Cornhole', spend: 160, units: 24 },
  { acos: 22, name: 'Mermaid', spend: 240, units: 47 }
];
const worst = campaigns.reduce((leader, campaign) => (campaign.acos > leader.acos ? campaign : leader));
const callout = {
  id: 'callout',
  afterDatasetsDraw(chart) {
    const index = campaigns.indexOf(worst);
    const point = chart.getDatasetMeta(0).data[index];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(worst.name + ' ' + worst.acos + '%', point.x - point.options.radius - 8, point.y + 5);
    ctx.restore();
  }
};
new Chart(document.getElementById('spend'), {
  type: 'bubble',
  data: { datasets: [{ label: 'Campaigns', data: campaigns.map((campaign) => ({ campaign: campaign.name, r: Math.max(6, Math.round(Math.sqrt(campaign.units) * 1.4)), x: campaign.spend, y: campaign.acos })), backgroundColor: fade(c1, 0.55), borderColor: ground, borderWidth: 2, hoverBackgroundColor: c1 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.raw.campaign + ': $' + Math.round(item.raw.x).toLocaleString() + ' spend, ' + Math.round(item.raw.y) + '% ACOS' } } },
    scales: {
      x: { grace: '10%', grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 6, callback: (value) => '$' + Math.round(value).toLocaleString() } },
      y: { grace: '10%', grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => Math.round(value) + '%' } }
    }
  },
  plugins: [callout]
});
</script>
```

### Diverging bar

Movement above and below a baseline: `--chart-1` for up, `--chart-2` for down,
and a `--chart-5` line at zero. The axis is the change, not the level, so the
label says so.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Four products gained on last week and two lost; the mermaid tee swung furthest, down $84.</h2>
<div style="position:relative;height:320px">
  <canvas id="delta" role="img" aria-label="Revenue change against last week per product, four up and two down, the mermaid tee furthest down at minus $84">Grandson tee +$62, bee family +$48, cornhole +$31, ghost reading +$12, dog lovers -$37, mermaid -$84.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c2, c5, grid, label, font] = ['--chart-1', '--chart-2', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const rows = [
  { change: 62, title: 'Grandson baseball tee' },
  { change: 48, title: 'Bee family tee' },
  { change: 31, title: 'Cornhole tee' },
  { change: 12, title: 'Ghost reading tee' },
  { change: -37, title: 'Dog lovers tee' },
  { change: -84, title: 'Mermaid security tee' }
];
const signed = (value) => (value === 0 ? '$0' : (value < 0 ? '-$' : '+$') + Math.abs(Math.round(value)).toLocaleString());
new Chart(document.getElementById('delta'), {
  type: 'bar',
  data: { labels: rows.map((row) => row.title), datasets: [{ data: rows.map((row) => row.change), backgroundColor: rows.map((row) => (row.change < 0 ? c2 : c1)), borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => signed(item.parsed.x) + ' against last week' } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.7 } },
    scales: {
      x: { grid: { color: (context) => (context.tick.value === 0 ? c5 : grid), lineWidth: (context) => (context.tick.value === 0 ? 1.5 : 1) }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 7, callback: (value) => signed(value) } },
      y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } }
    }
  }
});
</script>
```

### Dumbbell

Before against after, one row per item. No scale engine needed: HTML positions
both dots as a percentage of the row, so the labels stay real text at real
sizes. The connector is the story — length is the change.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Four of five products gained units after the September price cut; only the mermaid tee slipped.</h2>
<div style="display:flex;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:50%;background:color-mix(in srgb, var(--chart-1) 38%, transparent)"></span>August</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:50%;background:var(--chart-1)"></span>September</span>
</div>
<div style="display:grid;gap:var(--gap-sm)" id="dumbbell"></div>
<script>
const rows = [
  { after: 148, before: 96, name: 'Grandson baseball tee' },
  { after: 121, before: 88, name: 'Bee family tee' },
  { after: 74, before: 41, name: 'Dog lovers tee' },
  { after: 39, before: 24, name: 'Cornhole tee' },
  { after: 38, before: 47, name: 'Mermaid security tee' }
];
const max = Math.ceil(Math.max(...rows.flatMap((row) => [row.before, row.after])) / 20) * 20;
const at = (value) => (value / max) * 100;
const host = document.getElementById('dumbbell');
for (const row of rows) {
  const line = document.createElement('div');
  line.style.cssText = 'display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 52px;align-items:center;gap:var(--gap-sm)';
  const name = document.createElement('div');
  name.style.cssText = 'font-size:12px;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  name.textContent = row.name;
  name.title = row.name;
  const track = document.createElement('div');
  track.style.cssText = 'position:relative;height:16px';
  const low = Math.min(at(row.before), at(row.after));
  const span = Math.abs(at(row.after) - at(row.before));
  track.innerHTML = '<div style="position:absolute;top:7px;left:0;right:0;height:1px;background:var(--border)"></div>'
    + '<div style="position:absolute;top:6.5px;left:' + low + '%;width:' + span + '%;height:3px;border-radius:2px;background:color-mix(in srgb, var(--chart-1) 45%, transparent)"></div>'
    + '<div style="position:absolute;top:2px;left:calc(' + at(row.before) + '% - 6px);width:12px;height:12px;border-radius:50%;background:color-mix(in srgb, var(--chart-1) 38%, transparent)"></div>'
    + '<div style="position:absolute;top:2px;left:calc(' + at(row.after) + '% - 6px);width:12px;height:12px;border-radius:50%;background:var(--chart-1);border:2px solid var(--background)"></div>';
  const delta = row.after - row.before;
  const change = document.createElement('div');
  change.style.cssText = 'justify-self:end;padding:1px 6px;border-radius:var(--radius);font-size:12px;font-variant-numeric:tabular-nums';
  change.style.background = delta < 0 ? 'var(--error-bg)' : 'var(--success-bg)';
  change.style.color = delta < 0 ? 'var(--error-foreground)' : 'var(--success-foreground)';
  change.textContent = (delta < 0 ? '-' : '+') + Math.abs(delta);
  line.append(name, track, change);
  host.append(line);
}
</script>
```

### Heat map

Weekday against week, in pure HTML and CSS — a grid of cells needs no chart
library and keeps every label as real text. Five sequential steps of one hue,
plus a plate for a zero cell, and a scale legend so the steps mean something.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Fridays and Saturdays carry the week — every Saturday lands in the top two bands, and Mondays and Tuesdays sit at the bottom of the range.</h2>
<div style="display:grid;grid-template-columns:34px repeat(6, minmax(0, 1fr));gap:3px;font-size:11px" id="heat"></div>
<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--muted-foreground)">
  <span>Fewer units</span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 14%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 32%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 52%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 74%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 96%, transparent)"></span>
  <span>More</span>
</div>
<script>
const weeks = ['Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8', 'Sep 15'];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const units = [
  [38, 41, 36, 44, 39, 42],
  [34, 36, 39, 37, 41, 35],
  [42, 45, 40, 47, 44, 0],
  [47, 51, 46, 53, 49, 0],
  [63, 68, 57, 71, 66, 0],
  [72, 79, 64, 77, 73, 0],
  [48, 52, 44, 51, 46, 0]
];
const steps = [14, 32, 52, 74, 96];
// Band across the observed range, not from zero: scaling a 34–79 spread against
// zero would push every cell into the middle two steps and waste the ramp.
const seen = units.flat().filter((value) => value > 0);
const low = Math.min(...seen);
const high = Math.max(...seen);
const host = document.getElementById('heat');
const cell = (style, text, title) => {
  const box = document.createElement('div');
  box.style.cssText = style;
  box.textContent = text;
  if (title) { box.title = title; }
  host.append(box);
};
cell('', '');
for (const week of weeks) {
  cell('text-align:center;color:var(--muted-foreground);padding-bottom:2px', week);
}
for (const [row, day] of days.entries()) {
  cell('display:flex;align-items:center;color:var(--muted-foreground)', day);
  for (const [column, week] of weeks.entries()) {
    const value = units[row][column];
    const band = Math.min(steps.length - 1, Math.floor(((value - low) / (high - low + 1)) * steps.length));
    const fill = value === 0 ? 'var(--surface-secondary)' : 'color-mix(in srgb, var(--chart-1) ' + steps[band] + '%, transparent)';
    cell('height:30px;border-radius:calc(var(--radius) / 3);background:' + fill, '', day + ' ' + week + ': ' + (value === 0 ? 'no data yet' : value + ' units'));
  }
}
</script>
```

### Sparkline

A shape beside a number: no axes, no text, nothing to fit. About a dozen points
is the useful range — fewer reads as noise, more turns to mush.

```html
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label="Orders climbing over the last 14 days">
  <polyline points="0,27 10,24 20,28 30,21 40,23 50,17 60,19 70,13 80,15 90,10 100,12 110,7 120,4" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
</svg>
```
