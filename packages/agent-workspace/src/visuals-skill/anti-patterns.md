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

**Bad: a status color on a series**, or a series color standing in for status.
Good: `--success`, `--warning`, and `--error` mean state, always with a label.
Identity is categorical.

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

**Bad: prose inside the visual**: a caption, a heading, a sentence of
explanation under the plot.
Why: the fence is the figure and the reply is the text. A caption inside it
duplicates the sentence above it and cannot be edited or searched.
Good: the takeaway goes in the reply. The only text in the body is the hidden
summary `<h2>`, the labels, and the ticks.

**Bad: a bordered box around the visual**, or tiles drawn as bordered cards.
Why: the conversation is the container; a border makes it a card in a card.
Good: plates in `--surface-secondary` at `--radius`, no border. A bordered
`--surface` card is for one bounded object, such as a record.

## Marks and chrome

**Bad: bars that fill their slot**, 60px-wide blocks touching each other.
Why: it reads loud and childish at any size, and there is nowhere for the eye
to rest.
Good: at most 24px thick, with the band's leftover left as air.

**Bad: copying a fragment's pixel coordinates with a different number of
points.** The bars drift off the ticks, the last one leaves the plot.
Why: the fragment's numbers are a derivation, not a constant.
Good: recompute `slot`, `barW`, `x(i)`, and `y(v)` from your data, and show the
arithmetic in the `<!-- scale: … -->` comment.

**Bad: a `<rect rx="4">` for a bar.** It rounds the baseline too, so the bar
floats off the axis.
Good: the bar path that rounds the data end only.

**Bad: a stroke around each mark to separate touching bars or stack segments.**
Good: a 2px gap painted in `--surface`, the same width across the chart.

**Bad: dashed gridlines**, or a box around the plot.
Why: dashing reads as "projection" or "threshold" when it is just a grid.
Good: solid horizontal hairlines in `--chart-grid`, no axis lines at all. A
dash is reserved for a reference line, which gets a legend entry.

**Bad: a number on every point.**
Good: one direct label, on the mark the question is about.

**Bad: a label clipped by its own bar**, including `overflow: hidden` cropping
the first characters.
Good: measure first; if it does not fit, put it outside the bar end or drop it
to the tooltip.

**Bad: stacked end labels where lines converge.**
Good: leader lines from label to line end, or small multiples.

**Bad: a viewBox or container height that excludes the x-axis band.** The plot
fits, the axis labels do not, so they clip or the card gets a tiny nested
scrollbar.
Good: the viewBox height is plot plus axis band, and the container grows with
its content instead of fixing a height.

**Bad: a pixel `height` beside `width="100%"` on a plot**, as in
`<svg width="100%" height="240" viewBox="0 0 736 240">`.
Why: the viewBox keeps its aspect ratio, so in any column that is not exactly
736px wide the drawing letterboxes: it floats centered inside a box of the
wrong shape, out of line with the KPI tiles above it, with dead space around it.
Good: `<svg viewBox="0 0 736 240" width="100%" style="display:block">` with no
`height`. The rendered height follows from the aspect ratio and the plot fills
the column. Only a bare sparkline or meter sets a height, and it pairs it with
`preserveAspectRatio="none"`.

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

**Bad: a plot with no hover layer at all.**
Good: every plot ships the canonical snippet. A bare stat tile is the only
exemption.

**Bad: the tooltip as the only place a value exists.**
Good: the direct label, the ticks, and the `aria-label` carry the answer in a
screenshot.
