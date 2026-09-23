# KPI row

Plates on the page, not cards on a card: no border, no `--radius-card`. Word
every tile by the tile grammar in components.md. This row mixes periods, so
every title names one; a row on one period drops the `· period` suffix. The
four chips are the four you will need: a change that is good, a change that is
bad, a ratio, and a status. The `Today` tile belongs only in an answer about
today. A rate tile (`Conversion · 7d`) changes in `pts`, not percent: `6.5%`
to `6.9%` reads `↑ 0.4 pts vs prior 7d`, never `↑ 6%`.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue · 7d</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$6,630</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">↑ 6.0% vs prior 7d</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns · 7d</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">14</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)">↑ 4 vs prior 7d</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue · MTD</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$14.4K</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--surface-tertiary);color:var(--foreground)">48% of $30K goal</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Today</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">—</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--warning-bg);color:var(--warning-foreground)">Not synced yet</span>
  </div>
</div>
```
