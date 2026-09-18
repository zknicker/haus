# State machine

States across the top in order, branches below, one highlighted state. Every
edge is labeled — an unlabeled transition is a guess.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">An order moves pending to printing to shipped to delivered, and can leave the path as cancelled or returned.</h2>
<svg viewBox="0 0 700 206" role="img" aria-label="Order states: pending, printing, shipped, delivered, with cancelled and returned as exits" style="font-family:var(--font-sans);width:100%;max-width:700px;height:auto">
  <defs>
    <marker id="state-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 8 4 0 8z" fill="var(--border-strong)"/>
    </marker>
  </defs>
  <g fill="var(--surface-secondary)">
    <rect x="15" y="26" width="130" height="34" rx="9"/>
    <rect x="185" y="26" width="130" height="34" rx="9"/>
    <rect x="525" y="26" width="130" height="34" rx="9"/>
    <rect x="15" y="150" width="130" height="34" rx="9"/>
    <rect x="525" y="150" width="130" height="34" rx="9"/>
  </g>
  <rect x="355" y="26" width="130" height="34" rx="9" fill="var(--accent-bg)"/>
  <g font-size="13" text-anchor="middle">
    <text x="80" y="48" fill="var(--foreground)">Pending</text>
    <text x="250" y="48" fill="var(--foreground)">Printing</text>
    <text x="420" y="48" fill="var(--accent-foreground)">Shipped</text>
    <text x="590" y="48" fill="var(--foreground)">Delivered</text>
    <text x="80" y="172" fill="var(--muted-foreground)">Cancelled</text>
    <text x="590" y="172" fill="var(--muted-foreground)">Returned</text>
  </g>
  <g stroke="var(--border-strong)" stroke-width="1.5" fill="none" marker-end="url(#state-head)">
    <path d="M145 43h34"/>
    <path d="M315 43h34"/>
    <path d="M485 43h34"/>
    <path d="M80 60v84"/>
    <path d="M590 60v84"/>
  </g>
  <g fill="var(--muted-foreground)" font-size="11" text-anchor="middle">
    <text x="162" y="33">sent</text>
    <text x="332" y="33">label</text>
    <text x="502" y="33">scan</text>
  </g>
  <g fill="var(--muted-foreground)" font-size="11">
    <text x="90" y="106">buyer cancels</text>
    <text x="600" y="106">return filed</text>
  </g>
</svg>
```
