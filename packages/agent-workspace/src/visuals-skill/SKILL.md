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

Managed by Haus. Do not edit this skill directory; Haus refreshes it on
startup.

You render two kinds of visual output in chat:

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
- A visual does only what text cannot: tiles, a chart, a diagram, a control. Tables, lists,
  and explanation go in the reply as Markdown — a long reply is fine, a long visual is not.
- Routing: a **visual** for the one thing that must be seen; an **artifact** for deliverables
  the user will keep; the reply for everything that reads fine as words, rows, or bullets.
  When unsure, use plain text.
- Compose the reply in order: the visual first, or after one lead sentence; then one or two
  sentences on what it shows; then Markdown tables for the detail. Never restate the tiles.
- A `<table>` inside a visual is only for one that needs interaction (sort, filter) or is part
  of a bounded record. Numbers you are simply reporting are a Markdown table in the reply.
- Do **not** render a visual for: ordinary prose answers, routine line-by-line code
  explanations, file lists / galleries / final file deliverables, blocking input workflows,
  destructive or native actions, or large long-lived apps.

## Fence contracts

A visual is a fenced block whose language is `visual`; the body is raw
HTML/SVG; optional text after `visual` on the fence line becomes the title:

````
```visual Weekly sales
<div style="position:relative;height:260px"><canvas id="sales"></canvas></div>
<script>...</script>
```
````

An artifact is a self-contained `.html` file (inline CSS/JS, no external
assets) written under `workbench/`, then referenced with a bare `artifact`
fence containing exactly one JSON object — no comments, no trailing commas:

````
```artifact
{"path":"workbench/report.html","title":"June report"}
```
````

Rules:

- Haus strips fences from your visible reply and renders them in place.
- Raw HTML belongs only in a `visual` fence body or an artifact file. Never
  output HTML, JSX, CSS, imports, or class names in plain reply text.
- Prose adds context, never restates the visual; after one renders, say only what it cannot.
- No mid-sentence bolding in the reply either; lead with the sentence, not a bold fragment. Bold is for labels only.
- The fence title is the only title. No headings — beyond the hidden summary
  `<h2>` — captions, icons, or prose inside the body; the reply carries the words.
- **Budget** — one visual answers one question: one chart, or one row of at most four tiles
  above one chart — the default for a period question ("how are sales today"), since tiles
  alone carry no trend. No multi-section dashboard unless the user asked for one. Every number
  past the one the visual makes visible goes in the reply, as prose or a Markdown table.
- Do not overthink a visual. If it takes more than a few minutes to design, it is an artifact.
- Multiple fences in one reply are allowed when the answer has clearly separate visual parts;
  prefer one.

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
- A visual body is a fragment: no doctype, `<html>`, `<head>`, or `<body>`, and no `<!-- -->` or `/* */` comments.
- Stack sections vertically — no tabs, carousels, `display: none` panels, or fullscreen and expand buttons.
- Never round a single-sided border; a top-only rule with a corner radius reads broken.
- Invalid input in an interactive visual shows a 12–13px `var(--error)` message inline, and the control does not advance.
- No network: fetch/XHR, remote images, and fonts are blocked. Embed all
  data inline at generation time. One pinned exception: Chart.js
  (see design-system.md, Charts).
- Allowed: HTML, SVG, CSS, inline JavaScript, native browser APIs. There is
  no host bridge — interactivity works within the iframe over embedded data.

## Non-negotiables

Hold these even if you read nothing else:

- Tokens only — `var(--…)` for every color, font, radius, and spacing; a hardcoded value breaks dark mode.
- Sentence case everywhere, weights 400 and 500 only — never Title Case, CAPS, or 700.
- No bordered wrapper: the conversation is the container, and tiles are `--surface-secondary` plates.
- One idea per visual: tiles above one chart, or one chart, or one diagram — tables go in the reply.
- No headings, captions, or prose in the body; the hidden summary `<h2>` is the one exception.
- Bars: sized to the slot (`categoryPercentage: 0.55`, `maxBarThickness: 48`),
  rounded at the data end only.
- Emphasis: the period the question asks about is `--chart-1`, every other mark is `--chart-5`.
- Chip color = direction × whether up is good; `--warning-bg` only for stale or missing, never a drop.
- Round every number that reaches the screen — whole dollars in tiles, never cents.
- One label per chart: the endpoint or the extreme, never a number on every point.
- Straight lines, solid hairline gridlines; a dashed stroke only for a reference line.

## ⚠️ Required: read the design system before you design

**Unless the user has given you very explicit, precise styling instructions
for this specific output, you MUST read
[references/design-system.md](references/design-system.md) before writing
visual or artifact markup.** It carries the token vocabulary, the type scale,
chart and diagram construction, page layout, and copy-ready fragments. Nothing
is too simple, too static, or too small to need it.

The skill ships a curated icon library (`assets/icons/`, indexed in
`references/icons/manifest.json`) — read [references/icons.md](references/icons.md)
when an output has icon-shaped spots: section titles, status markers, toolbars,
empty states. Inline the SVG instead of drawing your own or using emoji.
