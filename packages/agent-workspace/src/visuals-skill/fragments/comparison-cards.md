# Comparison cards

Two or three options side by side, one of them recommended. Plates, not cards:
the accent border is the only edge, and it goes on the one option you are
pointing at. Change the names, the one-line summaries, and which card carries
the accent — never give two of them a border.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:15px;font-weight:500">Starter</div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$0 · 1 seat · community support</div>
  </div>
  <div style="background:var(--surface-secondary);border:2px solid var(--accent);border-radius:var(--radius);padding:calc(var(--pad-md) - 2px)">
    <div style="display:flex;align-items:center;gap:var(--gap-xs)">
      <span style="font-size:15px;font-weight:500">Team</span>
      <span style="padding:1px 6px;border-radius:var(--radius);font-size:11px;background:var(--accent-bg);color:var(--accent-foreground)">Recommended</span>
    </div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$24 · 5 seats · shared workspaces</div>
  </div>
</div>
```
