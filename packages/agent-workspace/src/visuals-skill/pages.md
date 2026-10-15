# Haus visuals — pages

Read [design-system.md](design-system.md) first. A page is a self-contained
HTML file in your workspace, carded in chat and opened in the Workspace pane as
a live view of that file, for a page the user asked for or content too long for
one inline visual. A report, comparison, or set of mockups answered in chat is a
visual, not a page. Everything in the design system
holds; this module covers what changes. The skeleton is
[page](fragments/page.md).

## What changes

- **The page owns its ground.** `--background` on the body, `--surface` panels,
  `--surface-secondary` nested inside them. This is the only surface where you
  set a background — an inline visual never does.
- **No base styles.** A page gets the tokens and nothing else, so it styles its
  own `body`, `table`, and form controls. The inline frame's defaults are not
  there.
- **No network, ever.** Not even the pinned map atlases: a page renders
  offline from its own file. `data:` URIs for small images, charts as inline SVG
  drawn the same way as inline visuals, all data embedded at generation time.
- **Headings come back.** One `<h1>`, then sentence-case section titles at
  15–16px weight 500. The no-headings rule is about inline visuals.
- **Layout.** Prose column about 48rem; tables and dashboards may go full
  width. Operational, not editorial: dense sections, hairline dividers,
  right-aligned numbers, mono for timestamps and ids.
- Write the file under `workbench/`, then reference it with a bare `page`
  fence holding exactly one JSON object.
- The card opens the file live, so it changes when the file does. The Manual
  topic `files` says who can open a page and how to share it with every member
  or keep a version.

## Before shipping the page

- [ ] Opens with no network: no `<script src>`, no remote image, no web font.
- [ ] Every color, radius, pad, and gap is a `var(--…)` from the published list.
- [ ] One `<h1>`; section titles are 15–16px weight 500, sentence case.
- [ ] Numbers rounded, right-aligned, `font-variant-numeric: tabular-nums` in
      columns.
- [ ] Charts are inline SVG with `role="img"` and an `aria-label`.
- [ ] It reads correctly in both schemes — no hardcoded light or dark value.
