# KPI row

Plates on the page, not cards on a card: no border, no `--radius-card`.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$102.7K</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">↑ 12.8%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">184</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)">↑ 6.2%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Today</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">—</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--warning-bg);color:var(--warning-foreground)">Not synced yet</span>
  </div>
</div>
```
