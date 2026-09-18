---
summary: Visual and artifact architecture — tagged fences, generative visuals in sandboxed iframes, message-backed visual rendering, dormant widget-activity pipeline, legacy catalog replay, and chat rendering.
read_when:
  - changing visual or artifact persistence, fence parsing, or renderer behavior
  - changing the visual sandbox, its CSP or CDN allowlist, or the theme-token injection
  - changing the published agent-visual token vocabulary or the chart palette
  - changing how assistant final replies become app-rendered chat UI
  - touching legacy stored widget activity or its fallback rendering
---

# Agent-authored HTML

Agents write HTML. Haus hands that HTML one set of CSS variables, and it
renders in one of two places.

| surface | what it is | where it renders | renderer |
| --- | --- | --- | --- |
| Visual | a ```` ```visual ```` fence inside a message | inline in the transcript | `features/chats/visual-card.tsx` |
| Artifact | a durable `.html` file in the workspace | card in chat → artifact side pane | `features/chats/artifact-card.tsx` → `chat-artifact-workspace-preview.tsx` |

Both share `src/agent-html/`: `tokens.ts` is the single published token
list plus the snapshot/injection helpers, and `sandbox.ts` is the single
`sandbox=` capability list. Never add `allow-same-origin` — the opaque origin
is what stops agent HTML reaching app cookies, storage, or DOM.

`features/chats/legacy-widget-row.tsx` replays catalog widgets stored before
the 2026-07 retirement as fallback-text cards; nothing emits new ones.

## The two fence-backed kinds

Agents render exactly two kinds of visual output: **visuals** — bespoke
inline HTML/SVG drawn in a ```` ```visual ```` fence and rendered in a
sandboxed iframe — and **artifacts** — durable self-contained pages carded
in chat and rendered in the artifact pane ([artifacts.md](artifacts.md)).
The old closed widget catalog (tables, charts, calendars, html-preview,
plugin widgets) was retired in 2026-07; stored catalog widgets in historical
chats replay as fallback-text cards.

## Visuals

The assistant draws an inline visual by writing a fenced block whose language
is `visual`; the body is raw model-authored HTML/SVG (no props schema, no
registration), with optional info-string text as the title:

````markdown
```visual Weekly sales
<h2>Weekly sales</h2>
<svg viewBox="0 0 640 220">...</svg>
```
````

- **Fence contract.** Fences parse client-side from the message content in
  document order via `splitVisualFences` (shared grammar in
  `packages/haus-api/src/widgets/visual/contracts.ts`). Body limit 60k
  chars; an empty body strips as invalid. Fallback text is the info-string
  title, else the document `<title>`, else the first h1-h3.
- **Persistence.** The durable message content IS the visual: the fence stays
  in the message body and the transcript splits it out at render time — there
  is no separate widget-render snapshot. Live and durable replies render
  through the same `splitVisualFences` path, so a visual survives without any
  Computer-side projection. Data is embedded at generation time; visuals never fetch
  live app data.
- **Sandbox.** Opaque origin, `srcDoc`, scripts allowed, never
  `allow-same-origin`, no browser storage
  (`apps/website/src/features/chats/visual-card.tsx`). A CSP meta locks the document
  down: `default-src 'none'`, inline scripts/styles allowed, `img-src
  data: blob:` only, and a `connect-src` that names two files and nothing else
  (see the allowlist below).
- **CDN allowlist.** Five pinned resources, all on jsdelivr, all at an exact
  version and an exact path — the constants live beside the CSP in
  `visual-card.tsx` and are mirrored in `VisualSandboxDocument.swift`:
  - `visualChartJsUrl` — Chart.js `4.5.1`, the default for any chart with an
    axis; it sizes bars, ticks, and labels better than hand-plotted SVG can,
    while inline SVG stays the answer for sparklines and axis-free marks.
  - `visualD3Url` — D3 `7.9.0`, and `visualTopojsonClientUrl` —
    topojson-client `3.1.0`: the projection and topology pair a map needs.
  - `visualUsAtlasStatesUrl` — us-atlas `3.0.1` `states-10m.json`, and
    `visualWorldAtlasCountriesUrl` — world-atlas `2.0.2`
    `countries-110m.json`: the whole of `connect-src`. A choropleth needs real
    geometry; hand-drawn state or country outlines are always wrong, so the
    fence fetches the topology instead of inventing coordinates.

  Pinning the exact version keeps each entry a single immutable artifact, and
  `connect-src` lists files rather than an origin because it is the fence's
  only outbound channel and the body is attacker-controlled. Adding a sixth
  resource takes four steps: exact version, exact path, a test pin on both
  platforms (`visual-card.test.tsx` and `AgentHtmlTokensTests.swift` assert the
  assembled policy character for character), and a note in
  [ADR 0032](../adr/0032-visual-sandbox-allows-pinned-map-resources.md). A
  version bump is the same decision, and updates the CSP and the visuals skill
  together. An offline app degrades to script-less markup.
