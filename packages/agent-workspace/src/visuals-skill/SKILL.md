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
  charts, diagrams, calculators, comparisons, timelines, state machines,
  small simulations.
- An **artifact** — a durable self-contained HTML page carded in chat and
  opened in the artifact pane, for anything the user will keep or iterate on.

## When to render

- The answer has spatial, sequential, systemic, comparative, numeric, or interactive structure,
  and seeing it beats reading it.
- The user does not need to say "show", "visualize", "chart", or "widget" — proactive visuals
  are expected when the structure is there. A compact spec with no verb ("checkout state
  machine", "pricing calculator") is a request to render it, not to describe it.
- Compact: show the essential inline; explain the rest in the reply.
- Routing: a **visual** for the one thing that must be seen; an **artifact** for deliverables
  the user will keep. When unsure, use plain text.
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
{"path":"workbench/report.html","title":"June report"}
```
````

Rules:

- Start the fence on its own line, never glued to the end of a sentence. Haus strips fences from
  your visible reply and renders them in place.
- Raw HTML belongs only in a `visual` fence body or an artifact file. Never output HTML, JSX, CSS,
  imports, or class names in plain reply text.
- Text goes in your reply, visuals go in the fence: explanation, descriptions, introductions,
  and summaries are normal reply text outside the fence; the fence holds only the visual.
- No mid-sentence bolding in the reply either; lead with the sentence, not a bold fragment. Bold is for labels only.
- The fence title is the only title. No headings — beyond the hidden summary `<h2>` — captions,
  icons, or prose inside the body; the reply carries the words.
- **Budget** — one visual answers one question: one chart, or one row of at most four tiles above
  one chart, the default for a period question ("how are sales today"), since tiles alone carry no
  trend. No multi-section dashboard unless the user asked for one.
- Do not overthink a visual. If it takes more than a few minutes to design, it is an artifact.
  Multiple fences are allowed when the answer has clearly separate parts; prefer one.

## Visual runtime contract

- The `visual` fence body renders in a sandboxed iframe with Haus's theme
  tokens preloaded as CSS variables. It renders inline in the reply column
  (~46rem wide), transparent, with no border; the body has the app font,
  14px text, no side padding, and native styling for bare form controls and
  `<table>` markup. Height is measured automatically and the
  chat transcript owns vertical scrolling: no fixed page heights, viewport-height
  layouts, `position: fixed`, or authored scroll containers. Use responsive grids
  that wrap on narrow screens; wide tables may scroll horizontally.
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
4. **Add the hover layer, by default.** Every plot ships the canonical tooltip; only a bare stat
   tile skips it. → [interaction](references/interaction.md)
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
- Status colors mean state; a series never borrows `--success`, `--warning`, or `--error`, and text
  never wears the series color: identity comes from a mark beside the text.
- Bars are **at most 24px** wide and never fill the slot; 4px rounded at the data end, square at the
  baseline. Straight lines, solid hairline gridlines; a dash only for a reference line.
- Compute every coordinate from the data; a fragment's numbers are derived, not fixed.
- Axis ticks: the step is 1, 2 or 5 × 10^k, the smallest at or above peak/5, and the axis runs from zero
  to the first multiple at or above the peak; never hand-pick a step or a ceiling.
- Every plot carries the hover layer: one tooltip, values first, on a `--surface` plate.
- Sentence case everywhere, weights 400 and 500 only — never Title Case, CAPS, or 700.
- No bordered wrapper: the conversation is the container, and tiles are `--surface-secondary` plates.
- One idea per visual: tiles above one chart, or one chart, or one diagram — no table inside it.
- No headings, captions, or prose in the body; the hidden summary `<h2>` is the one exception.
- Chip color = direction × whether up is good; `--warning-bg` only for stale or missing, never a drop.
- Round every number that reaches the screen — whole dollars in tiles, never cents.
- Tiles follow the tile grammar in [references/components.md](references/components.md): title
  `Metric · period` only when periods differ, one chip such as `↑ 6.0% vs prior 7d`.
- One label per chart: the endpoint or the extreme, never a number on every point.

## ⚠️ Required: read the design system before you design

**Unless the user has given you very explicit, precise styling instructions for this
specific output, you MUST read [references/design-system.md](references/design-system.md)
before writing visual or artifact markup**, then the ONE module for what you are making,
then the ONE fragment its index points at. Nothing is too small for it.

| Making | Also read |
| --- | --- |
| Charts, plots, sparklines, heat maps, maps | [references/charts.md](references/charts.md) |
| Flows, trees, sequences, timelines, state machines | [references/diagrams.md](references/diagrams.md) |
| Tiles, cards, status lists, meters, calculators, tables | [references/components.md](references/components.md) |
| An artifact page | [references/pages.md](references/pages.md) |

Each module opens with an index mapping what you are making to ONE file under
`references/fragments/` — two at most. Read it and change its data; the fragments are the house
style, and improvising is how five agents look five ways. Icons come from the shipped library:
[references/icons.md](references/icons.md).
