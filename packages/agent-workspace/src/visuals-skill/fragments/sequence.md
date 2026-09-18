# Sequence

Actors across the top, dashed lifelines down, one arrow per message. Returns
are dashed, calls are solid. Hand-drawn, so the viewBox is capped and the font
comes off the `<svg>`.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">A sales question makes one call to Amazon and comes back as rows the visual renders.</h2>
<svg viewBox="0 0 700 222" role="img" aria-label="Agent asks Haus for 30 days of sales, Haus calls Amazon, and the rows come back to the agent" style="font-family:var(--font-sans);width:100%;max-width:700px;height:auto">
  <defs>
    <marker id="seq-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 8 4 0 8z" fill="var(--border-strong)"/>
    </marker>
  </defs>
  <g fill="var(--surface-secondary)">
    <rect x="15" y="0" width="150" height="30" rx="8"/>
    <rect x="275" y="0" width="150" height="30" rx="8"/>
    <rect x="535" y="0" width="150" height="30" rx="8"/>
  </g>
  <g fill="var(--foreground)" font-size="12" text-anchor="middle">
    <text x="90" y="19">Agent</text>
    <text x="350" y="19">Haus</text>
    <text x="610" y="19">Amazon</text>
  </g>
  <g stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4">
    <path d="M90 38V212"/>
    <path d="M350 38V212"/>
    <path d="M610 38V212"/>
  </g>
  <g stroke="var(--border-strong)" stroke-width="1.5" marker-end="url(#seq-head)">
    <path d="M90 78H344"/>
    <path d="M350 118H604"/>
    <path d="M610 158H356" stroke-dasharray="4 4"/>
    <path d="M350 198H96" stroke-dasharray="4 4"/>
  </g>
  <g fill="var(--muted-foreground)" font-size="12" text-anchor="middle">
    <text x="217" y="70">sales, last 30 days</text>
    <text x="480" y="110">GET /orders</text>
    <text x="483" y="150">1,450 units</text>
    <text x="223" y="190">rows and totals</text>
  </g>
</svg>
```
