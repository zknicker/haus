# Haus visuals — interaction

Read [design-system.md](design-system.md) and [charts.md](charts.md) first. An
inline chart is interactive by default: the hover layer ships with it. The only
form that skips it is a bare stat tile with no plot.

There is no chart library, so the hover layer is a small inline script. Copy the
canonical snippet below verbatim. Every chart fragment carries the same one, so
every chart in the product behaves the same way.

## The canonical hover layer

The contract is four parts: a positioned wrapper, hit targets carrying `data-*`,
a `<div class="tip" hidden>` after the `<svg>`, and the script below as the
wrapper's next sibling.

| Part | What it is |
| --- | --- |
| `data-value` | The rounded value, already formatted. Several series at one x join with `\|` |
| `data-series` | The series name, or names in the same order. Falls back to `data-label` |
| `data-label` | The category at that x. It heads the tip when there is more than one series |
| `data-color` | The mark color per series, `var(--chart-1)` and friends, in the same order |
| `data-x` | The x the crosshair snaps to, on line and area charts |
| `class="m"` | The group holding one mark, so the hovered one can lift |
| `class="crosshair"` | The vertical hairline, `visibility="hidden"` until a pointer arrives |

```
<div style="position:relative">
  <svg …>
    <line class="crosshair" y1="16" y2="212" stroke="var(--border-strong)" visibility="hidden"/>
    <g class="m"><path d="…" fill="var(--chart-1)"/>
      <rect x="48" y="16" width="72" height="196" fill="transparent"
        data-label="Aug 4" data-series="Revenue" data-value="$6,720"
        data-color="var(--chart-1)" data-x="84"/></g>
  </svg>
  <div class="tip" hidden style="position:absolute;left:0;top:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;font-size:12px;color:var(--foreground);pointer-events:none;white-space:nowrap"></div>
</div>
<script>
  const wrap = document.currentScript.previousElementSibling;
  const tip = wrap.querySelector('.tip');
  const panels = [...wrap.querySelectorAll('svg')];
  const hits = panels.flatMap((panel) => [...panel.querySelectorAll('[data-value]')]);
  // … the pointermove handler: nearest hit, one tip row per series, crosshair
  // to data-x, the hovered .m lifted to 0.85 opacity, all cleared on leave.
</script>
```

The handler is the same in every chart fragment, so take it from the fragment
you are working from. What it fixes, and why it is never rewritten per chart:

- **The tooltip is an HTML element**, not an SVG one, so it sits on a
  `--surface` plate with a `--border` hairline and `--radius`, escapes the
  viewBox, and wraps nothing.
- **Values lead, names follow.** The value is `--foreground` at weight 500 with
  tabular figures; the series name trails it in `--muted-foreground`. This is
  the legend's hierarchy inverted, because here the reader has the series and
  wants the number.
- **A dot key, not a box.** The 8px square at 2px radius takes the series color.
  At tooltip density a large swatch is data-weight ink doing a label's job.
- **Text nodes, never `innerHTML`.** Category names come from data, so
  `textContent` is the only way they reach the DOM.
- **The value is already rounded** when it goes into `data-value`. The tooltip
  formats nothing at hover time.
- **The pointer only has to be closest.** The handler falls back to the nearest
  hit target, so no reader has to land on a mark.
- **One tooltip lists every series at that x**, pipe-separated in the data
  attributes, so the pointer never has to find a particular line.

## Hit targets

- **Every hit target is at least 24px.** A 24px-capped bar is right at the line
  and a `r="4"` dot is nowhere near it, so give thin marks and dots a
  transparent companion carrying the `data-*` attributes: a
  `<rect fill="transparent">` the width of the slot, or a
  `<circle r="12" fill="transparent">`. The painted mark keeps only its fill.
- **On bars, dots, and cells the mark is the target.** No crosshair: each mark
  answers for itself, and its `.m` group drops to 0.85 opacity while hovered, so
  the reader sees the chart respond.
- **On lines and areas the crosshair finds the x.** Readers aim at a date, never
  at a 2px stroke. Lay one full-height transparent `<rect>` per x position,
  carrying the readout for every series at that x, and give each panel a
  `.crosshair` line that snaps to the hit target's `data-x`.
- **A tooltip never gates a value.** Hover-only numbers are gone in a
  screenshot, so the direct label, the ticks, and the `aria-label` carry the
  answer without it.

## Controls

An interactive visual's controls are ordinary HTML in one row above the plot,
never inside it and never one row per chart. The frame already styles bare
`input`, `select`, and `button`; write the bare tag. A control changes the data
the chart is already holding. There is no network, so nothing is refetched and the
chart re-renders in place without a skeleton or a layout jump.
