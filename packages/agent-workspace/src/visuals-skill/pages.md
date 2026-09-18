# Haus visuals — artifact pages

Read [design-system.md](design-system.md) first. An artifact is a durable
self-contained HTML page, carded in chat and opened in the artifact pane, for
anything the user will keep or iterate on. Everything in the design system
holds; this module covers what changes.

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

## Fragments

### Page skeleton

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>June campaign report</title>
<style>
  body { margin:0; background:var(--background); color:var(--foreground);
    font-family:var(--font-sans); font-size:var(--app-ui-font-size,14px); line-height:1.5; }
  main { max-width:48rem; margin:0 auto; padding:var(--pad-lg); }
  section { margin-bottom:var(--gap-lg); }
  h1 { font-size:20px; font-weight:500; margin:0 0 4px; }
  h2 { font-size:15px; font-weight:500; margin:0 0 var(--gap-sm); }
  .muted { color:var(--muted-foreground); }
  .panel { background:var(--surface); border:1px solid var(--border);
    border-radius:var(--radius-card); padding:var(--pad-lg); }
  table { width:100%; border-collapse:collapse; }
  td, th { padding:8px 12px; border-bottom:1px solid var(--border); text-align:left; }
  th { font-weight:500; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
</style></head>
<body><main>
  <h1>June campaign report</h1>
  <p class="muted">Summer glow '26 · Jun 1–30</p>
  <section class="panel">
    <h2>Spend by channel</h2>
    <table>
      <thead><tr><th>Channel</th><th class="num">Spend</th><th class="num">ROAS</th></tr></thead>
      <tbody>
        <tr><td>Search</td><td class="num">$42,300</td><td class="num">3.1×</td></tr>
        <tr><td>Social</td><td class="num">$18,900</td><td class="num">2.4×</td></tr>
      </tbody>
    </table>
  </section>
</main></body></html>
```
