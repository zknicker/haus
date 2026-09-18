# Pipeline

Left to right, one highlighted node, connectors that stop at the edges.

```html
<div style="display:flex;align-items:center;gap:var(--gap-xs);flex-wrap:wrap">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm)">
    <div style="font-weight:500">Build</div>
    <div style="font-size:12px;color:var(--muted-foreground)">2m 10s</div>
  </div>
  <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    <path d="M0 6h22m-5-5 5 5-5 5" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>
  </svg>
  <div style="background:var(--accent-bg);border-radius:var(--radius);padding:var(--pad-sm);color:var(--accent-foreground)">
    <div style="font-weight:500">Test</div>
    <div style="font-size:12px">Running · 41 of 88</div>
  </div>
  <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    <path d="M0 6h22m-5-5 5 5-5 5" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>
  </svg>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm)">
    <div style="font-weight:500">Deploy</div>
    <div style="font-size:12px;color:var(--muted-foreground)">Queued</div>
  </div>
</div>
```
