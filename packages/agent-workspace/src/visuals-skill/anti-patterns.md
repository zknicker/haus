# Haus visuals — anti-patterns

Check every chart against this list before you close the fence. If your output
matches an entry, it is wrong. Each one has been shipped by an agent working
from this skill, which is why it is written down.

## Encoding

**Bad: a second y-axis nobody asked for**, or one whose axes do not both start
at zero — units on the left, dollars on the right, each scaled to fill the plot.
Why: the alignment of two scales is arbitrary, so a chart that reaches for it
unasked invents a correlation that is not in the data, and a floating baseline
makes the invented correlation look tighter still.
Good: when the user asks for bars and a line on one plot, draw
[combo-bar-line](fragments/combo-bar-line.md) — both axes zero-based, nice
maxima, one grid. Otherwise [paired-panels](fragments/paired-panels.md), two
plots stacked on a shared x axis, each in its own units, or index both series to
100 at the start and draw them on one axis.

**Bad: recoloring on filter**, assigning hues by current rank, so hiding one
series repaints the survivors.
Why: a reader who learned that Etsy is blue is now being misled.
Good: color follows the entity. The survivors keep their slots.

**Bad: a fifth categorical hue**, cycled or mixed.
Why: the palette is validated for four slots plus a neutral. A fifth hue is a
value nobody checked, and under color-vision deficiency it lands on one of the
four.
Good: fold the tail into "Other" in `--chart-5`, or facet into small multiples.

**Bad: a value ramp on unordered categories**, each bar darker where it is
bigger, when the categories are products or marketplaces.
Why: it double-encodes bar length as hue and spends the only free channel on
information the chart already shows.
Good: one series, one color. A ramp is for ordered categories only: funnel
stages, tiers, age bands.

**Bad: a rainbow for magnitude.**
Good: one hue, stepped toward transparent with `color-mix`.

**Bad: a hue at the diverging midpoint, or two cool hues as the two poles.**
Why: the midpoint has to read as nothing, and the poles have to read as
opposite.
Good: `--chart-1` against `--chart-2`, warm against cool, with a neutral
midpoint mixed from `--chart-5`.

**Bad: a status color on an arbitrary series**, products or marketplaces in
green and red, or a series color standing in for status.
Good: `--success`, `--warning`, and `--error` mean state, always with a label.
Identity is categorical. When the series themselves are states or severities —
serious / minor / no flaw — they do take `--error`, `--warning`, `--success`,
ordered bad → good and named in the legend.

**Bad: the series color on text**, a legend label in blue or a value in green.
Why: a light hue is illegible as text on the surface, and the color stops
meaning "series" the moment text wears it.
Good: text takes `--foreground`, `--muted-foreground`, or `--chart-label`, with
a small colored mark beside it.

## Form

**Bad: four hues when the story is one number.** The most common way a chart
misses its point.
Good: emphasis, one mark in `--chart-1` and the rest in `--chart-5`, or a stat
tile.

**Bad: a one-bar bar chart, or a two-slice pie.**
Good: a stat tile. The number is the chart.

**Bad: a donut for comparing close values.**
Good: a bar, or the numbers. Part-to-whole at a glance only, six slices at most.

**Bad: more than about seven classes carrying meaning.**
Good: a Markdown table in the reply, or a table beside a chart.

**Bad: prose inside the visual**: a caption, a heading over a single chart, a
sentence of explanation under the plot.
Why: the fence is the figure and the reply is the text. A caption inside it
duplicates the sentence above it and cannot be edited or searched.
Good: the takeaway goes in the reply. The only text in the body is the hidden
summary `<h2>`, the labels, the ticks, and — in a report or a mockup — a short
bold title per panel.

**Bad: a bordered box around the visual**, or tiles drawn as bordered cards.
Why: the conversation is the container; a border makes it a card in a card.
Good: plates in `--surface-secondary` at `--radius`, no border. A bordered
`--surface` card is for one bounded object, such as a record.

**Bad: a frame inside a frame in a mockup** — a bordered page card around a
plate holding the component being designed.
Good: one frame per variant, the mocked component's own surface; its label and
any surrounding chrome sit outside it, unframed.

## Marks and chrome

**Bad: bars that fill their slot**, blocks touching each other — or the
opposite, 12–24px pins floating in a wide band.
Why: touching blocks read loud; pins read timid and leave the chart mostly
empty, so the reader sees air instead of data.
Good: a column takes 55–65% of its slot (16–72px); a ranked horizontal bar is
24–32px thick. The rest of the band is the gap between neighbours.

