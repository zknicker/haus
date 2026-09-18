# Page skeleton

The starting shape of an artifact page: its own ground, its own element
styles, one `<h1>`, hairline table rows, right-aligned numbers. Change the
title, the sections, and the rows. Nothing here fetches, so every chart on the
page is inline SVG and every number is embedded at generation time.

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
