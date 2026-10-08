# Design battery rubric

Judge each battery screenshot against these checks. The battery passes when
every item passes every applicable check without per-item coaching. Source of
truth for the rules: the seeded visuals skill
(`packages/agent-workspace/src/visuals-skill/`) and DESIGN.md.

## Every item

- [ ] Theme native: only token colors; correct in both dark and light shots;
      no hardcoded hex, no alien fonts.
- [ ] Ink-first: chrome and text are foreground/gray; accents appear only for
      status, series, or one deliberate emphasis moment.
- [ ] Flat: no gradients, shadows, glows, 3D, decorative backgrounds, or
      nested decorative cards.
- [ ] Typography: two weights (400/500), sentence case everywhere, nothing
      below 11px, numbers tabular, no mono hero metrics.
- [ ] Spacing on the 4/8/12/16/20/24/32 scale; nested radii outer > inner.
- [ ] Text fits: no overflow, truncation, or text touching box edges; labels
      readable in both themes.
- [ ] Nothing clipped by the viewBox or card; no dead vertical space.
- [ ] Restraint: within complexity budgets (≤5 hues, ≤5 tiles per row,
      captions ≤12 words); no emoji-as-icons; icons ≤24px.

## Charts (bar, line, composed, sparkline, dashboard)

Every chart is hand-written inline SVG: there is no chart library, so the
geometry is the agent's and these checks are about arithmetic as much as taste.

- [ ] Series colors follow the fixed categorical order (chart-1 blue, chart-2
      orange, chart-3 aqua, chart-4 yellow), never cycled; a single metric is
      chart-1; emphasis is chart-1 against chart-5.
- [ ] Status colors appear only for state, never on an arbitrary series; a
      series that is itself a state or severity (failed / flaky / passed) takes
      them, ordered bad → good and named in the legend. Text never wears the
      series color.
- [ ] One y-axis unless the user asked for bars and a line together. Two
      measures in different units are paired panels on a shared x axis; a
      requested combo plot draws both axes from zero on nice maxima, with the
      gridlines from the left axis alone.
- [ ] Columns take 55–65% of their slot (16–72px), ranked bars 24–32px; rounded
      at the data end only, square at the baseline; a 2px background gap between
      touching marks.
- [ ] Coordinates derived from the data — marks land on their ticks at any point
      count, and the fence carries its `<!-- scale: … -->` comment.
- [ ] No two lines nearly coincide (within ~6px over most of the plot). A goal
      pace or target that tracks the actual becomes one line with the gap
      labeled, a plot of the gap, or a meter with a pace tick; dashing one of two
      overlapping lines does not count.
- [ ] Horizontal gridlines only, three to five; muted 11–12px axis labels;
      legend only when >1 series.
- [ ] Tick labels fit: no tick text clipped at the left edge (gutter = widest
      tick at 7.6px a character, 11.4 for `%` or `M`, plus 8).
- [ ] Reads as a static image: the answer is visible without hovering. A hover
      layer is optional; when present it is the canonical tooltip.
- [ ] Leads with the answer (headline number or takeaway above the chart), with
      direct labels on the few marks that matter, not a number on every point,
      and no text sitting on a line or mark.
- [ ] Ranked lists put each value muted right after its bar, not in a far-right
      column.
- [ ] Reads at 375px: panels stack, column charts stay full height with 12px
      text.
- [ ] Values whole through 9,999, compact from 10,000 (`$14.4K`, `$28K`);
      deltas use success/error foregrounds.
- [ ] Nothing in the skill's anti-pattern catalog
      (`packages/agent-workspace/src/visuals-skill/anti-patterns.md`) is present.

## Reports

- [ ] A many-faceted question answered in chat ("how did the week go") is one
      composed report visual, not an artifact: a plate-less stat row, a
      full-width time series, then ranked lists side by side, each panel with a
      short 14px/500 title.
- [ ] Report stats are value plus muted caption, no plates or pills; a change
      only when the question asks about change, as a muted line.

## Stat tiles / KPI rows

- [ ] Title sentence case; `Metric · period` only when tiles in one row cover
      different periods, from the closed period list (`7d`, `30d`, `MTD`, …).
- [ ] Value whole through 9,999, compact from 10,000 (`$6,630`, `$14.4K`),
      proportional figures, never tabular; never cents.
- [ ] At most one chip, in exactly one shape: change (`↑ 6.0% vs prior 7d`),
      ratio (neutral, `48% of $30K goal`), or status (warning only).
- [ ] Secondary fact, if present, is muted 12px text under the value, not a
      chip.
- [ ] Tiles are surface-secondary plates, not bordered or shadowed cards.
- [ ] At most four tiles per row.

## Diagrams (flowchart)

- [ ] Nodes on surface-tertiary with border-strong hairlines; consistent flow
      direction; even gaps; connectors stop at node edges.
- [ ] Status is semantic only (success/warning/error); at most one
      highlighted node; the failure point is obvious at a glance.

## Interactive (calculator)

- [ ] Controls neutral (no browser default blue); values update live;
      layout stable while dragging; motion uses the motion tokens.

## Artifact pages

- [ ] Page owns its ground (background token), panels on card/surfaces.
- [ ] Layout rhythm: constrained prose width, full-width tables/charts,
      more space between sections than within.
- [ ] Tables: horizontal dividers only, sentence-case headers, right-aligned
      numbers, compact mono metadata.
- [ ] Reads operational, not editorial: no hero sections, no marketing tone.

## Process (from the transcript, not the screenshot)

- [ ] The agent read the visuals skill before its first fence.
- [ ] Routing: a chart, report, comparison, or mockup answered in chat is an
      inline visual; an artifact only when the user asked for a page to keep or
      share, or the content outgrows one visual.
- [ ] The reply adds only the takeaway, a caveat, or a next step — no re-listed
      numbers, rows, or panels; usually two to four sentences, under ~80 words.
- [ ] No narration after the visual rendered.