**Bad: copying a fragment's pixel coordinates with a different number of
points.** The bars drift off the ticks, the last one leaves the plot.
Why: the fragment's numbers are a derivation, not a constant.
Good: recompute `slot`, `barW`, `x(i)`, and `y(v)` from your data, and show the
arithmetic in the `<!-- scale: … -->` comment.

**Bad: a `<rect rx="4">` for a bar.** It rounds the baseline too, so the bar
floats off the axis.
Good: the bar path that rounds the data end only, or in a fluid plot the
`rx="4"` rect inside a nested `<svg>` viewport that clips its baseline corners.

**Bad: a stroke around each mark to separate touching bars or stack segments.**
Good: a 2px gap in the background color — simply not drawn — the same width
across the chart.

**Bad: dashed gridlines**, or a box around the plot.
Why: dashing reads as "projection" or "threshold" when it is just a grid.
Good: solid horizontal hairlines in `--chart-grid`, no axis lines at all. A
dash is reserved for a reference line, which gets a legend entry.

**Bad: a number on every point.**
Good: direct labels on the few marks that matter — the peak or two, the
latest.

**Bad: a label clipped by its own bar**, including `overflow: hidden` cropping
the first characters.
Good: measure first; if it does not fit, put it outside the bar end or drop it
to the tooltip.

**Bad: stacked end labels where lines converge.**
Good: leader lines from label to line end, or small multiples.

**Bad: text on ink** — a value label drawn across a line, an annotation on a
bar, two lines that nearly coincide drawn on top of each other with their
labels colliding.
Why: the reader can read neither the mark nor the text.
Good: labels in clear space; when two lines coincide, one line and the gap in words.

**Bad: actual drawn on its own goal pace.** $14.4K against a $14.0K pace mark on
a 56px plot is 0.7px apart; the dashed pace line vanishes under the solid one
and the legend promises a line nobody can see.
```
<line … stroke="var(--chart-5)" stroke-dasharray="4 4"/>   <!-- pace, y 60→4 -->
<polyline … stroke="var(--chart-1)" points="0,60 … 326.7,33.2"/>  <!-- pace y there: 33.9 -->
```
Good: one line, the gap as words at its end — or the progress meter with a pace tick.
```
<polyline … stroke="var(--chart-1)" points="0,60 … 326.7,33.2"/>
<text x="334" y="33.2">$381 ahead of pace</text>
```

**Bad: tick labels clipped at the left edge** — `$8,000` right-aligned at a
fixed x of 40 loses its `$`.
Good: measure the widest tick (7.6px a character at 12px, 11.4 for `%` or `M`,
plus 8) and set the left pad or gutter to it.

**Bad: a ranked list's values in a far-right column**, a long empty run
between a short bar and its number.
Good: the value muted 8px after the bar end, where the eye already is.

**Bad: a viewBox or container height that excludes the x-axis band.** The plot
fits, the axis labels do not, so they clip or the card gets a tiny nested
scrollbar.
Good: the viewBox height is plot plus axis band, and the container grows with
its content instead of fixing a height.

**Bad: a pixel `height` beside `width="100%"` on a viewBox plot**, as in
`<svg width="100%" height="240" viewBox="0 0 736 240">`.
Why: the viewBox keeps its aspect ratio, so in any column that is not exactly
736px wide the drawing letterboxes: it floats centered inside a box of the
wrong shape, out of line with the KPI tiles above it, with dead space around it.
Good: `<svg viewBox="0 0 736 240" width="100%" style="display:block">` with no
`height`. The rendered height follows from the aspect ratio and the plot fills
the column. Only a bare sparkline or meter sets a height, and it pairs it with
`preserveAspectRatio="none"`. A fluid plot has no viewBox, so its fixed
height is the point: x in percent, y in pixels, nothing letterboxes.

**Bad: `tabular-nums` on a hero or tile value.** Equal-width digits make `121`
look loose at display sizes.
Good: proportional figures for display values; `tabular-nums` only where numbers
line up in a column.

## Interaction

**Bad: the default black tooltip**, a dark slab with white text and a caret,
the look of a chart library rather than of the app.
Why: it is the one part of the chart nobody styles, so it is the one part that
gives away that the chart was not designed.
Good: the canonical `.tip` plate: `--surface`, a `--border` hairline,
`--radius`, 12px, value first.

**Bad: a pinpoint hover target**, a `r="4"` dot you have to hit dead center.
Good: a transparent companion mark of at least 24px carrying the `data-*`.

**Bad: the tooltip as the only place a value exists**, a chart with no labels
that only answers on hover.
Good: the direct labels, the ticks, and the `aria-label` carry the answer in a
screenshot. The hover layer is optional on top.
