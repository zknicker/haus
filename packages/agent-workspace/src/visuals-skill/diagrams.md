# Haus visuals — diagrams

Read [design-system.md](design-system.md) first; this module adds the node and
connector rules and the copy-ready fragments.

## Nodes and connectors

- A node is a plate: `--surface-secondary`, `--radius`, `--pad-sm`, no border.
  One node at most may be highlighted, and it takes `--accent-bg` with
  `--accent-foreground` text — never a second accent in the same diagram.
- Connectors are `--border-strong` at 1.5px, straight, and they stop at the
  edge of a node, never at its center. Arrowheads are part of the same stroke.
- Direction carries meaning: left to right for a pipeline or sequence, top to
  bottom for a hierarchy or a state machine, top to bottom for a timeline.
- Past about nine nodes a diagram stops being readable. Group into labeled
  clusters, or send the detail to a Markdown table in the reply.
- Status on a node is a dot plus a word, never color alone.

## Hand-drawn SVG

Chart.js owns anything with an axis; a diagram is hand-drawn SVG or plain HTML.
Three things break hand-drawn SVG, so check all three before closing the fence:

- **Text fits.** `chars × budget + 2 × padding ≤ box width`, with 4px minimum
  between text and any edge. Budgets are in design-system.md.
- **The viewBox closes.** The lowest `y + height` plus descenders clears the
  viewBox by 8px, nothing exceeds its width, and connectors stop at edges.
- **Text does not scale.** An `<svg>` at `width: 100%` with a viewBox blows its
  text up on a wide screen. Cap it: `style="width:100%;max-width:700px;height:auto"`,
  and set `font-family: var(--font-sans)` on the `<svg>` so the text inherits
  the app font instead of the browser's serif default.

Plain HTML beats SVG whenever the diagram is rows and boxes — a timeline, an
org chart, a pipeline. Real text in real elements never needs a fitting check.

## Fragments

### Pipeline

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

### Hierarchy

A root over its branches, drawn in CSS so every label stays real text. The rail
reaches the outer branches' centers exactly: with three equal columns those sit
at a sixth and five sixths, so `left` and `right` are `100% / 6`. Two levels of
boxes is the ceiling — the third level is lines inside the branch.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tees are 58% of the 1,450 units sold, and crew necks alone are 42% of the catalog.</h2>
<style>
  .tree { display: flex; justify-content: center; position: relative; }
  .tree::after { content: ''; position: absolute; left: 50%; bottom: -22px; width: 1px; height: 22px; background: var(--border-strong); }
  .kids { display: flex; margin-top: 44px; position: relative; }
  .kids::before { content: ''; position: absolute; top: -22px; left: calc(100% / 6); right: calc(100% / 6); height: 1px; background: var(--border-strong); }
  .kid { position: relative; flex: 1 1 0; min-width: 0; padding: 0 4px; }
  .kid::before { content: ''; position: absolute; top: -22px; left: 50%; width: 1px; height: 22px; background: var(--border-strong); }
  .node { background: var(--surface-secondary); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); }
  .leaf { display: flex; justify-content: space-between; gap: var(--gap-sm); font-size: 12px; color: var(--muted-foreground); margin-top: 2px; }
</style>
<div class="tree">
  <div class="node" style="text-align:center">
    <div style="font-weight:500">All products</div>
    <div style="font-size:12px;color:var(--muted-foreground)">1,450 units · 30 days</div>
  </div>
</div>
<div class="kids">
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Tees · 841</div>
      <div class="leaf"><span>Crew neck</span><span>612</span></div>
      <div class="leaf"><span>V-neck</span><span>229</span></div>
    </div>
  </div>
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Hoodies · 247</div>
      <div class="leaf"><span>Pullover</span><span>180</span></div>
      <div class="leaf"><span>Zip</span><span>67</span></div>
    </div>
  </div>
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Other · 362</div>
      <div class="leaf"><span>Tanks</span><span>160</span></div>
      <div class="leaf"><span>Mugs and totes</span><span>202</span></div>
    </div>
  </div>
</div>
```

### Sequence

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

### Timeline

Top to bottom, one rail, one dot per event. Plain HTML, so the times and titles
are real text at real sizes and a long line simply wraps.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The September sync ran clean until the 10pm metadata pass, which has not landed since.</h2>
<div style="display:grid;gap:var(--gap-md)">
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 12</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--chart-5)"></span>
      <span style="position:absolute;left:6.5px;top:11px;bottom:-22px;width:1px;background:var(--border)"></span>
    </div>
    <div>
      <div style="font-weight:500">Royalty report imported</div>
      <div style="font-size:12px;color:var(--muted-foreground)">1,450 rows, 30 days</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 14</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--success)"></span>
      <span style="position:absolute;left:6.5px;top:11px;bottom:-22px;width:1px;background:var(--border)"></span>
    </div>
    <div>
      <div style="font-weight:500">Sales feed caught up</div>
      <div style="font-size:12px;color:var(--muted-foreground)">$750 on 39 units, 4 returned</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 14, 10pm</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--warning)"></span>
    </div>
    <div>
      <div style="font-weight:500">Metadata sync stalled</div>
      <div style="font-size:12px;color:var(--muted-foreground)">Last successful pass 10:06pm; today's feed has not landed</div>
    </div>
  </div>
</div>
```

### State machine

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
