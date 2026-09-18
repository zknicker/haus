# Tile with sparkline

The same plate with the shape behind the number, for when the row has to answer
a trend question on its own. The sparkline is decoration for a screen reader —
the tile's words already carry the value.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$12.4K</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,22 10,19 20,23 30,16 40,18 50,12 60,14 70,9 80,11 90,7 100,9 110,5 120,3" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Units, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">684</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,12 10,14 20,11 30,15 40,13 50,17 60,15 70,19 80,17 90,20 100,18 110,22 120,21" fill="none" stroke="var(--chart-5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">61</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,18 10,17 20,19 30,16 40,18 50,15 60,17 70,14 80,16 90,13 100,15 110,12 120,14" fill="none" stroke="var(--chart-5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
</div>
```
