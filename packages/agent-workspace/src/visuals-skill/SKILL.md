---
name: visuals
description: >
  Haus design system for everything you render — inline visuals and artifact
  pages. Read this BEFORE emitting any visual or artifact fence. Defines when
  to render and the fence contracts; the full visual style lives in
  references/design-system.md. Reach for it when a reply would be clearer as a
  chart, graph, dashboard, KPI row, stat tile, timeline, calendar, schedule, or
  status card, or when asked to compare, break down, trend, or forecast sales,
  revenue, orders, units, returns, royalties, conversion, inventory, spend,
  cash flow, margin, budget, events, availability, or agenda items, including
  week over week, top N, or by region or currency.
---

# Visuals

Managed by Haus. Do not edit this skill directory; Haus refreshes it on startup. You render two
kinds of visual output in chat:

- A **visual** — bespoke inline HTML/SVG in a ```` ```visual ```` fence:
  charts, composed reports, diagrams, calculators, comparisons, timelines, state
  machines, small simulations, and mockups of a product screen or flow.
- An **artifact** — a durable self-contained HTML page carded in chat and
  opened in the artifact pane, for a page the user asked to keep, share, or come back to.

## When to render

- The answer has spatial, sequential, systemic, comparative, numeric, or interactive structure,
  and seeing it beats reading it.
- The user does not need to say "show", "visualize", "chart", or "widget" — proactive visuals
  are expected when the structure is there. A compact spec with no verb ("checkout state
  machine", "pricing calculator") is a request to render it, not to describe it.
- Compact: show the essential inline; explain the rest in the reply.
- Routing: anything answered in chat is a **visual** — a chart, a report, a comparison, mockups
  to pick from — even when the user calls it a "report", a "view", or a "dashboard". An
  **artifact** only when the user asks for a page or document to keep, share, or revisit, or
  the content outgrows one inline visual (long tables, many sections, a doc to edit). When
  unsure between the two, a visual; between a visual and nothing, plain text.
- Do not put a table in a visual — write it as a Markdown table in the reply. The exception is
  a table that needs interaction (sort, filter) or is part of a bounded record.
- Do **not** render a visual for: ordinary prose answers, routine line-by-line code
  explanations, file lists / galleries / final file deliverables, blocking input workflows,
  destructive or native actions, or large long-lived apps.

## Fence contracts

A visual is a fenced block whose language is `visual`; the body is raw HTML/SVG; optional text
after `visual` on the fence line becomes the title:

````
```visual Weekly sales
<svg viewBox="0 0 736 240" width="100%" role="img" aria-label="…" style="display:block">…</svg>
```
````

An artifact is a self-contained `.html` file (inline CSS/JS, no external assets) written under
`workbench/`, then referenced with a bare `artifact` fence holding exactly one JSON object — no
comments, no trailing commas:

````
```artifact
{"path":"workbench/pricing-plan.html","title":"Pricing plan"}
```
````

Rules:

- Start the fence on its own line, never glued to the end of a sentence. Haus strips fences from
  your visible reply and renders them in place.
- Raw HTML belongs only in a `visual` fence body or an artifact file. Never output HTML, JSX, CSS,
  imports, or class names in plain reply text.
- Text goes in your reply, visuals go in the fence; the fence holds only the visual.
- **The reply adds only what the visual does not show**: the takeaway in a sentence or two, a
  caveat about the data, the next step. Never re-list the numbers, rows, or options the visual
  already shows, never narrate it ("here's a chart", "the blue bar is…"), never repeat its
  panels as bullets. Beside a visual, a reply is usually two to four sentences, under ~80 words.
- No mid-sentence bolding in the reply either; lead with the sentence, not a bold fragment. Bold is for labels only.
- The fence title is the only title. No headings — beyond the hidden summary `<h2>` — captions,
  or prose inside the body; the reply carries the words. The one exception is a **report** or a
  **mockup**: each panel carries a short bold sentence-case panel title (14px, weight 500), such
  as "Revenue per week" or "1. Inline banner · recommended".
- **Budget** — one visual answers one question. A narrow question gets one chart, or one row of
  at most four tiles above one chart, the default for a period question ("how are sales today").
  A question with several facets — "how did the week go", a weekly report, a review — gets a
  **report**: one visual composing a stat row, a full-width time series, and one or two pairs of
  side-by-side ranked lists, each panel titled. → [report](references/fragments/report.md)
- Do not overthink a visual. If it takes more than a few minutes to design, cut it to what answers the question.
  Multiple fences are allowed when the answer has clearly separate parts; prefer one.

## Visual runtime contract

- The `visual` fence body renders in a sandboxed iframe with Haus's theme
  tokens preloaded as CSS variables. It renders inline in the reply column
  (~46rem wide), transparent, with no border; the body has the app font,
  14px text, no side padding, and native styling for bare form controls and
  `<table>` markup. Height is measured automatically and the
  chat transcript owns vertical scrolling: no fixed page heights, viewport-height
  layouts, `position: fixed`, or authored scroll containers; wide tables may scroll horizontally.
- **The same fence renders on a phone, ~360–390px wide.** Side-by-side panels stack to one
  column and stat rows wrap to 2×2 below 560px (a `@media (max-width: 560px)` rule in a short
  `<style>`); column charts are fluid plots with a fixed pixel height and fewer x labels when
  narrow; ranked lists are HTML rows. → [marks and anatomy](references/marks-and-anatomy.md#the-scaffolding)
- **The conversation is the container.** Your body sits directly on the
  transcript page — no frame, no card around it — so never wrap a visual in a
  bordered box. Tiles and plates are `--surface-secondary` with `--radius` and
  no border. A bordered `--surface` card is for a bounded object only.
- A visual body is a fragment: no doctype, `<html>`, `<head>`, or `<body>`, and no commentary. The
  one comment a body may carry is the `<!-- scale: … -->` line showing how a chart's coordinates
  were derived.
- Stack sections vertically — no tabs, carousels, `display: none` panels, or fullscreen and expand buttons.
  Never round a single-sided border; a top-only rule with a corner radius reads broken.
- Invalid input in an interactive visual shows a 12–13px `var(--error)` message inline, and the control does not advance.
- No network: fetch/XHR, remote images, and fonts are blocked. Embed all
  data inline at generation time. The only exceptions are pinned URLs listed
  in references/charts.md.
- Allowed: HTML, SVG, CSS, inline JavaScript, native browser APIs. There is
  no host bridge — interactivity works within the iframe over embedded data.

## Making a chart — do these in order

Every chart is hand-written SVG. There is no chart library: you compute the
coordinates, so the work is a procedure, not taste.

1. **Pick the form.** Magnitude, identity, polarity, change over time, one headline number? The
   job picks the form, and sometimes the answer is not a chart. → [charts](references/charts.md)
2. **Assign color by the job it does**: categorical, sequential, diverging, emphasis, or status.
   Colors are tokens, assigned by job; never invent a color, mix a new hue, or reorder the slots.
   The palette is validated in the repo, so a token is safe and a value you pick is not.
   → [charts](references/charts.md)
3. **Draw the marks and compute the scale.** Plot box, slot, bar width, y of a value, a nice
   maximum, all derived from the data and the container width.
   → [marks and anatomy](references/marks-and-anatomy.md)
4. **Label the marks that matter; hover is optional.** A static chart must carry the answer by
   itself: sparse ticks, plus direct value labels on the few marks the story is about (the peak
   or two, the latest). Add the canonical hover layer when exact values for every mark matter;
   skip it in a report or a mockup. → [interaction](references/interaction.md)
5. **Accessibility pass.** Hidden summary `<h2>`, `role="img"` and an `aria-label` stating the
   takeaway, a `<title>` first inside the `<svg>`, a legend for two or more series.
6. **Render it and look at it.** Read the fence back the way a browser will: walk the numbers,
   check every label fits its box, check the viewBox closes.

Then check the result against
[references/anti-patterns.md](references/anti-patterns.md). If your chart
matches an entry, it is wrong.

## Non-negotiables

Hold these even if you read nothing else:

- **One y-axis by default.** A second axis only when the user asks for bars and a line
  together; then draw [combo-bar-line](references/fragments/combo-bar-line.md) with both axes
  zero-based, or prefer paired panels sharing an x axis.
- Tokens only — `var(--…)` for every color, font, radius, and spacing; a hardcoded value breaks dark mode.
- Categorical hues in fixed order: `--chart-1`, `--chart-2`, `--chart-3`, `--chart-4`, never cycled;
  a fifth series folds into "Other" in `--chart-5`. Color follows the entity, never its rank.
- Status colors mean state. An arbitrary series never borrows `--success`, `--warning`, or `--error`;
  the one exception is a series that **is** a state or severity (failed / flaky / passed, serious /
  minor / none), ordered bad → good and named in the legend. Text never wears the series color:
  identity comes from a mark beside the text.
- Bars are sized to their slot: a column takes **55–65% of its band** (floor 16px, ceiling 72px), a
  ranked horizontal bar is **24–32px** thick with its value muted 8px after the bar end, never in a
  far-right column. 4px rounded at the data end, square at the baseline;
  stacked segments and grouped neighbours are held apart by a 2px gap in the background color.
  Straight lines, solid hairline gridlines; a dash only for a reference line.
- Compute every coordinate from the data; a fragment's numbers are derived, not fixed.
- Axis ticks: the step is 1, 2 or 5 × 10^k, the smallest at or above peak/5, and the axis runs from zero
  to the first multiple at or above the peak; never hand-pick a step or a ceiling.
- The hover layer is optional; when present it is the canonical one tooltip, values first, on a
  `--surface` plate. Without it, the direct labels and ticks carry the answer.
- Sentence case everywhere, weights 400 and 500 only — never Title Case, CAPS, or 700.
- No bordered wrapper: the conversation is the container, and tiles are `--surface-secondary` plates.
- One question per visual: tiles above one chart, one chart, one diagram, or a titled report for a
  many-faceted question — no table inside it.
- No headings, captions, or prose in the body beyond the hidden summary `<h2>` and a report's or
  mockup's short bold panel titles.
- Chip color = direction × whether up is good; `--warning-bg` only for stale or missing, never a drop.
- Round every number that reaches the screen — whole dollars in tiles, never cents.
- Tiles follow the tile grammar in [references/components.md](references/components.md): title
  `Metric · period` only when periods differ, one chip such as `↑ 6.0% vs prior 7d`. A report's
  stat row is plainer: value and muted caption, no plate, no chip.
- Label the few marks that matter — the peak or two, the latest — never a number on every point,
  and never text sitting on a line or mark: labels go in clear space.
- Tick labels never clip: the left pad is measured for the widest tick (7.6px a character at 12px,
  11.4 for `%` or `M`, plus 8), ticks right-aligned inside it.

## ⚠️ Required: read the design system before you design

**Unless the user has given you very explicit, precise styling instructions for this
specific output, you MUST read [references/design-system.md](references/design-system.md)
before writing visual or artifact markup**, then the ONE module for what you are making,
then the ONE fragment its index points at. Nothing is too small for it.

| Making | Also read |
| --- | --- |
| Charts, plots, sparklines, heat maps, maps | [references/charts.md](references/charts.md) |
| Flows, trees, sequences, timelines, state machines | [references/diagrams.md](references/diagrams.md) |
| Tiles, cards, status lists, meters, calculators, tables, UI mockups | [references/components.md](references/components.md) |
| An artifact page | [references/pages.md](references/pages.md) |

Each module opens with an index mapping what you are making to ONE file under
`references/fragments/` — two at most; a report reads [report](references/fragments/report.md). Read it and change its data; the fragments are the house
style, and improvising is how five agents look five ways. Icons come from the shipped library:
[references/icons.md](references/icons.md).
