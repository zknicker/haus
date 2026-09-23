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
- [ ] Status colors appear only for state, never as a series. Text never wears
      the series color.
- [ ] One y-axis unless the user asked for bars and a line together. Two
      measures in different units are paired panels on a shared x axis; a
      requested combo plot draws both axes from zero on nice maxima, with the
      gridlines from the left axis alone.
- [ ] Bars at most 24px thick with air left in the slot; rounded at the data end
      only, square at the baseline; 2px surface gap between touching marks.
- [ ] Coordinates derived from the data — marks land on their ticks at any point
      count, and the fence carries its `<!-- scale: … -->` comment.
- [ ] Horizontal gridlines only; muted 11–12px axis labels; legend only when
      >1 series.
- [ ] Hover layer present: the canonical tooltip on a surface plate with a
      hairline border, value first, and hit targets a finger can land on.
- [ ] Leads with the answer (headline number or takeaway above the chart), with
      one direct label, not a number on every point.
- [ ] Values whole through 9,999, compact from 10,000 (`$14.4K`, `$28K`);
      deltas use success/error foregrounds.
- [ ] Nothing in the skill's anti-pattern catalog
      (`packages/agent-workspace/src/visuals-skill/anti-patterns.md`) is present.

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
- [ ] Prose around the fence adds context without restating the visual.
- [ ] No narration after the visual rendered.
