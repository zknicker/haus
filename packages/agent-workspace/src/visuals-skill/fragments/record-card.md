# Record card

The one bordered card: a single bounded object. Border `--border`, fill
`--surface`, corner `--radius-card`. Mono for the id, hairline rows for the
fields, a status chip that carries a word.

```html
<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--pad-lg)">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--gap-sm)">
    <div style="min-width:0">
      <div style="font-size:16px;font-weight:500">That's My Grandson Out There Baseball Grandma</div>
      <div style="margin-top:2px;font-size:12px;color:var(--muted-foreground);font-family:var(--font-mono)">B082Z184NZ · US</div>
    </div>
    <span style="flex:0 0 auto;padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">Live</span>
  </div>
  <div style="margin-top:var(--pad-md);display:grid;gap:var(--gap-xs)">
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">List price</span>
      <span style="font-variant-numeric:tabular-nums">$21.99</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Royalty per unit</span>
      <span style="font-variant-numeric:tabular-nums">$4.18</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Units · 7d</span>
      <span style="font-variant-numeric:tabular-nums">11</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Revenue · 7d</span>
      <span style="font-variant-numeric:tabular-nums">$234</span>
    </div>
  </div>
</div>
```
