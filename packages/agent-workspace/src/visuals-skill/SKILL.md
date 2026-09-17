---
name: visuals
description: >
  Haus design system for everything you render — inline visuals and artifact
  pages. Read this BEFORE emitting any visual or artifact fence. Defines when
  to render and the fence contracts; the full visual style lives in
  references/design-system.md. Reach for it when a reply would be clearer as a
  chart, graph, dashboard, table, KPI row, stat tile, timeline, calendar,
  schedule, or status card, or when asked to compare, break down, trend, or
  forecast sales, revenue, orders, units, returns, royalties, conversion,
  inventory, spend, cash flow, margin, budget, events, availability, or agenda
  items, including week over week, top N, or by region or currency.
---

# Visuals

Managed by Haus. Do not edit this skill directory; Haus refreshes it on
startup.

You render two kinds of visual output in chat:

- A **visual** — bespoke inline HTML/SVG in a ```` ```visual ```` fence:
  diagrams, dashboards, tables, calculators, comparisons, timelines, state
  machines, small simulations.
- An **artifact** — a durable self-contained HTML page carded in chat and
  opened in the artifact pane, for anything the user will keep or iterate on.

## When to render

- The answer has spatial, sequential, systemic, comparative, numeric, or
  interactive structure, and seeing it beats reading it.
- The user does not need to say "show", "visualize", "chart", or "widget" —
  proactive visuals are expected when the structure is there. A compact spec
  with no verb ("REST vs GraphQL table", "checkout state machine", "pricing
  calculator") is a request to render it, not to describe it.
- Routing: a **visual** for anything shown inline; an **artifact** for
  deliverables the user will keep. When unsure, use plain text.
- Tabular data is a plain HTML `<table>` inside a visual, never a Markdown
  table — the frame styles bare tables natively.
- Do **not** render a visual for: ordinary prose answers, routine
  line-by-line code explanations, file lists / galleries / final file
  deliverables, blocking input workflows, destructive or native actions, or
  large long-lived apps.

## Fence contracts

A visual is a fenced block whose language is `visual`; the body is raw
HTML/SVG; optional text after `visual` on the fence line becomes the title:

````
```visual Weekly sales
<h2>Weekly sales</h2>
<svg viewBox="0 0 640 220">...</svg>
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
- Text goes in your reply, visuals go in the fence. Prose adds context, never
  restates the visual; after one renders, say only what it cannot.
- Multiple fences in one reply are allowed when the answer has clearly
  separate visual parts; prefer one.

## Visual runtime contract

- The `visual` fence body renders in a sandboxed iframe with Haus's theme
  tokens preloaded as CSS variables. Content fills the available message width; the body
  has 16px padding, the app font, 14px text, a card background, and native
  styling for bare form controls and `<table>` markup. Height is measured
  automatically. Use responsive grids that fit the available width and wrap on
  narrow screens. Let the document flow naturally; no fixed page heights,
  viewport-height layouts, `position: fixed`, or authored vertical scroll
  containers. The chat transcript owns vertical scrolling. Wide tables may
  scroll horizontally.
- No network: fetch/XHR, remote images, and fonts are blocked. Embed all
  data inline at generation time. One pinned exception: Chart.js
  (see design-system.md, Charts).
- Allowed: HTML, SVG, CSS, inline JavaScript, native browser APIs. There is
  no host bridge — interactivity works within the iframe over embedded data.
- Never hardcode colors, fonts, radii, or spacing — always use `var(--xxx)`.
  Hardcoded values break dark mode and look alien beside the host UI.

## ⚠️ Required: read the design system before you design

**Unless the user has given you very explicit, precise styling instructions
for this specific output, you MUST read
[references/design-system.md](references/design-system.md) before writing
visual or artifact markup.** It carries the token vocabulary, the type scale,
chart and diagram construction, page layout, and copy-ready fragments. Do not
decide an output is too simple, too static, or too small to need it.

The skill ships a curated icon library (`assets/icons/`, indexed in
`references/icons/manifest.json`) — read
[references/icons.md](references/icons.md) when an output has icon-shaped
spots: dashboard or section titles, status markers, toolbars, empty states.
Pick from the library and inline the SVG instead of drawing your own or
using emoji.
