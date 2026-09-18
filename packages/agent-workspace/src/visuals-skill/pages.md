# Haus visuals — artifact pages

Read [design-system.md](design-system.md) first. An artifact is a durable
self-contained HTML page, carded in chat and opened in the artifact pane, for
anything the user will keep or iterate on. Everything in the design system
holds; this module covers what changes. The skeleton is
[artifact-page](fragments/artifact-page.md).

## What changes

- **The page owns its ground.** `--background` on the body, `--surface` panels,
  `--surface-secondary` nested inside them. This is the only surface where you
  set a background — an inline visual never does.
- **No base styles.** A page gets the tokens and nothing else, so it styles its
  own `body`, `table`, and form controls. The inline frame's defaults are not
  there.
- **No network, ever.** Not even the Chart.js pin: an artifact renders offline
  from a snapshot. `data:` URIs for small images, charts as inline SVG, all
  data embedded at generation time.
- **Headings come back.** One `<h1>`, then sentence-case section titles at
  15–16px weight 500. The no-headings rule is about inline visuals.
- **Layout.** Prose column about 48rem; tables and dashboards may go full
  width. Operational, not editorial: dense sections, hairline dividers,
  right-aligned numbers, mono for timestamps and ids.
- Write the file under `workbench/`, then reference it with a bare `artifact`
  fence holding exactly one JSON object.

## Before shipping the page

- [ ] Opens with no network: no `<script src>`, no remote image, no web font.
- [ ] Every color, radius, pad, and gap is a `var(--…)` from the published list.
- [ ] One `<h1>`; section titles are 15–16px weight 500, sentence case.
- [ ] Numbers rounded, right-aligned, `font-variant-numeric: tabular-nums` in
      columns.
- [ ] Charts are inline SVG with `role="img"` and an `aria-label`.
- [ ] It reads correctly in both schemes — no hardcoded light or dark value.