- **Theming.** The iframe cannot read app styles, so the host snapshots the
  token list (`apps/website/src/agent-html/tokens.ts`) off computed styles and
  injects it as `:root`, re-snapshotting on theme change. The taught vocabulary
  is 40 role names in eight groups — type, surfaces, text, borders, emphasis,
  status, charts, layout — one name per role, and it is all the skill teaches
  and all the snapshot emits: there is no alias tail. Renaming or removing a
  name is a breaking change, and a stored visual that references a removed name
  must be reauthored. Names resolve through
  `apps/website/src/styles/artifact-tokens.css`, mostly as aliases onto HeroUI
  roles; the exceptions are the text tiers, the categorical `--chart-1..5`
  (global, shared with the app's own usage chart), and the layout group, which
  derives `--radius` from HeroUI's fields tier and the pads and gaps from
  `--spacing`. A few names read a different host role in the snapshot only:
  `--accent-foreground`, `--success-foreground` and `--warning-foreground` take
  HeroUI's `-soft-foreground` values, and `--radius` reads the artifact-owned
  `--radius-control`. Font sizes track the
  app's type scale (14px body), not a frozen value. Generated visuals reference
  only the taught names — never HeroUI names, never hardcoded colors — which is
  what makes them wear Haus's look in both schemes.
- **Native elements.** Bare markup renders native. The sandbox base
  stylesheet styles `<table>` with hairline row dividers, muted cells, a hover
  tint and styled `tfoot`/`caption`, and `input`, `select`, `textarea`,
  `button` and `input[type=range]` on HeroUI's field and outline-button
  metrics, expressed in published tokens. So an agent writes plain HTML and
  gets Haus chrome with no per-visual CSS. The table half of that look is
  mirrored for reply Markdown by `.chat-markdown table` in
  `apps/website/src/styles/default-theme.css`, so the same rows read the same
  whichever half of the message they land in.
- **Presentation.** Prose and visuals render in authored order with three spacing
  units between segments. Attachments render once after the complete message.
  A visual is not a card: the host draws no shell at all — a plain block, a
  transparent iframe, the document's only inset 8px of vertical breathing room
  — capped at the prose measure (`max-w-[46rem]`) and left-aligned with the
  text above it, so the conversation is the container and a tile inside a
  visual reads as a plate on the page rather than a card in a card (ADR 0031).
  A host-owned size reporter measures
  the body height, including changes after load and width changes, so reports
  grow and shrink in normal transcript flow without collapse or a Show all toggle.
  Heights apply immediately, without animation. The host validates the frame
  source and accepts only positive finite measurements, with a 120px minimum
  and a 100,000px resource guard for pathological documents. Until the first
  report it reserves 240px. Ordinary reports have no nested vertical scrolling;
  wide tables retain horizontal overflow. Authors must avoid fixed page heights,
  viewport-height layouts, and vertical scroll containers.
  No pane promotion, and no bridge of any kind (no sendPrompt, no
  postMessage API for model content) — interactivity is within-iframe over
  embedded data.
- **Taste layer.** One seeded `visuals` skill owns everything the agent
  renders — when to render, the visual and artifact fence contracts, and the
  design system and the curated icon assets, written against the published
  token names in `artifact-tokens.css`; DESIGN.md carries the app-side
  reference. The managed prompt keeps a three-line pointer: the surfaces exist
  and the skill is a mandatory read before emitting any fence (ADR 0012). The
  design system's first rule follows the frame: the conversation is the
  container, so a bordered `--surface` card is drawn only for a bounded object,
  never as a wrapper. Skill sources are markdown files under
  `packages/agent-workspace/src/visuals-skill/`.
- **Three reads, not one file.** `references/design-system.md` is the core every
  render reads — philosophy, tokens, layout, typography, streaming,
  accessibility — ending in a routing table to the ONE module for what is being
  made: `charts.md`, `diagrams.md`, `components.md`, `pages.md`, or `icons.md`.
  A module carries rules and an index, and the index points at the ONE file
  under `references/fragments/` to copy. So a chart turn reads the core, one
  module, and one fragment — SKILL.md at 145 lines, the core at 164, charts.md
  at 228, a fragment at 30 to 90 — instead of one file carrying every fence the
  skill ships.
- **Fragments.** One copy-ready `visual` fence body per file, with a few lines
  above it on when to use it and what to change. They carry more of the house
  style than the prose does: a model copies a fragment far more faithfully than
  it follows a rule, so every form the product expects to be asked for has one —
  the chart family from emphasis bar through choropleth, the diagram family, the
  component family. `bun run eval:fragments` renders every one of them through
  the real frame in both schemes, writes a contact sheet under
  `scripts/visuals-eval/output/fragments/`, and fails on a console error or a
  collapsed height. `packages/agent-workspace/src/visuals-fragments.test.ts`
  lints the same fences statically: published tokens only, no hardcoded colors,
  no visible heading but the hidden summary, a bordered box only as a record
  card, and every Chart.js fence holding animation off, its own legend off, and
  formatted ticks and tooltips. `managed-skills.test.ts` pins the other
  direction — every fragment file seeds, and every fragment is reachable from a
  module index. Quality is tuned with the visuals battery (`bun run
  eval:visuals`) and the design battery (`bun run eval:design`,
  `scripts/design-battery/RUBRIC.md`).
- **Series color.** Categorical order is `--chart-1` blue, `--chart-4` violet,
  `--chart-3` green, `--chart-2` red last, with `--chart-5` zinc as the neutral.
  Red enters last because red reads as a verdict; the parts of one whole — a
  stacked share, a donut — are one hue in sequential steps rather than
  categorical hues at all. The tokens themselves pass a colour-vision check;
  the ordering rule is about meaning, not contrast.
- **iOS.** The Haus App on iPhone renders the same fences inline, through a
  Swift port of the same grammar and the same sandbox document — same CSP,
  same base styles, same size reporter, and same natural-height policy — with
  `WKWebView.loadHTMLString(_, baseURL: nil)` standing in for the opaque-origin
  iframe. It has no browser to snapshot tokens off, so the published list is
  resolved from the app's own stylesheets at build time into a checked-in
  table: `bun run gen:ios-tokens` writes
  `apps/ios-swift/Sources/HausUI/Visuals/AgentHtmlTokens.generated.swift`,
  and a bun test fails when the checked-in file drifts from the stylesheets.
  Rerun it after changing the token list or any value it resolves from.
  See [ios.md](ios.md).

## Artifacts

The durable tier: an agent-authored self-contained single-file HTML page
that opens in the artifact pane. Authored as a bare ```` ```artifact ````
fence containing exactly one JSON object:

````markdown
```artifact
{"path":"workbench/report.html","title":"June report"}
```
````

Props are `{ path, title? }`; the path must be workspace-relative with
confined segments and an `.html`/`.htm` extension
(`packages/haus-api/src/widgets/workspace-path.ts`). The transcript
renders a compact card (title, kind, open affordance) and never the page
itself; opening the card focuses the pane's workspace tab, where the pane's
sandboxed HTML preview renders the file with the app's theme tokens injected
as CSS variables. Rendering is live file state — later edits or deletion
change what historical chats display. See [artifacts.md](artifacts.md) for
the authoring contract.

## Contract

Both fences funnel into the widget render envelope. Names map one-to-one to
durable component ids `haus.widget.<name>` where `name` is `visual` or
`artifact`. The stored envelope is:

```ts
{
  component: `haus.widget.${name}`,
  fallback: { text: string },
  props: <validated per name>,
  target: "chat.inline"
}
```

A reply may contain multiple fences; each becomes its own activity in fence
order. An invalid fence (unknown name, malformed JSON, or props that fail
the schema) is stripped from the visible reply and produces no activity; the
prose still delivers. While an assistant is streaming, open `visual` fences
render progressively and `artifact` fences are hidden until the turn
completes.

## Reply composition

The visual and the prose around it split by what each does well. A visual
carries only what text cannot — tiles, a chart, a diagram, a control — and
tables, lists and explanation stay in the reply as Markdown. A `<table>`
inside a visual is for one that needs interaction or belongs to a bounded
record, not for numbers the agent is simply reporting. The visuals skill
(`packages/agent-workspace/src/visuals-skill/SKILL.md`) states the rule and
the order a composed reply takes: visual, a sentence or two on what it shows,
then the detail tables.

Reply Markdown renders through `features/mentions/reference-markdown.tsx` →
HeroUI `Markdown` with `remark-gfm`, so GFM tables work, and that component
wraps every `<table>` in an `overflow-x-auto` scroller — the same thing
`wrapWideTables` does inside the sandbox, so a wide table scrolls instead of
widening the transcript column.

While a message is still streaming, `features/chats/chat-markdown-text.tsx`
renders through its own block parser
(`features/chats/chat-markdown-blocks.ts`) so text can animate in. That parser
recognizes a GFM pipe table once its delimiter row has arrived and its cell
count matches the header — the same gate remark-gfm applies — and hands that
block to `ReferenceMarkdown` un-animated. So a table's DOM is identical before
and after the message settles, rows appear as they stream, and a half-typed
table stays prose rather than flickering through a one-column table.

The iPhone app renders the same reply Markdown natively, so a table reaches an
iOS reader as a table. `RichMessageBlockParser` reads the same block grammar
and gates a pipe table on the same delimiter row, so a half-typed table stays
prose there too; the rows draw in a SwiftUI `Grid` rather than a web view. A
reply may depend on tables, lists, headings, quotes, fenced code, and the
inline marks on both clients. Task lists, footnotes, and syntax highlighting
inside a fence are the remaining gaps — see [ios.md](ios.md).

## Storage

> **Dormant post-flip.** The flip removed per-turn response activities, so
> Computer does not write `widget` activity and no new `widget` Chat rows are
> projected today. Visuals render entirely from message content (see
> **Persistence** above); the activity/row pipeline below describes the
> pre-flip contract that the artifact widget path still assumes, and is
> retained pending the artifacts decision. Do not wire new widgets to it.

The retired standalone service stored each valid fence as response activity:

```ts
kind: "widget"
title: <display name>
metadata: {
  widget: { component, fallback, props, target },
  runtime: { agentId, messageId, runId, sessionKey, source, startedAt }
}
```

Server projects `widget` activity into chat rows with a `widget` payload.
The Website transcript renders that row inline inside the assistant turn.

## Legacy catalog replay

Historical chats contain stored activity for retired catalog widgets
(`haus.widget.table`, `bar-chart`, `line-chart`, `composed-chart`,
`calendar-event`, `calendar-day`, `html-preview`,
`merchbase-sales-chart`). Their props schemas are gone, so both projection
paths degrade them identically: the stored envelope no longer validates, and
the row renders as a fallback card — the envelope's fallback text plus a
visible "Widget unavailable" state. No legacy renderers are kept.

## Ownership

Canonical names, props schemas, and the render envelope live in
`packages/haus-api/src/widgets`. Visuals parse and render on the Website:
`splitVisualFences` (`packages/haus-api/src/widgets/visual`) splits fences
from message content and `assistant-reply-body.tsx` renders the iframe card —
Computer does not parse fences or write `widget` activity. Server still
holds the dormant row projection (`apps/server/src/widgets/widgets.ts`) and
Website the `widget`-row renderers (`apps/website/src/widgets`: artifact card
and fallback card) for the pipeline noted under **Storage**. The pane's HTML
preview and host token injection live with the other pane renderers in
`apps/website/src/features/chats/` (see [artifacts.md](artifacts.md)).
